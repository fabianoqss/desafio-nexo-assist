import { ErrorCode, type ErrorResponse, REQUEST_ID_HEADER } from '@nexo/contracts';
import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { ApplicationError } from '../../application/errors/application-error.ts';
import { describeError } from '../logging/safe-error.ts';

const statusByCode = {
  [ErrorCode.VALIDATION_FAILED]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.PAYLOAD_TOO_LARGE]: 413,
  [ErrorCode.IDEMPOTENCY_KEY_REUSED]: 409,
  [ErrorCode.TICKET_RESOLVED]: 409,
  [ErrorCode.REOPEN_NOT_ALLOWED]: 409,
  [ErrorCode.INVALID_STATUS_TRANSITION]: 409,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.INTERNAL_ERROR]: 500,
} satisfies Record<ErrorCode, ContentfulStatusCode>;

function isApplicationError(error: Error): error is ApplicationError {
  return error instanceof ApplicationError;
}

export function errorHandler(logger: Logger): ErrorHandler {
  return (error, context) => {
    let body: ErrorResponse;

    if (isApplicationError(error) && error.code !== ErrorCode.INTERNAL_ERROR) {
      body = { error: { code: error.code, message: error.message } };
    } else if (error instanceof ZodError) {
      body = { error: { code: ErrorCode.VALIDATION_FAILED, message: 'Dados inválidos' } };
    } else {
      logger.error(
        {
          ...describeError(error),
          requestId: context.res.headers.get(REQUEST_ID_HEADER),
        },
        'Erro inesperado ao processar a requisição',
      );
      body = { error: { code: ErrorCode.INTERNAL_ERROR, message: 'Erro interno do servidor' } };
    }

    return context.json(body, statusByCode[body.error.code]);
  };
}
