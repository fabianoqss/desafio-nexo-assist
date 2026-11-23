import { createHash } from 'node:crypto';
import { IDEMPOTENCY_KEY_HEADER, IdempotencyKeySchema } from '@nexo/contracts';
import { createMiddleware } from 'hono/factory';
import type { IdempotencyContext } from '../../../application/idempotency/with-idempotency.ts';

export interface IdempotencyVariables {
  idempotency: IdempotencyContext;
  rawBody: Buffer;
}

export const idempotencyContext = createMiddleware<{ Variables: IdempotencyVariables }>(
  async (context, next) => {
    const key = IdempotencyKeySchema.parse(context.req.header(IDEMPOTENCY_KEY_HEADER));
    const rawBody = Buffer.from(await context.req.arrayBuffer());
    const requestHash = createHash('sha256')
      .update(`${context.req.method} ${context.req.path}\n`)
      .update(rawBody)
      .digest('hex');

    context.set('idempotency', { key, requestHash });
    context.set('rawBody', rawBody);

    await next();
  },
);
