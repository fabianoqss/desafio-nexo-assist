import { ErrorCode, ErrorResponseSchema, REQUEST_ID_HEADER } from '@nexo/contracts';
import { createLogger } from '@nexo/server-kit';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { systemClock } from '../../../src/adapters/clock/system-clock.ts';
import { createApp } from '../../../src/adapters/http/app.ts';
import { noopMetrics } from '../../../src/adapters/metrics/noop-metrics.ts';
import { createInMemoryRateLimiter } from '../../../src/adapters/rate-limit/in-memory-rate-limiter.ts';

function appWithReadiness(checkReadiness: () => Promise<boolean>, logger = createLogger('silent')) {
  return createApp({
    logger,
    checkReadiness,
    env: { WEB_ORIGIN: 'http://localhost:5173', TRUST_PROXY: false },
    clock: systemClock,
    metrics: noopMetrics,
    rateLimiter: createInMemoryRateLimiter(),
  });
}

describe('rotas de saúde', () => {
  it('responde GET /health sem Origin, independentemente da prontidão', async () => {
    const app = appWithReadiness(() => Promise.resolve(false));
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get(REQUEST_ID_HEADER)).toBeTruthy();
  });

  it('responde a HEAD /health sem Origin', async () => {
    const app = appWithReadiness(() => Promise.resolve(true));
    const response = await app.request('/health', { method: 'HEAD' });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('responde 200 em /ready quando a checagem passa', async () => {
    const app = appWithReadiness(() => Promise.resolve(true));
    const response = await app.request('/ready');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('responde 503 em /ready quando a checagem retorna false', async () => {
    const app = appWithReadiness(() => Promise.resolve(false));
    const response = await app.request('/ready');

    expect(response.status).toBe(503);
    expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe(
      ErrorCode.SERVICE_UNAVAILABLE,
    );
  });

  it('preserva o 503 e registra apenas metadados quando a checagem falha', async () => {
    const lines: string[] = [];
    const logger = pino({}, { write: (line) => lines.push(line) });
    const message = 'erro privado da checagem';
    const app = appWithReadiness(() => Promise.reject(new TypeError(message)), logger);
    const response = await app.request('/ready');

    expect(response.status).toBe(503);
    expect(lines.map((line): unknown => JSON.parse(line))).toMatchObject([
      { errorName: 'TypeError' },
      { method: 'GET', path: '/ready', status: 503 },
    ]);
    expect(lines.join('')).not.toContain(message);
  });

  it('omite a mensagem do erro, o corpo e os dados da URL dos logs da requisição', async () => {
    const lines: string[] = [];
    const logger = pino({}, { write: (line) => lines.push(line) });
    const app = appWithReadiness(() => Promise.resolve(true), logger);
    app.post('/mensagens/:id', () => {
      throw new TypeError('mensagem privada do erro');
    });

    const response = await app.request('/mensagens/valor-privado?query=consulta-privada', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'Content-Length': '14',
      },
      body: '"corpo-privado"',
    });

    expect(response.status).toBe(500);
    const logs = lines.map((line): unknown => JSON.parse(line));
    expect(logs).toMatchObject([
      { errorName: 'TypeError', requestId: response.headers.get(REQUEST_ID_HEADER) },
      { method: 'POST', path: '/mensagens/:id', status: 500 },
    ]);
    expect(lines.join('')).not.toMatch(
      /mensagem privada do erro|valor-privado|consulta-privada|corpo-privado/,
    );
  });
});
