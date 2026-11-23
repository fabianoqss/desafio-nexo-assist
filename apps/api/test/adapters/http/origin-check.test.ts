import { ErrorCode, ErrorResponseSchema } from '@nexo/contracts';
import { createLogger } from '@nexo/server-kit';
import { describe, expect, it } from 'vitest';
import { unavailableAgentTurnRunner } from '../../../src/adapters/agent/unavailable-agent-turn-runner.ts';
import { createInMemoryConversationEventBus } from '../../../src/adapters/events/in-memory-conversation-event-bus.ts';
import { createApp } from '../../../src/adapters/http/app.ts';
import { noopMetrics } from '../../../src/adapters/metrics/noop-metrics.ts';
import { createInMemoryRateLimiter } from '../../../src/adapters/rate-limit/in-memory-rate-limiter.ts';
import { FixedClock } from '../../support/fixed-clock.ts';
import { InMemoryApiStore } from '../../support/in-memory-api-store.ts';

const webOrigin = 'http://localhost:5173';

function createTestApp() {
  const store = new InMemoryApiStore();
  const app = createApp({
    logger: createLogger('silent'),
    checkReadiness: () => Promise.resolve(true),
    env: { WEB_ORIGIN: webOrigin, TRUST_PROXY: false, SESSION_TTL_HOURS: 12 },
    clock: new FixedClock(),
    metrics: noopMetrics,
    rateLimiter: createInMemoryRateLimiter(),
    users: store.users,
    sessions: store.sessions,
    unitOfWork: store,
    eventBus: createInMemoryConversationEventBus(),
    agentTurnRunner: unavailableAgentTurnRunner,
  });
  app.post('/qualquer', (context) => context.body(null, 204));
  return app;
}

describe('proteção de origem e tipo de conteúdo', () => {
  it('responde 403 para POST sem Origin', async () => {
    const response = await createTestApp().request('/qualquer', { method: 'POST' });

    expect(response.status).toBe(403);
    expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe(ErrorCode.FORBIDDEN);
  });

  it.each(['https://evil.example', 'http://localhost:5173/'])(
    'responde 403 para POST de %s',
    async (origin) => {
      const response = await createTestApp().request('/qualquer', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'text/plain', 'Content-Length': '3' },
        body: 'abc',
      });

      expect(response.status).toBe(403);
      expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe(ErrorCode.FORBIDDEN);
    },
  );

  it.each([
    { 'Content-Length': '3', 'Content-Type': 'text/plain' },
    { 'Transfer-Encoding': 'chunked', 'Content-Type': 'text/plain' },
    { 'Content-Length': '3', 'Content-Type': 'application/json-other' },
    { 'Content-Length': '3' },
    { 'Content-Type': 'text/plain' },
    { 'Content-Length': '3, 3', 'Content-Type': 'text/plain' },
    { 'Content-Length': '3, 3' },
    { 'Content-Length': '3', 'Content-Type': 'application/json; a=b, text/plain' },
  ])('responde 415 para POST da origem permitida com cabeçalhos %j', async (headers) => {
    const response = await createTestApp().request('/qualquer', {
      method: 'POST',
      headers: new Headers({ Origin: webOrigin, ...headers }),
      body: new Uint8Array([1, 2, 3]),
    });

    expect(response.status).toBe(415);
    expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe(
      ErrorCode.UNSUPPORTED_MEDIA_TYPE,
    );
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(webOrigin);
  });

  it.each([
    'application/json',
    'application/json; charset=utf-8',
    'Application/JSON; charset=utf-8',
  ])('aceita %s em um POST da origem permitida', async (contentType) => {
    const response = await createTestApp().request('/qualquer', {
      method: 'POST',
      headers: { Origin: webOrigin, 'Content-Type': contentType, 'Content-Length': '2' },
      body: '{}',
    });

    expect(response.status).toBe(204);
  });

  it.each([{}, { 'Content-Length': '0' }])(
    'aceita POST sem corpo da origem permitida (%j)',
    async (headers) => {
      const response = await createTestApp().request('/qualquer', {
        method: 'POST',
        headers: new Headers({ Origin: webOrigin, ...headers }),
      });

      expect(response.status).toBe(204);
    },
  );
});

describe('CORS', () => {
  it('autoriza preflight com credenciais da origem permitida', async () => {
    const response = await createTestApp().request('/qualquer', {
      method: 'OPTIONS',
      headers: {
        Origin: webOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(webOrigin);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('content-type');
    expect(response.headers.get('Vary')).toContain('Origin');
  });

  it('omite cabeçalhos de autorização CORS no preflight de outra origem', async () => {
    const response = await createTestApp().request('/qualquer', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    });

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    expect(response.headers.get('Vary')).toContain('Origin');
  });
});
