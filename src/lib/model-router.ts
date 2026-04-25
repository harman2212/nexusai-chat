// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Intelligent Model Router
//  - Classifies user queries (code / reasoning / general)
//  - Selects optimal model and token budget
//  - Provides ordered fallback chain
//  - Supports parallel model strategy (fast + smart)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type QueryType = 'code' | 'reasoning' | 'general';

export interface ModelConfig {
  model: string;
  maxTokens: number;
  temperature: number;
}

// ── Model configurations ──
const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'llama-3.3-70b-versatile': { model: 'llama-3.3-70b-versatile', maxTokens: 2048, temperature: 0.7 },
  'mixtral-8x7b-32768':     { model: 'mixtral-8x7b-32768',     maxTokens: 2048, temperature: 0.5 },
  'gemma2-9b-it':            { model: 'gemma2-9b-it',            maxTokens: 1024, temperature: 0.7 },
  'llama-3.1-8b-instant':   { model: 'llama-3.1-8b-instant',   maxTokens: 800,  temperature: 0.7 },
};

// Fallback priority: smartest → most reliable
const FALLBACK_CHAIN = [
  'llama-3.3-70b-versatile',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
  'llama-3.1-8b-instant',
];

// ── Keyword banks ──
const CODE_KEYWORDS = [
  'code', 'function', 'class', 'implement', 'build', 'create a', 'write a',
  'debug', 'fix', 'bug', 'error', 'syntax', 'compile', 'run', 'script',
  'program', 'algorithm', 'api', 'component', 'html', 'css', 'javascript',
  'python', 'java', 'react', 'node', 'sql', 'database', 'typescript',
  'rust', 'golang', 'swift', 'kotlin', 'flutter', 'docker', 'git',
  'redux', 'hook', 'import', 'export', 'async', 'await', 'promise',
  'array', 'object', 'loop', 'recursive', 'regex', 'json', 'xml', 'yaml',
  'rest', 'graphql', 'endpoint', 'middleware', 'schema', 'migration',
  'refactor', 'optimize', 'unit test', 'integration test', 'deploy',
  // FIX: Added more code-related keywords to catch simple queries like "fix this", "how to code"
  'coding', 'developer', 'software', 'variable', 'method', 'return',
  'try catch', 'callback', 'interface', 'type', 'boolean', 'string',
  'integer', 'stack', 'queue', 'hash', 'binary', 'sort', 'search',
  'server', 'client', 'request', 'response', 'framework', 'library',
  'package', 'module', 'app', 'frontend', 'backend', 'dev', 'testing',
  'console.log', 'print', 'echo', 'cout', 'printf',
];

const REASONING_KEYWORDS = [
  'explain', 'why', 'how does', 'compare', 'analyze', 'evaluate', 'critique',
  'pros and cons', 'trade-off', 'complex', 'detailed', 'comprehensive',
  'in-depth', 'thorough', 'reasoning', 'logic', 'derive', 'prove', 'theory',
  'architecture', 'design pattern', 'strategy', 'approach', 'methodology',
  'step by step', 'walkthrough', 'tutorial', 'guide',
  'what is the difference', 'relationship between', 'impact of',
  'implications', 'break down', 'elaborate', 'summarize',
  'advantages', 'disadvantages', 'limitations', 'use cases', 'best practice',
];

// ── Classification ──

export function classifyQuery(input: string): QueryType {
  const lower = input.toLowerCase();

  const codeScore = CODE_KEYWORDS.filter((k) => lower.includes(k)).length;
  const reasoningScore = REASONING_KEYWORDS.filter((k) => lower.includes(k)).length;

  const hasCodeBlock = input.includes('```') || input.includes('fn ') || input.includes('def ') || input.includes('const ') || input.includes('function ') || input.includes('let ') || input.includes('var ') || input.includes('=>');

  // FIX: Lower threshold from 2 to 1 for code detection — catches single-keyword queries like "fix this" or "write code"
  if (codeScore >= 1 || hasCodeBlock) return 'code';
  if (reasoningScore >= 2) return 'reasoning';
  if (codeScore > reasoningScore && codeScore > 0) return 'code';
  if (reasoningScore > codeScore && reasoningScore > 0) return 'reasoning';
  if (input.length > 200) return 'reasoning';

  return 'general';
}

// ── Model selection (aggressive — prefer speed) ──

export function chooseModel(queryType: QueryType): string {
  switch (queryType) {
    case 'code':     return 'mixtral-8x7b-32768';   // Best for code
    case 'reasoning': return 'llama-3.3-70b-versatile'; // Best for reasoning
    default:          return 'gemma2-9b-it';           // Fast & balanced for general
  }
}

// ── Dynamic max_tokens ──

export function getMaxTokens(queryType: QueryType): number {
  switch (queryType) {
    case 'code':     return 2048;
    case 'reasoning': return 1536;
    default:          return 1024;
  }
}

// ── Fallback chain builder ──

export function getModelsToTry(
  userSelected: string | null,
  queryType: QueryType
): string[] {
  if (userSelected && userSelected !== 'auto') {
    return [userSelected, ...FALLBACK_CHAIN.filter((m) => m !== userSelected)];
  }

  const bestModel = chooseModel(queryType);
  return [bestModel, ...FALLBACK_CHAIN.filter((m) => m !== bestModel)];
}

// ── Parallel model strategy ──
// Returns [fastModel, smartModel] for concurrent execution.
// Fast model streams first, smart model upgrades later.

export function getParallelModels(queryType: QueryType): [string, string] {
  switch (queryType) {
    // FIX: Use llama-3.1-8b-instant as fast model for code instead of gemma2-9b-it
    // gemma2-9b-it (800 tokens) was too weak for code — llama-3.1-8b-instant is faster and better for quick code
    case 'code':     return ['llama-3.1-8b-instant', 'mixtral-8x7b-32768'];
    case 'reasoning': return ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'];
    default:          return ['llama-3.1-8b-instant', 'gemma2-9b-it'];
  }
}

/** Should we use parallel strategy for this request? */
export function shouldUseParallel(
  userSelected: string | null,
  queryType: QueryType
): boolean {
  // Only in auto mode, only for code/reasoning (not general — already fast enough)
  if (userSelected && userSelected !== 'auto') return false;
  return queryType === 'code' || queryType === 'reasoning';
}

// ── Model config getter ──

export function getModelConfig(
  modelId: string,
  queryType: QueryType
): ModelConfig {
  const config = MODEL_CONFIGS[modelId];
  if (config) return config;
  return { model: modelId, maxTokens: getMaxTokens(queryType), temperature: 0.7 };
}

export { FALLBACK_CHAIN, MODEL_CONFIGS };
