import { randomUUID } from 'node:crypto';
import { REQUEST_ID_HEADER } from '@nexo/contracts';
import type { Context, Env } from 'hono';
import { createMiddleware } from 'hono/factory';
import { routePath } from 'hono/route';
import type { Logger } from 'pino';

const uuidLike = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function requestLogger<E extends Env>(
  logger: Logger,
  getUserId?: (context: Context<E>) => string | undefined,
) {
  return createMiddleware<E>(async (context, next) => {
    const start = performance.now();
    const incomingId = context.req.header(REQUEST_ID_HEADER);
    const requestId = incomingId && uuidLike.test(incomingId) ? incomingId : randomUUID();
    context.header(REQUEST_ID_HEADER, requestId);

    await next();

    logger.info({
      requestId,
      userId: getUserId?.(context),
      method: context.req.method,
      path: routePath(context),
      status: context.res.status,
      durationMs: performance.now() - start,
    });
  });
}
