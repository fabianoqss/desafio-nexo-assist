export interface RateLimiter {
  consume(
    key: string,
    limit: number,
    windowMs: number,
    now: Date,
  ): { allowed: boolean; retryAfterSeconds: number };
}
