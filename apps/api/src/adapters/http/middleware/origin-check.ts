import { ForbiddenError } from '@nexo/server-kit';
import { createMiddleware } from 'hono/factory';

export function originCheck(webOrigin: string) {
  return createMiddleware(async (context, next) => {
    const { method } = context.req;
    if (
      method !== 'GET' &&
      method !== 'HEAD' &&
      method !== 'OPTIONS' &&
      context.req.header('Origin') !== webOrigin
    ) {
      throw new ForbiddenError('Origem não permitida');
    }

    await next();
  });
}
