import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';

export function corsFor(webOrigin: string) {
  const allowCors = cors({ origin: webOrigin, credentials: true });

  return createMiddleware(async (context, next) => {
    if (context.req.header('Origin') === webOrigin) {
      return allowCors(context, next);
    }

    context.header('Vary', 'Origin', { append: true });
    await next();
  });
}
