import type { RateLimiter } from '../../application/ports/rate-limiter.ts';

interface Window {
  count: number;
  expiresAt: number;
}

const cleanupIntervalMs = 60_000;

export function createInMemoryRateLimiter({
  maxKeys = 10_000,
}: { maxKeys?: number } = {}): RateLimiter {
  const windows = new Map<string, Window>();
  let nextCleanupAt = -Infinity;

  return {
    consume(key, limit, windowMs, now) {
      const timestamp = now.getTime();
      let window = windows.get(key);
      if (timestamp >= nextCleanupAt || (window === undefined && windows.size >= maxKeys)) {
        for (const [expiredKey, window] of windows) {
          if (window.expiresAt <= timestamp) {
            windows.delete(expiredKey);
          }
        }

        nextCleanupAt = timestamp + cleanupIntervalMs;
        window = windows.get(key);
      }

      if (window === undefined && windows.size >= maxKeys) {
        for (const oldestKey of windows.keys()) {
          if (windows.size < maxKeys) {
            break;
          }
          windows.delete(oldestKey);
        }
      }

      if (window === undefined || window.expiresAt <= timestamp) {
        window = { count: 0, expiresAt: timestamp + windowMs };
        windows.set(key, window);
      }

      if (window.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((window.expiresAt - timestamp) / 1_000)),
        };
      }

      window.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
