import { REQUEST_ID_HEADER } from '@nexo/contracts';
import { createLogger, requestLogger } from '@nexo/server-kit';
import { Hono } from 'hono';
import pino from 'pino';
import { describe, expect, it } from 'vitest';

const requestId = '550e8400-e29b-41d4-a716-446655440000';
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function appWithLogger(logger = createLogger('silent')) {
  const app = new Hono();
  app.use(requestLogger(logger));
  return app;
}

describe('logs de requisição', () => {
  it('reaproveita um UUID enviado pelo cliente', async () => {
    const app = appWithLogger();
    app.get('/probe', (context) => context.text('ok'));
    const response = await app.request('/probe', { headers: { [REQUEST_ID_HEADER]: requestId } });

    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(requestId);
  });

  it('substitui um identificador inválido por um UUID gerado', async () => {
    const app = appWithLogger();
    app.get('/probe', (context) => context.text('ok'));
    const response = await app.request('/probe', {
      headers: { [REQUEST_ID_HEADER]: 'pessoa@example.com' },
    });

    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(uuidV4);
  });

  it('registra o caminho declarado da rota e os metadados da resposta', async () => {
    const lines: string[] = [];
    const logger = pino({ base: null, timestamp: false }, { write: (line) => lines.push(line) });
    const app = appWithLogger(logger);
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
