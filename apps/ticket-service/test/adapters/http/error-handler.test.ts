import { ErrorCode, ErrorResponseSchema, REQUEST_ID_HEADER } from '@nexo/contracts';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../../src/adapters/http/app.ts';
import { createLogger } from '../../../src/adapters/logging/logger.ts';
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../src/application/errors/application-error.ts';

const checkReadiness = () => Promise.resolve(true);

describe('tratamento de erros HTTP', () => {
  it.each([
    {
      error: new ValidationError('Dados inválidos'),
      code: ErrorCode.VALIDATION_FAILED,
      status: 400,
    },
    {
      error: new ApplicationError(ErrorCode.UNAUTHORIZED, 'Token inválido'),
      code: ErrorCode.UNAUTHORIZED,
      status: 401,
    },
    { error: new ForbiddenError('Acesso negado'), code: ErrorCode.FORBIDDEN, status: 403 },
    { error: new NotFoundError('Chamado inexistente'), code: ErrorCode.NOT_FOUND, status: 404 },
    {
      error: new ApplicationError(ErrorCode.PAYLOAD_TOO_LARGE, 'Corpo muito grande'),
      code: ErrorCode.PAYLOAD_TOO_LARGE,
      status: 413,
    },
    {
      error: new ConflictError(ErrorCode.IDEMPOTENCY_KEY_REUSED, 'Chave reutilizada'),
      code: ErrorCode.IDEMPOTENCY_KEY_REUSED,
      status: 409,
    },
    {
      error: new ConflictError(ErrorCode.TICKET_RESOLVED, 'Chamado resolvido'),
      code: ErrorCode.TICKET_RESOLVED,
      status: 409,
    },
    {
      error: new ConflictError(ErrorCode.REOPEN_NOT_ALLOWED, 'Reabertura proibida'),
      code: ErrorCode.REOPEN_NOT_ALLOWED,
      status: 409,
    },
    {
      error: new ConflictError(ErrorCode.INVALID_STATUS_TRANSITION, 'Transição inválida'),
      code: ErrorCode.INVALID_STATUS_TRANSITION,
      status: 409,
    },
    {
      error: new ApplicationError(ErrorCode.SERVICE_UNAVAILABLE, 'Serviço indisponível'),
      code: ErrorCode.SERVICE_UNAVAILABLE,
      status: 503,
    },
    {
      error: new ApplicationError(ErrorCode.INTERNAL_ERROR, 'Detalhe interno'),
      code: ErrorCode.INTERNAL_ERROR,
      status: 500,
    },
  ])('converte $code em HTTP $status', async ({ error, code, status }) => {
    const app = createApp({ logger: createLogger('silent'), checkReadiness });
    app.get('/probe', () => {
      throw error;
    });

    const response = await app.request('/probe');
    const body = ErrorResponseSchema.parse(await response.json());

    expect(response.status).toBe(status);
    expect(body.error.code).toBe(code);
    expect(body.error.message).toBe(
      code === ErrorCode.INTERNAL_ERROR ? 'Erro interno do servidor' : error.message,
    );
  });

  it('converte ZodError em falha de validação sem expor a entrada', async () => {
    const app = createApp({ logger: createLogger('silent'), checkReadiness });
    app.get('/probe', () => {
      z.literal('valid-input').parse('private-input', { reportInput: true });
      return new Response();
    });

    const response = await app.request('/probe');
    const body = ErrorResponseSchema.parse(await response.json());

    expect(response.status).toBe(400);
    expect(body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(body.error.message).not.toContain('private-input');
  });

  it('retorna a mensagem genérica e envia o erro original ao logger', async () => {
    const lines: string[] = [];
    const logger = pino({}, { write: (line) => lines.push(line) });
    const app = createApp({ logger, checkReadiness });
    app.get('/probe', () => {
      throw new Error('db password leaked');
    });

    const response = await app.request('/probe');
    const body = ErrorResponseSchema.parse(await response.json());
    const requestId = response.headers.get(REQUEST_ID_HEADER);

    expect(response.status).toBe(500);
    expect(body.error).toEqual({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Erro interno do servidor',
    });
    const stack: unknown = expect.stringContaining('db password leaked');
    expect(lines.map((line): unknown => JSON.parse(line))).toMatchObject([
      {
        requestId,
        err: {
          message: 'db password leaked',
          stack,
        },
      },
      { requestId, path: '/probe', status: 500 },
    ]);
  });
});
