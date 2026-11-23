import { setTimeout as delay } from 'node:timers/promises';
import { ErrorCode } from '@nexo/contracts';
import { ApplicationError } from '@nexo/server-kit';
import type { MiddlewareHandler } from 'hono';

export interface FailureInjectionOptions {
  rate: number;
  extraLatencyMs: number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export function failureInjection(
  { rate, extraLatencyMs, random = Math.random, sleep = delay }: FailureInjectionOptions = {
    rate: 0,
    extraLatencyMs: 0,
  },
): MiddlewareHandler {
  return async (_context, next) => {
    if (extraLatencyMs > 0) {
      await sleep(extraLatencyMs);
    }

    if (rate > 0 && random() < rate) {
      throw new ApplicationError(ErrorCode.SERVICE_UNAVAILABLE, 'Serviço indisponível');
    }

    await next();
  };
}
