import { timingSafeEqual } from 'node:crypto';
import { ErrorCode, SERVICE_AUTH_HEADER } from '@nexo/contracts';
import { createMiddleware } from 'hono/factory';
import { ApplicationError } from '../../../application/errors/application-error.ts';

export function serviceAuth(apiToken: string) {
  const expected = Buffer.from(apiToken);

  return createMiddleware(async (context, next) => {
    const authorization = context.req.header(SERVICE_AUTH_HEADER);
    const token = authorization?.match(/^Bearer +([^\s,]+)$/i)?.[1];
    const actual = Buffer.from(token ?? '');

    if (
      token === undefined ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      context.header('WWW-Authenticate', 'Bearer');
      throw new ApplicationError(ErrorCode.UNAUTHORIZED, 'Token de serviço ausente ou inválido');
    }

    await next();
  });
}
