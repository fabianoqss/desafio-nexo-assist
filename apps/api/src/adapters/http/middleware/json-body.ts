import { ErrorCode } from '@nexo/contracts';
import { ApplicationError } from '@nexo/server-kit';
import { createMiddleware } from 'hono/factory';

export function jsonBody() {
  return createMiddleware(async (context, next) => {
    const { method } = context.req;
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const contentType = context.req.header('Content-Type');
      const contentLength = context.req.header('Content-Length');
      const hasBody =
        contentType !== undefined ||
        (contentLength !== undefined && contentLength !== '0') ||
        context.req.header('Transfer-Encoding') !== undefined;

      if (
        hasBody &&
        (contentType === undefined ||
          contentType.includes(',') ||
          contentType.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json')
      ) {
        throw new ApplicationError(
          ErrorCode.UNSUPPORTED_MEDIA_TYPE,
          'O corpo da requisição deve usar application/json',
        );
      }
    }

    await next();
  });
}
