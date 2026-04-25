// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Fire-and-Forget Analytics to Supabase
//  Records model usage, errors, and rate-limit events.
//  If the analytics_events table doesn't exist yet, calls fail silently.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { db } from '@/lib/db';

export type AnalyticsEventType =
  | 'model_usage'
  | 'model_error'
  | 'rate_limit'
  | 'chat_sent';

interface AnalyticsPayload {
  model?: string;
  queryType?: string;
  errorMessage?: string;
  responseTimeMs?: number;
  estimatedTokens?: number;
}

/**
 * Record an analytics event. Never throws — failures are swallowed.
 * The callers should NOT await this in hot paths (fire-and-forget).
 */
export async function trackEvent(
  eventType: AnalyticsEventType,
  userId: string | undefined,
  payload: AnalyticsPayload = {}
): Promise<void> {
  try {
    await db.analyticsEvent.create({
      data: {
        eventType,
        model: payload.model ?? null,
        userId: userId ?? null,
        metadata: {
          queryType: payload.queryType ?? null,
          errorMessage: payload.errorMessage ?? null,
          responseTimeMs: payload.responseTimeMs ?? null,
          estimatedTokens: payload.estimatedTokens ?? null,
        },
      },
    });
  } catch {
    // Table may not exist yet — silently ignore
  }
}
