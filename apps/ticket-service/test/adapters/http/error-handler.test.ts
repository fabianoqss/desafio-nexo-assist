import {
  ACTOR_ID_HEADER,
  ACTOR_ROLE_HEADER,
  ErrorCode,
  ErrorResponseSchema,
  REQUEST_ID_HEADER,
  SERVICE_AUTH_HEADER,
} from '@nexo/contracts';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
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
import { FixedClock } from '../../support/fixed-clock.ts';
import { InMemoryTicketStore } from '../../support/in-memory-ticket-store.ts';

const checkReadiness = () => Promise.resolve(true);
const apiToken = 'token-de-servico-privado-para-testes';

function appWithLogger(logger = createLogger('silent'), store = new InMemoryTicketStore()) {
  return createApp({
    logger,
    checkReadiness,
    apiToken,
    tickets: store,
    unitOfWork: store,
    idempotency: store,
    clock: new FixedClock(),
  });
}

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
    const app = appWithLogger();
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
    const app = appWithLogger();
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

  it('retorna a mensagem genérica e loga só o nome do erro e o código do banco', async () => {
    const lines: string[] = [];
    const logger = pino({}, { write: (line) => lines.push(line) });
    const app = appWithLogger(logger);
    app.get('/probe', () => {
      throw new Error('Failed query: insert ... params: db password leaked', {
        cause: { code: '23514' },
      });
    });

    const response = await app.request('/probe');
    const body = ErrorResponseSchema.parse(await response.json());
    const requestId = response.headers.get(REQUEST_ID_HEADER);

    expect(response.status).toBe(500);
    expect(body.error).toEqual({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Erro interno do servidor',
    });
    expect(lines.map((line): unknown => JSON.parse(line))).toMatchObject([
      { requestId, errorName: 'Error', databaseErrorCode: '23514' },
      { requestId, path: '/probe', status: 500 },
    ]);
    expect(lines.join('')).not.toContain('db password leaked');
  });

  it('loga o código direto do banco sem o cliente, a mensagem nem a pilha do erro', async () => {
    const lines: string[] = [];
    const logger = pino({}, { write: (line) => lines.push(line) });
    const app = appWithLogger(logger);
    const error = Object.assign(new Error('mensagem privada'), {
      code: '08006',
      client: { password: 'credencial do cliente' },
      stack: 'pilha privada',
    });
    app.get('/probe', () => {
      throw error;
    });

    expect((await app.request('/probe')).status).toBe(500);
    expect(lines.map((line): unknown => JSON.parse(line))).toMatchObject([
      { level: 50, errorName: 'Error', databaseErrorCode: '08006' },
      { level: 30, path: '/probe', status: 500 },
    ]);
    const logs = lines.join('');
    expect(logs).not.toMatch(
      /mensagem privada|credencial do cliente|pilha privada|"(client|message|stack|err)":/,
    );
  });

  it('registra a falha em uma rota de chamados sem os dados do erro', async () => {
    const lines: string[] = [];
    const logger = pino({}, { write: (line) => lines.push(line) });
    const store = new InMemoryTicketStore();
    const bodyContent = 'descrição privada de um erro no banco';
    vi.spyOn(store, 'list').mockRejectedValue(new Error(`${bodyContent}: ${apiToken}`));
    const app = appWithLogger(logger, store);

    const response = await app.request('/tickets', {
      headers: {
        [SERVICE_AUTH_HEADER]: `Bearer ${apiToken}`,
        [ACTOR_ID_HEADER]: '550e8400-e29b-41d4-a716-446655440000',
        [ACTOR_ROLE_HEADER]: 'EMPLOYEE',
      },
    });

    expect(response.status).toBe(500);
    expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe(
      ErrorCode.INTERNAL_ERROR,
    );
    expect(lines.map((line): unknown => JSON.parse(line))).toMatchObject([
      { level: 50, requestId: response.headers.get(REQUEST_ID_HEADER) },
      { level: 30, path: '/tickets', status: 500 },
    ]);
    expect(lines.join('')).not.toContain(bodyContent);
    expect(lines.join('')).not.toContain(apiToken);
  });
});
