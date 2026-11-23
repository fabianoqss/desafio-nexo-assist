import type { RateLimiter } from '../../application/ports/rate-limiter.ts';

interface Window {
  count: number;
  expiresAt: number;
  limit: number;
}

const cleanupIntervalMs = 60_000;

function blocked(expiresAt: number, timestamp: number) {
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - timestamp) / 1_000)),
  };
}

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
        let soonestExpiry: number | undefined;
        for (const [candidateKey, candidate] of windows) {
          if (candidate.count < candidate.limit) {
            windows.delete(candidateKey);
            break;
          }
          soonestExpiry = Math.min(soonestExpiry ?? candidate.expiresAt, candidate.expiresAt);
        }
        if (windows.size >= maxKeys) {
          return blocked(soonestExpiry ?? timestamp, timestamp);
        }
      }

      if (window === undefined || window.expiresAt <= timestamp) {
        window = { count: 0, expiresAt: timestamp + windowMs, limit };
        windows.set(key, window);
      }

      if (window.count >= window.limit) {
        return blocked(window.expiresAt, timestamp);
      }

      window.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
