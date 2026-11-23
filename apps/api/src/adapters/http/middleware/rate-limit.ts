import { RateLimitedError } from '@nexo/server-kit';
import type { Context, Env } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Clock } from '../../../application/ports/clock.ts';
import type { Metrics } from '../../../application/ports/metrics.ts';
import type { RateLimiter } from '../../../application/ports/rate-limiter.ts';

interface RateLimitOptions<E extends Env> {
  scope: string;
  limit: number;
  windowMs: number;
  key: (context: Context<E>) => string;
  rateLimiter: RateLimiter;
  clock: Clock;
  metrics: Metrics;
}

export function rateLimit<E extends Env>({
  scope,
  limit,
  windowMs,
  key,
  rateLimiter,
  clock,
  metrics,
}: RateLimitOptions<E>) {
  return createMiddleware<E>(async (context, next) => {
    const result = rateLimiter.consume(`${scope}:${key(context)}`, limit, windowMs, clock.now());
    if (!result.allowed) {
      metrics.increment('nexo_rate_limited_total', { scope });
      throw new RateLimitedError(result.retryAfterSeconds);
    }
    await next();
  });
}
