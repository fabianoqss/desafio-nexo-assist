import { ErrorCode, ErrorResponseSchema, REQUEST_ID_HEADER } from '@nexo/contracts';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../../src/adapters/http/app.ts';
import { createLogger } from '../../../src/adapters/logging/logger.ts';

const requestId = '550e8400-e29b-41d4-a716-446655440000';
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ready = () => Promise.resolve(true);

function appWithReadiness(checkReadiness: () => Promise<boolean>) {
  return createApp({ logger: createLogger('silent'), checkReadiness });
}

describe('rotas de saúde', () => {
  it('responde a /health com status ok e um UUID gerado', async () => {
    const app = appWithReadiness(() => Promise.reject(new Error('readiness indisponível')));
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(uuidV4);
  });

  it('reaproveita um UUID enviado pelo cliente', async () => {
    const app = appWithReadiness(ready);
    const response = await app.request('/health', { headers: { [REQUEST_ID_HEADER]: requestId } });

    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(requestId);
  });

  it('substitui um identificador inválido por um UUID gerado', async () => {
    const app = appWithReadiness(ready);
    const response = await app.request('/health', {
      headers: { [REQUEST_ID_HEADER]: 'pessoa@example.com' },
    });

    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(uuidV4);
  });

  it('responde a /ready com 200 quando a checagem passa', async () => {
    const app = appWithReadiness(ready);
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

  it('registra o caminho declarado da rota e os metadados da resposta', async () => {
    const lines: string[] = [];
    const logger = pino({ base: null, timestamp: false }, { write: (line) => lines.push(line) });
    const app = createApp({ logger, checkReadiness: ready });
    app.post('/probe/:id', (context) => context.text('ok', 201));

    await app.request('/probe/person%40example.com?email=other%40example.com', {
      method: 'POST',
      headers: { [REQUEST_ID_HEADER]: requestId, authorization: 'Bearer private-token' },
      body: 'private-body',
    });

    expect(lines).toHaveLength(1);
    const durationMs: unknown = expect.any(Number);
    expect(JSON.parse(lines.join(''))).toEqual({
      level: 30,
      requestId,
      method: 'POST',
      path: '/probe/:id',
      status: 201,
      durationMs,
    });
  });
});
