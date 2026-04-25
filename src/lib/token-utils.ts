// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Token Estimation & Context Trimming
//  Uses a rough ~4 chars/token heuristic for English text.
//  No external tokenizer dependency — fast and zero-cost.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Rough token count: ~4 characters per token for English. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Estimate tokens consumed by the system prompt. */
export function getSystemPromptTokens(systemPrompt: string): number {
  return estimateTokens(systemPrompt);
}

// ── Context trimming ──

interface ContextTrimOptions {
  /** Total context window in tokens (model's max context minus safety margin) */
  maxTokens: number;
  /** Tokens consumed by the system prompt */
  systemPromptTokens: number;
  /** Tokens to reserve for the model's response */
  reserveForResponse: number;
}

/**
 * Trim a message array to fit within the context budget.
 * Strategy: keep the most recent messages first. Always include at least
 * the very last message (trimmed if necessary).
 */
export function trimMessagesToFit(
  messages: Array<{ role: string; content: string }>,
  options: ContextTrimOptions
): Array<{ role: string; content: string }> {
  const availableTokens =
    options.maxTokens - options.systemPromptTokens - options.reserveForResponse;

  if (availableTokens <= 0) return [];

  // Pre-compute token counts
  const withTokens = messages.map((m) => ({
    role: m.role,
    content: m.content,
    tokens: estimateTokens(m.content),
  }));

  const result: Array<{ role: string; content: string }> = [];
  let usedTokens = 0;

  // Walk backwards (most recent first) and include what fits
  for (let i = withTokens.length - 1; i >= 0; i--) {
    const msg = withTokens[i];

    if (usedTokens + msg.tokens <= availableTokens) {
      result.unshift({ role: msg.role, content: msg.content });
      usedTokens += msg.tokens;
    } else if (result.length === 0) {
      // Always keep at least the last message — trim it to fit
      const maxChars = availableTokens * 4;
      result.unshift({ role: msg.role, content: msg.content.slice(0, maxChars) });
      break;
    } else {
      break;
    }
  }

  return result;
}

/** Total tokens that would be consumed by a messages array. */
export function messagesTokenCount(
  messages: Array<{ content: string }>
): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}
