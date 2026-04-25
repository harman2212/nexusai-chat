import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-helper';
import Groq from 'groq-sdk';

import {
  classifyQuery,
  chooseModel,
  getModelsToTry,
  getModelConfig,
  getParallelModels,
  shouldUseParallel,
  type QueryType,
} from '@/lib/model-router';
import { checkRateLimit } from '@/lib/rate-limiter';
import {
  trimMessagesToFit,
  estimateTokens,
  getSystemPromptTokens,
} from '@/lib/token-utils';
import {
  encodeEvent,
  createThinkingEvent,
  createChunkEvent,
  createUpgradeEvent,
  createDoneEvent,
  createErrorEvent,
  createModelSwitchEvent,
} from '@/lib/stream-utils';
import { queryCache, simpleHash } from '@/lib/query-cache';
import { trackEvent } from '@/lib/analytics';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const REQUEST_TIMEOUT_MS = 30_000; // Increased from 15s — code/reasoning models need more time to generate first token
const FAST_MODEL_TIMEOUT_MS = 20_000; // Timeout for fast model in parallel strategy
const SMART_MODEL_TIMEOUT_MS = 45_000;
const MAX_INPUT_CHARS = 2000;
const CONTEXT_WINDOW_TOKENS = 16_000;

const DEFAULT_SYSTEM_PROMPT = `You are NexusAI, an intelligent AI assistant optimized for fast, accurate, and practical responses.

CORE RULES:
- Be direct — lead with the answer, then explain if needed
- For CODE: Output complete, working code in markdown code blocks. Include language tag. Brief explanation only (2-3 sentences). Never truncate code.
- For QUESTIONS: Use structured formatting — headings, bullet points, numbered steps
- For ANALYSIS: Be thorough but concise. Prioritize actionable insights.
- Always complete your response — never cut off mid-sentence or mid-code-block
- Use markdown formatting for readability

IMPORTANT:
- If you don't know something, say so honestly rather than guessing
- For follow-up code changes, provide the complete updated code, not just diffs
- Match the user's language and communication style`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === '' || apiKey.startsWith('gsk_your')) {
    throw new Error('GROQ_API_KEY is not configured.');
  }
  return new Groq({ apiKey });
}

async function callModelStreaming(
  groq: Groq,
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  queryType: QueryType,
  timeoutMs: number,
  signal?: AbortSignal
) {
  const config = getModelConfig(modelId, queryType);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort());
  try {
    const stream = await groq.chat.completions.create(
      { model: config.model, max_tokens: config.maxTokens, temperature: config.temperature, stream: true, messages: [{ role: 'system', content: systemPrompt }, ...messages] },
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    return stream;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function callModelNonStreaming(
  groq: Groq,
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  queryType: QueryType
): Promise<string | null> {
  const config = getModelConfig(modelId, queryType);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SMART_MODEL_TIMEOUT_MS);
  try {
    const response = await groq.chat.completions.create(
      { model: config.model, max_tokens: config.maxTokens, temperature: config.temperature, stream: false, messages: [{ role: 'system', content: systemPrompt }, ...messages] },
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    return response.choices[0]?.message?.content || null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

async function replayCachedContent(content: string, streamCtrl: ReadableStreamDefaultController): Promise<void> {
  const CHUNK_SIZE = 24;
  const DELAY_MS = 25;
  for (let i = 0; i < content.length; i += CHUNK_SIZE) {
    const chunk = content.slice(i, i + CHUNK_SIZE);
    streamCtrl.enqueue(encodeEvent(createChunkEvent(chunk)));
    if (i + CHUNK_SIZE < content.length) await new Promise((r) => setTimeout(r, DELAY_MS));
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  POST /api/conversations/[id]/messages  (Auth required)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── 1. Auth check ──
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized.', code: 'UNAUTHORIZED' }, { status: 401 });
  }
  const userId = session.user.id;

  // ── 2. Per-user rate limiting ──
  const rl = checkRateLimit(userId, true);
  if (!rl.allowed) {
    const waitSec = Math.ceil((rl.resetAt - Date.now()) / 1000);
    trackEvent('rate_limit', userId, {}).catch(() => {});
    return NextResponse.json({ error: `Rate limited. Wait ${waitSec}s.`, retryAfter: waitSec, code: 'RATE_LIMITED' }, { status: 429 });
  }

  // ── 3. Input validation ──
  const { id } = await params;
  let body: { content?: string; model?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body.', code: 'INVALID_REQUEST' }, { status: 400 });
  }
  const { content, model: requestedModel } = body;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'Message content is required.', code: 'INVALID_REQUEST' }, { status: 400 });
  }
  const trimmedContent = content.trim();
  if (trimmedContent.length > MAX_INPUT_CHARS) {
    return NextResponse.json({ error: `Message too long (${trimmedContent.length}/${MAX_INPUT_CHARS}).`, code: 'INPUT_TOO_LONG' }, { status: 400 });
  }

  // ── 4. Load conversation ──
  const conversation = await db.conversation.findFirst({
    where: { id, userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found.', code: 'NOT_FOUND' }, { status: 404 });
  }

  // ── 5. Save user message + auto-title ──
  await db.message.create({ data: { role: 'user', content: trimmedContent, conversationId: id } });

  let updatedTitle: string | null = null;
  if (conversation.messages.length === 0) {
    updatedTitle = trimmedContent.length > 30 ? trimmedContent.substring(0, 30) + '...' : trimmedContent;
    await db.conversation.update({ where: { id }, data: { title: updatedTitle, updatedAt: new Date() } });
  } else {
    await db.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
  }

  // ── 6. Query classification + model selection ──
  const queryType: QueryType = classifyQuery(trimmedContent);
  const userSelected = requestedModel || null;

  // ── 7. Token-based context trimming ──
  const systemPrompt = conversation.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const sysTokens = getSystemPromptTokens(systemPrompt);
  const allMessages = [
    ...conversation.messages.map((m) => ({ role: m.role as string, content: m.content })),
    { role: 'user' as string, content: trimmedContent },
  ];
  const trimmedMessages = trimMessagesToFit(allMessages, { maxTokens: CONTEXT_WINDOW_TOKENS, systemPromptTokens: sysTokens, reserveForResponse: 500 });

  const groq = getGroqClient();
  const startTime = Date.now();

  // ── 8. Cache check ──
  const cacheKey = simpleHash(trimmedContent);
  const cached = queryCache.get(cacheKey);

  // ── 9. Build streaming response ──
  const readable = new ReadableStream({
    async start(streamCtrl) {
      let finalContent = '';
      let usedModel = '';

      try {
        streamCtrl.enqueue(encodeEvent(createThinkingEvent()));

        if (cached) {
          await replayCachedContent(cached, streamCtrl);
          finalContent = cached;
          usedModel = 'cache';
          streamCtrl.enqueue(encodeEvent(createDoneEvent('cache')));
          // Save to DB
          if (finalContent) try { await db.message.create({ data: { role: 'assistant', content: finalContent, conversationId: id } }); } catch {}
          trackEvent('model_usage', userId, { model: 'cache', queryType, responseTimeMs: Date.now() - startTime }).catch(() => {});
          return;
        }

        const useParallel = shouldUseParallel(userSelected, queryType);

        if (useParallel) {
          // ━━ PARALLEL ━━
          const [fastModelId, smartModelId] = getParallelModels(queryType);
          const smartPromise = callModelNonStreaming(groq, smartModelId, trimmedMessages, systemPrompt, queryType);

          let fastContent = '';
          try {
            const fastStream = await callModelStreaming(groq, fastModelId, trimmedMessages, systemPrompt, queryType, FAST_MODEL_TIMEOUT_MS);
            for await (const chunk of fastStream) {
              const delta = chunk.choices[0]?.delta?.content || '';
              if (delta) { fastContent += delta; streamCtrl.enqueue(encodeEvent(createChunkEvent(delta))); }
            }
          } catch {}

          const smartContent = await smartPromise;
          if (smartContent && smartContent.trim()) {
            streamCtrl.enqueue(encodeEvent(createUpgradeEvent(smartContent)));
            finalContent = smartContent;
            usedModel = smartModelId;
          } else if (fastContent && fastContent.trim()) {
            finalContent = fastContent;
            usedModel = fastModelId;
          }
          if (finalContent && cacheKey) queryCache.set(cacheKey, finalContent);
          // FIX: Check for empty content in parallel path (was missing — caused blank responses)
          if (finalContent) {
            streamCtrl.enqueue(encodeEvent(createDoneEvent(usedModel)));
          } else {
            streamCtrl.enqueue(encodeEvent(createErrorEvent('All models busy. Try again.', 'ALL_MODELS_BUSY')));
          }
        } else {
          // ━━ SINGLE + FALLBACK ━━
          const modelsToTry = getModelsToTry(userSelected, queryType);
          for (let i = 0; i < modelsToTry.length; i++) {
            const modelId = modelsToTry[i];
            try {
              const aiStream = await callModelStreaming(groq, modelId, trimmedMessages, systemPrompt, queryType, REQUEST_TIMEOUT_MS);
              for await (const chunk of aiStream) {
                const delta = chunk.choices[0]?.delta?.content || '';
                if (delta) { finalContent += delta; streamCtrl.enqueue(encodeEvent(createChunkEvent(delta))); }
              }
              usedModel = modelId;
              if (finalContent && cacheKey) queryCache.set(cacheKey, finalContent);
              streamCtrl.enqueue(encodeEvent(createDoneEvent(modelId)));
              break;
            } catch (error: any) {
              const errMsg = error?.message || '';
              const status = error?.status || 0;
              const isRateLimit = status === 429 || errMsg.includes('rate') || errMsg.includes('limit');
              if (isRateLimit) {
                streamCtrl.enqueue(encodeEvent(createErrorEvent('Rate limited. Wait 60s.', 'API_RATE_LIMITED')));
                break;
              }
              console.error(`[Conv Fallback] ${modelId} failed: ${errMsg.slice(0, 200)}`);
              if (i < modelsToTry.length - 1) streamCtrl.enqueue(encodeEvent(createModelSwitchEvent(modelId, modelsToTry[i + 1], 'Error')));
              continue;
            }
          }
          if (!finalContent) streamCtrl.enqueue(encodeEvent(createErrorEvent('All models busy.', 'ALL_MODELS_BUSY')));
        }
      } catch {
        if (finalContent) streamCtrl.enqueue(encodeEvent(createDoneEvent(usedModel)));
        else streamCtrl.enqueue(encodeEvent(createErrorEvent('Stream error.', 'STREAM_ERROR')));
      } finally {
        // ── Save assistant message to DB ──
        if (finalContent) try { await db.message.create({ data: { role: 'assistant', content: finalContent, conversationId: id } }); } catch {}
        trackEvent('model_usage', userId, { model: usedModel, queryType, responseTimeMs: Date.now() - startTime, estimatedTokens: estimateTokens(finalContent) }).catch(() => {});
        streamCtrl.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Model': 'streaming',
      'X-Title': updatedTitle || '',
    },
  });
}
