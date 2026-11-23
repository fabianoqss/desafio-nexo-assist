import {
  ACTOR_ID_HEADER,
  ACTOR_ROLE_HEADER,
  ErrorCode,
  ErrorResponseSchema,
  REQUEST_ID_HEADER,
  SERVICE_AUTH_HEADER,
} from '@nexo/contracts';
import pino, { type Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/adapters/http/app.ts';
import { FixedClock } from '../../support/fixed-clock.ts';
import { InMemoryTicketStore } from '../../support/in-memory-ticket-store.ts';

const checkReadiness = () => Promise.resolve(true);
const apiToken = 'token-de-servico-privado-para-testes';

function appWithLogger(logger: Logger, store: InMemoryTicketStore) {
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

describe('logs de erro do ticket-service', () => {
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
