import { NextRequest, NextResponse } from 'next/server';
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
const SMART_MODEL_TIMEOUT_MS = 45_000; // Longer timeout for background smart model
const MAX_INPUT_CHARS = 2000;
const CONTEXT_WINDOW_TOKENS = 16_000;

const SYSTEM_PROMPT = `You are NexusAI, an intelligent AI assistant optimized for fast, accurate, and practical responses.

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

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** Call a model with streaming — returns the stream object. */
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

  // Link external signal
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const stream = await groq.chat.completions.create(
      {
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        stream: true,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      },
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    return stream;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/** Call a model NON-streaming — returns full response text (for parallel smart model). */
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
      {
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        stream: false,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      },
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    return response.choices[0]?.message?.content || null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/** Replay cached content as chunks with typing delay. */
async function replayCachedContent(
  content: string,
  streamCtrl: ReadableStreamDefaultController
): Promise<void> {
  const CHUNK_SIZE = 24;
  const DELAY_MS = 25;
  for (let i = 0; i < content.length; i += CHUNK_SIZE) {
    const chunk = content.slice(i, i + CHUNK_SIZE);
    streamCtrl.enqueue(encodeEvent(createChunkEvent(chunk)));
    if (i + CHUNK_SIZE < content.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  POST /api/chat  (Guest endpoint)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(request: NextRequest) {
  // ── 1. Per-IP rate limiting ──
  const clientIP = getClientIP(request);
  const rl = checkRateLimit(clientIP, false);
  if (!rl.allowed) {
    const waitSec = Math.ceil((rl.resetAt - Date.now()) / 1000);
    trackEvent('rate_limit', undefined, { errorMessage: `IP: ${clientIP}` }).catch(() => {});
    return NextResponse.json(
      { error: `Rate limited. Wait ${waitSec}s.`, retryAfter: waitSec, code: 'RATE_LIMITED' },
      { status: 429 }
    );
  }

  // ── 2. Input validation ──
  let body: { messages?: unknown[]; model?: string; systemPrompt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.', code: 'INVALID_REQUEST' },
      { status: 400 }
    );
  }

  const { messages, model: requestedModel, systemPrompt: customSystemPrompt } = body;

  // Validate custom system prompt length
  if (customSystemPrompt && customSystemPrompt.trim().length > 4000) {
    return NextResponse.json(
      { error: 'Custom system prompt too long (max 4000 chars).', code: 'INVALID_REQUEST' },
      { status: 400 }
    );
  }

  // Use custom system prompt if provided, otherwise use default
  const activeSystemPrompt = customSystemPrompt?.trim() || SYSTEM_PROMPT;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: 'Messages array is required.', code: 'INVALID_REQUEST' },
      { status: 400 }
    );
  }

  const ALLOWED_ROLES = ['user', 'assistant'];
  for (const m of messages) {
    if (typeof m !== 'object' || m === null || typeof m.role !== 'string' || typeof m.content !== 'string') {
      return NextResponse.json({ error: 'Invalid message format.', code: 'INVALID_REQUEST' }, { status: 400 });
    }
    if (!ALLOWED_ROLES.includes(m.role as string)) {
      return NextResponse.json({ error: 'Invalid message role. Only user and assistant allowed.', code: 'INVALID_REQUEST' }, { status: 400 });
    }
    if ((m.content as string).length > MAX_INPUT_CHARS) {
      return NextResponse.json(
        { error: `Message too long (${(m.content as string).length}/${MAX_INPUT_CHARS}).`, code: 'INPUT_TOO_LONG' },
        { status: 400 }
      );
    }
  }

  // ── 3. Query classification ──
  const lastUserMsg = [...messages].reverse().find((m) => (m as any).role === 'user') as { content: string } | undefined;
  const queryType: QueryType = lastUserMsg ? classifyQuery(lastUserMsg.content) : 'general';
  const userSelected = requestedModel ? String(requestedModel) : null;

  // ── 4. Token-based context trimming ──
  const sysTokens = getSystemPromptTokens(activeSystemPrompt);
  const trimmedMessages = trimMessagesToFit(
    messages.map((m: any) => ({ role: m.role, content: m.content })),
    { maxTokens: CONTEXT_WINDOW_TOKENS, systemPromptTokens: sysTokens, reserveForResponse: 500 }
  );

  const groq = getGroqClient();
  const startTime = Date.now();

  // ── 5. Check cache ──
  const cacheKey = lastUserMsg ? simpleHash(lastUserMsg.content) : '';
  const cached = cacheKey ? queryCache.get(cacheKey) : null;

  // ── 6. Build streaming response ──
  const readable = new ReadableStream({
    async start(streamCtrl) {
      let finalContent = '';
      let usedModel = '';

      try {
        // INSTANT feedback — before any model call
        streamCtrl.enqueue(encodeEvent(createThinkingEvent()));

        // ── Cache hit: replay instantly ──
        if (cached) {
          await replayCachedContent(cached, streamCtrl);
          finalContent = cached;
          usedModel = 'cache';
          streamCtrl.enqueue(encodeEvent(createDoneEvent('cache')));
          trackEvent('model_usage', undefined, { model: 'cache', queryType, responseTimeMs: Date.now() - startTime }).catch(() => {});
          return;
        }

        // ── Decide strategy ──
        const useParallel = shouldUseParallel(userSelected, queryType);

        if (useParallel) {
          // ━━ PARALLEL STRATEGY: fast + smart concurrently ━━
          const [fastModelId, smartModelId] = getParallelModels(queryType);

          // Start smart model in background (non-streaming, full response)
          const smartPromise = callModelNonStreaming(groq, smartModelId, trimmedMessages, activeSystemPrompt, queryType);

          // Stream fast model to user immediately
          let fastContent = '';
          let fastSucceeded = false;
          try {
            const fastStream = await callModelStreaming(groq, fastModelId, trimmedMessages, activeSystemPrompt, queryType, FAST_MODEL_TIMEOUT_MS);
            for await (const chunk of fastStream) {
              const delta = chunk.choices[0]?.delta?.content || '';
              if (delta) {
                fastContent += delta;
                streamCtrl.enqueue(encodeEvent(createChunkEvent(delta)));
              }
            }
            fastSucceeded = true;
          } catch {
            // Fast model failed — wait for smart
          }

          // Wait for smart model
          const smartContent = await smartPromise;

          if (smartContent && smartContent.trim()) {
            // ── UPGRADE: replace with better response ──
            streamCtrl.enqueue(encodeEvent(createUpgradeEvent(smartContent)));
            finalContent = smartContent;
            usedModel = smartModelId;
          } else if (fastContent && fastContent.trim()) {
            finalContent = fastContent;
            usedModel = fastModelId;
          }

          // Cache the best result
          if (finalContent && cacheKey) {
            queryCache.set(cacheKey, finalContent);
          }

          // FIX: Check for empty content in parallel path (was missing — caused blank responses)
          if (finalContent) {
            streamCtrl.enqueue(encodeEvent(createDoneEvent(usedModel)));
          } else {
            streamCtrl.enqueue(encodeEvent(createErrorEvent('All models busy. Try again.', 'ALL_MODELS_BUSY')));
          }
        } else {
          // ━━ SINGLE MODEL with fallback chain ━━
          const modelsToTry = getModelsToTry(userSelected, queryType);

          for (let i = 0; i < modelsToTry.length; i++) {
            const modelId = modelsToTry[i];

            try {
              const aiStream = await callModelStreaming(groq, modelId, trimmedMessages, activeSystemPrompt, queryType, REQUEST_TIMEOUT_MS);

              for await (const chunk of aiStream) {
                const delta = chunk.choices[0]?.delta?.content || '';
                if (delta) {
                  finalContent += delta;
                  streamCtrl.enqueue(encodeEvent(createChunkEvent(delta)));
                }
              }

              usedModel = modelId;

              // Cache result
              if (finalContent && cacheKey) {
                queryCache.set(cacheKey, finalContent);
              }

              streamCtrl.enqueue(encodeEvent(createDoneEvent(modelId)));
              break; // Success — exit fallback loop
            } catch (error: any) {
              const errMsg = error?.message || '';
              const status = error?.status || 0;
              const isRateLimit = status === 429 || errMsg.includes('rate') || errMsg.includes('limit');
              const isTimeout = error?.name === 'AbortError' || errMsg.includes('timeout');

              if (isRateLimit) {
                trackEvent('rate_limit', undefined, { model: modelId, errorMessage: 'API rate limit' }).catch(() => {});
                streamCtrl.enqueue(encodeEvent(createErrorEvent(`Rate limited. Wait 60s.`, 'API_RATE_LIMITED')));
                break;
              }

              console.error(`[Fallback] ${modelId} failed: ${isTimeout ? 'TIMEOUT' : errMsg.slice(0, 200)}`);
              trackEvent('model_error', undefined, { model: modelId, queryType, errorMessage: isTimeout ? 'Timeout' : errMsg.slice(0, 200) }).catch(() => {});

              if (i < modelsToTry.length - 1) {
                streamCtrl.enqueue(encodeEvent(createModelSwitchEvent(modelId, modelsToTry[i + 1], isTimeout ? 'Timeout' : 'Error')));
              }
              continue;
            }
          }

          if (!finalContent) {
            streamCtrl.enqueue(encodeEvent(createErrorEvent('All models busy. Try again.', 'ALL_MODELS_BUSY')));
          }
        }
      } catch (err) {
        if (finalContent) {
          streamCtrl.enqueue(encodeEvent(createDoneEvent(usedModel)));
        } else {
          streamCtrl.enqueue(encodeEvent(createErrorEvent('Stream error.', 'STREAM_ERROR')));
        }
      } finally {
        trackEvent('model_usage', undefined, { model: usedModel, queryType, responseTimeMs: Date.now() - startTime, estimatedTokens: estimateTokens(finalContent) }).catch(() => {});
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
    },
  });
}
