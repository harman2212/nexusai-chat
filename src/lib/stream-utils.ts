// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Structured Streaming Utilities (NDJSON protocol)
//
//  Each line sent over the stream is a JSON object ending with \n.
//  Event types:
//    { type: "thinking" }                        — AI is processing (instant feedback)
//    { type: "chunk", content: "..." }            — text delta
//    { type: "upgrade", content: "..." }          — better response from parallel model
//    { type: "done", model: "..." }               — stream completed
//    { type: "error", message: "...", code: "" }  — error occurred
//    { type: "model_switch", from, to, reason }   — fallback notification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface StreamEvent {
  type: 'thinking' | 'chunk' | 'upgrade' | 'done' | 'error' | 'model_switch';
  content?: string;
  model?: string;
  from?: string;
  to?: string;
  reason?: string;
  message?: string;
  code?: string;
}

const encoder = new TextEncoder();

/** Serialize a StreamEvent to a Uint8Array (NDJSON line). */
export function encodeEvent(event: StreamEvent): Uint8Array {
  return encoder.encode(JSON.stringify(event) + '\n');
}

// ── Event factories ──

export function createThinkingEvent(): StreamEvent {
  return { type: 'thinking' };
}

export function createChunkEvent(content: string): StreamEvent {
  return { type: 'chunk', content };
}

export function createUpgradeEvent(content: string): StreamEvent {
  return { type: 'upgrade', content };
}

export function createDoneEvent(model: string): StreamEvent {
  return { type: 'done', model };
}

export function createErrorEvent(message: string, code: string): StreamEvent {
  return { type: 'error', message, code };
}

export function createModelSwitchEvent(
  from: string,
  to: string,
  reason: string
): StreamEvent {
  return { type: 'model_switch', from, to, reason };
}
