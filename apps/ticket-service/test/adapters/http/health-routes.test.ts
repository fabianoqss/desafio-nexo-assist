import { ErrorCode, ErrorResponseSchema, REQUEST_ID_HEADER } from '@nexo/contracts';
import { createLogger } from '@nexo/server-kit';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/adapters/http/app.ts';
import { createDatabase } from '../../../src/adapters/persistence/database.ts';
import { FixedClock } from '../../support/fixed-clock.ts';
import { InMemoryTicketStore } from '../../support/in-memory-ticket-store.ts';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function appWithReadiness(checkReadiness: () => Promise<boolean>) {
  const store = new InMemoryTicketStore();
  return createApp({
    logger: createLogger('silent'),
    checkReadiness,
    apiToken: 'token-de-servico-privado-para-testes',
    tickets: store,
    unitOfWork: store,
    idempotency: store,
    clock: new FixedClock(),
  });
}

describe('rotas de saúde', () => {
  it('responde a /health com status ok e um UUID gerado', async () => {
    const app = appWithReadiness(() => Promise.reject(new Error('readiness indisponível')));
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(uuidV4);
  });

  it('responde a /ready com 200 quando a checagem passa', async () => {
    const app = appWithReadiness(() => Promise.resolve(true));
    const response = await app.request('/ready');

    expect(response.status).toBe(200);
  });

  it.each([
    { outcome: 'retorna false', checkReadiness: () => Promise.resolve(false) },
    {
      outcome: 'rejeita',
      checkReadiness: () => Promise.reject(new Error('erro interno da checagem')),
    },
    {
      outcome: 'lança antes de retornar a promessa',
      checkReadiness: () => {
        throw new Error('erro interno da checagem');
      },
    },
  ])('responde a /ready com 503 quando a checagem $outcome', async ({ checkReadiness }) => {
    const app = appWithReadiness(checkReadiness);
    const response = await app.request('/ready');

    expect(response.status).toBe(503);
    expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe(
      ErrorCode.SERVICE_UNAVAILABLE,
    );
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(uuidV4);
  });
});

describe('prontidão com PostgreSQL', () => {
  const url = 'postgresql://localhost/nexo_test';

  it.each([
    { status: 200, discard: false, query: () => Promise.resolve() },
    { status: 503, discard: true, query: () => Promise.reject(new Error('consulta falhou')) },
  ])(
    'responde a /ready com $status conforme o resultado de SELECT 1',
    async ({ status, discard, query }) => {
      const { pool, checkReadiness } = createDatabase(url);
      const client = { query: vi.fn(query), release: vi.fn() };
      Object.assign(pool, { connect: () => Promise.resolve(client) });

      try {
        const response = await appWithReadiness(checkReadiness).request('/ready');

        expect(response.status).toBe(status);
        expect(client.query).toHaveBeenCalledExactlyOnceWith('select 1');
        expect(client.release).toHaveBeenCalledExactlyOnceWith(discard);
      } finally {
        await pool.end();
      }
    },
  );

  it('responde a /ready com 503 e descarta a conexão após 1 s de consulta pendente', async () => {
    const { pool, checkReadiness } = createDatabase(url);
    const client = { query: () => Promise.withResolvers<never>().promise, release: vi.fn() };
    Object.assign(pool, { connect: () => Promise.resolve(client) });

    vi.useFakeTimers();
    try {
      const response = appWithReadiness(checkReadiness).request('/ready');

      await vi.advanceTimersByTimeAsync(999);
      expect(client.release).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);

      expect((await response).status).toBe(503);
      expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
    } finally {
      vi.useRealTimers();
      await pool.end();
    }
  });

  it('devolve ao pool a conexão adquirida após o prazo', async () => {
    const { pool, checkReadiness } = createDatabase(url);
    const client = { query: vi.fn(), release: vi.fn() };
    const connection = Promise.withResolvers<typeof client>();
    Object.assign(pool, { connect: () => connection.promise });

    vi.useFakeTimers();
    try {
      const response = appWithReadiness(checkReadiness).request('/ready');
      await vi.advanceTimersByTimeAsync(1_000);
      expect((await response).status).toBe(503);

      connection.resolve(client);
      await connection.promise;

      expect(client.query).not.toHaveBeenCalled();
      expect(client.release).toHaveBeenCalledExactlyOnceWith();
    } finally {
      vi.useRealTimers();
      await pool.end();
    }
  });
});
