import { createHash } from 'node:crypto';
import { ErrorResponseSchema, REQUEST_ID_HEADER, UserResponseSchema } from '@nexo/contracts';
import { UserRole } from '@nexo/domain';
import { SEED_USERS } from '@nexo/seed-data';
import { Hono } from 'hono';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { unavailableAgentTurnRunner } from '../../../src/adapters/agent/unavailable-agent-turn-runner.ts';
import { createInMemoryConversationEventBus } from '../../../src/adapters/events/in-memory-conversation-event-bus.ts';
import { createApp } from '../../../src/adapters/http/app.ts';
import { requireRole } from '../../../src/adapters/http/middleware/require-role.ts';
import { session } from '../../../src/adapters/http/middleware/session.ts';
import { createInMemoryRateLimiter } from '../../../src/adapters/rate-limit/in-memory-rate-limiter.ts';
import { createHttpTicketGateway } from '../../../src/adapters/ticket-client/http-ticket-gateway.ts';
import { FixedClock } from '../../support/fixed-clock.ts';
import { InMemoryApiStore } from '../../support/in-memory-api-store.ts';
import { RecordingMetrics } from '../../support/recording-metrics.ts';

const origin = 'https://web.example.com';
const [ana] = SEED_USERS;
const anaEmail = ana.email;
const clearedSessionCookie =
  '__Host-nexo_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax';

function setup(sessionTtlHours = 12) {
  const store = new InMemoryApiStore(SEED_USERS);
  const clock = new FixedClock();
  const metrics = new RecordingMetrics();
  const logs: string[] = [];
  const logger = pino({ base: null, timestamp: false }, { write: (line) => logs.push(line) });
  const app = createApp({
    logger,
    checkReadiness: () => Promise.resolve(true),
    env: { WEB_ORIGIN: origin, TRUST_PROXY: true, SESSION_TTL_HOURS: sessionTtlHours },
    clock,
    metrics,
    rateLimiter: createInMemoryRateLimiter(),
    users: store.users,
    sessions: store.sessions,
    unitOfWork: store,
    eventBus: createInMemoryConversationEventBus(),
    agentTurnRunner: unavailableAgentTurnRunner,
    ticketGateway: createHttpTicketGateway({
      baseUrl: 'http://ticket-service.test',
      apiToken: 'token-de-teste-para-rotas-de-autenticacao',
      metrics,
      logger,
    }),
  });

  function login(
    body: unknown = { email: anaEmail, password: 'senha-privada' },
    headers: Record<string, string> = {},
  ) {
    return app.request('/auth/login', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.0.2.1',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  return { app, store, clock, metrics, logs, login };
}

function readSessionCookie(response: Response) {
  const setCookie = response.headers.get('Set-Cookie');
  const token = /^__Host-nexo_session=([A-Za-z0-9_-]{43});/.exec(setCookie ?? '')?.[1];
  if (setCookie === null || token === undefined) {
    throw new Error('Cookie de sessão ausente ou inválido');
  }
  return { setCookie, token, cookie: `__Host-nexo_session=${token}` };
}

describe('rotas de autenticação', () => {
  it('aceita credenciais do seed, devolve o perfil e grava apenas o hash do token', async () => {
    const { store, clock, login } = setup();
    const response = await login({
      email: ' ANA.SOUZA@NEXO.COM.BR ',
      password: 'senha',
      userId: 'identidade-forjada',
      role: UserRole.ANALYST,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body: unknown = await response.json();
    expect(body).toEqual(ana);
    expect(UserResponseSchema.parse(body)).toEqual(ana);

    const { setCookie, token } = readSessionCookie(response);
    expect(setCookie).toMatch(/; Max-Age=43200; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    expect(await store.sessions.findValid(token, clock.now())).toBeUndefined();
    expect(await store.sessions.findValid(tokenHash, clock.now())).toMatchObject({
      tokenHash,
      userId: ana.id,
      expiresAt: new Date('2026-12-10T00:00:00Z'),
    });
  });

  it('define o cookie com o TTL configurado antes de responder e sem ler o relógio novamente', async () => {
    const { app, clock } = setup(3);
    const start = clock.now();
    const now = vi
      .spyOn(clock, 'now')
      .mockReturnValueOnce(start)
      .mockReturnValueOnce(start)
      .mockReturnValue(new Date(start.getTime() + 1_000));
    let cookieAtJson: string | null = null;
    const instrumentedApp = new Hono();
    instrumentedApp.use('/auth/login', async (context, next) => {
      const json = context.json;
      vi.spyOn(context, 'json').mockImplementation((body, init) => {
        cookieAtJson = context.res.headers.get('Set-Cookie');
        return json(body, init);
      });
      await next();
    });
    instrumentedApp.route('/', app);

    const response = await instrumentedApp.request('/auth/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: anaEmail, password: 'senha' }),
    });

    expect(response.status).toBe(200);
    const { setCookie } = readSessionCookie(response);
    expect(setCookie).toContain('; Max-Age=10800;');
    expect(cookieAtJson).not.toBeNull();
    expect(now).toHaveBeenCalledTimes(2);
  });

  it('responde da mesma forma e conta as falhas para e-mail desconhecido e senha vazia', async () => {
    const { login, metrics } = setup();
    const unknown = await login({ email: 'desconhecido@example.com', password: 'senha' });
    const empty = await login({ email: anaEmail, password: '' });
    const invalidEmailAndEmptyPassword = await login({ email: 'invalido', password: '' });

    expect(unknown.status).toBe(401);
    expect(empty.status).toBe(401);
    expect(invalidEmailAndEmptyPassword.status).toBe(401);
    expect(ErrorResponseSchema.parse(await unknown.json())).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas' },
    });
    expect(ErrorResponseSchema.parse(await empty.json())).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas' },
    });
    expect(ErrorResponseSchema.parse(await invalidEmailAndEmptyPassword.json())).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas' },
    });
    expect(metrics.calls).toEqual([
      { method: 'increment', name: 'nexo_logins_total', labels: { result: 'failure' } },
      { method: 'increment', name: 'nexo_logins_total', labels: { result: 'failure' } },
      { method: 'increment', name: 'nexo_logins_total', labels: { result: 'failure' } },
    ]);
  });

  it('mantém o erro de validação para outros formatos de credenciais', async () => {
    const { login } = setup();
    const response = await login({ email: anaEmail, password: 123 });

    expect(response.status).toBe(400);
    expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe('VALIDATION_FAILED');
  });

  it('responde 400 para JSON malformado', async () => {
    const { app } = setup();
    const response = await app.request('/auth/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: '{',
    });

    expect(response.status).toBe(400);
    expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe('VALIDATION_FAILED');
  });

  it.each([true, false])(
    'rejeita JSON de 20 KiB antes da leitura para parsing (Content-Length: %s)',
    async (hasLength) => {
      const { app, metrics } = setup();
      const body = JSON.stringify({ email: anaEmail, password: '' }).padEnd(20 * 1024);
      const request = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          ...(hasLength && { 'Content-Length': String(Buffer.byteLength(body)) }),
        },
        body,
      });
      const readText = vi.spyOn(request, 'text');

      const response = await app.fetch(request);

      expect(response.status).toBe(413);
      expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(readText).not.toHaveBeenCalled();
      expect(metrics.calls).toEqual([]);
    },
  );

  it('retorna o perfil apenas com uma sessão válida', async () => {
    const { app, clock, login } = setup();
    const { cookie } = readSessionCookie(await login());

    const anonymous = await app.request('/auth/me');
    expect(anonymous.status).toBe(401);
    expect(ErrorResponseSchema.parse(await anonymous.json()).error.code).toBe('UNAUTHORIZED');

    const authenticated = await app.request('/auth/me', { headers: { Cookie: cookie } });
    expect(authenticated.status).toBe(200);
    expect(authenticated.headers.get('Cache-Control')).toBe('no-store');
    expect(await authenticated.json()).toEqual(ana);

    clock.set(new Date('2026-12-10T01:00:00Z'));
    const expired = await app.request('/auth/me', { headers: { Cookie: cookie } });
    expect(expired.status).toBe(401);
    expect(ErrorResponseSchema.parse(await expired.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('revoga o token no logout e expira o cookie com os mesmos atributos', async () => {
    const { app, login } = setup();
    const { cookie } = readSessionCookie(await login());

    const response = await app.request('/auth/logout', {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('Set-Cookie')).toBe(clearedSessionCookie);
    expect((await app.request('/auth/me', { headers: { Cookie: cookie } })).status).toBe(401);

    const repeated = await app.request('/auth/logout', {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie },
    });
    expect(repeated.status).toBe(204);
    expect(repeated.headers.get('Set-Cookie')).toBe(clearedSessionCookie);
  });

  it('limpa o cookie no logout sem sessão', async () => {
    const { app } = setup();
    const response = await app.request('/auth/logout', {
      method: 'POST',
      headers: { Origin: origin },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Set-Cookie')).toBe(clearedSessionCookie);
  });

  it('limpa o cookie e apaga a sessão expirada no logout', async () => {
    const { app, clock, login, store } = setup();
    const { cookie, token } = readSessionCookie(await login());
    const beforeExpiry = clock.now();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    clock.set(new Date('2026-12-10T00:00:00Z'));

    const response = await app.request('/auth/logout', {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Set-Cookie')).toBe(clearedSessionCookie);
    expect(await store.sessions.findValid(tokenHash, beforeExpiry)).toBeUndefined();
  });

  it('recusa logout de outra origem e preserva a sessão', async () => {
    const { app, login } = setup();
    const { cookie } = readSessionCookie(await login());

    const response = await app.request('/auth/logout', {
      method: 'POST',
      headers: { Origin: 'https://outra-origem.example.com', Cookie: cookie },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect((await app.request('/auth/me', { headers: { Cookie: cookie } })).status).toBe(200);
  });

  it('troca o token no login e revoga a sessão anterior', async () => {
    const { app, login } = setup();
    const previous = readSessionCookie(await login());
    const current = readSessionCookie(await login(undefined, { Cookie: previous.cookie }));

    expect(current.token).not.toBe(previous.token);
    expect((await app.request('/auth/me', { headers: { Cookie: previous.cookie } })).status).toBe(
      401,
    );
    expect((await app.request('/auth/me', { headers: { Cookie: current.cookie } })).status).toBe(
      200,
    );
  });

  it('preserva a sessão anterior quando a tentativa de rotação é rejeitada', async () => {
    const { app, login } = setup();
    const { cookie } = readSessionCookie(await login());

    const rejected = await login(
      { email: 'desconhecido@example.com', password: 'senha' },
      { Cookie: cookie },
    );

    expect(rejected.status).toBe(401);
    expect((await app.request('/auth/me', { headers: { Cookie: cookie } })).status).toBe(200);
  });

  it('conta o login como bem-sucedido apenas depois de concluir a rotação', async () => {
    const { app, store, login, metrics } = setup();
    const { cookie } = readSessionCookie(await login());
    const run = store.run.bind(store);
    vi.spyOn(store, 'run').mockImplementationOnce((work) =>
      run(async (transaction) => {
        await work(transaction);
        throw new Error('Falha na transação');
      }),
    );

    const failed = await login(undefined, { Cookie: cookie });

    expect(failed.status).toBe(500);
    expect(failed.headers.get('Set-Cookie')).toBeNull();
    expect((await app.request('/auth/me', { headers: { Cookie: cookie } })).status).toBe(200);
    expect(metrics.calls).toEqual([
      { method: 'increment', name: 'nexo_logins_total', labels: { result: 'success' } },
    ]);
  });

  it('limita a décima primeira tentativa por IP e informa quando tentar novamente', async () => {
    const { clock, login, metrics } = setup();
    const credentials = { email: 'desconhecido@example.com', password: 'senha' };
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await login(credentials)).status).toBe(401);
    }

    const limited = await login(credentials);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
    expect(ErrorResponseSchema.parse(await limited.json()).error.code).toBe('RATE_LIMITED');
    expect(metrics.calls).toContainEqual({
      method: 'increment',
      name: 'nexo_rate_limited_total',
      labels: { scope: 'login' },
    });

    expect((await login(credentials, { 'X-Forwarded-For': '192.0.2.2' })).status).toBe(401);
    clock.set(new Date('2026-12-09T12:01:00Z'));
    expect((await login(credentials)).status).toBe(401);
  });

  it('recusa outra origem antes de processar as credenciais', async () => {
    const { login, metrics, store } = setup();
    const run = vi.spyOn(store, 'run');
    const response = await login(undefined, { Origin: 'https://outra-origem.example.com' });

    expect(response.status).toBe(403);
    expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe('FORBIDDEN');
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(run).not.toHaveBeenCalled();
    expect(metrics.calls).toEqual([]);
  });

  it('responde 401 quando requireRole não encontra usuário no contexto', async () => {
    const { app } = setup();
    app.get('/teste/analistas', requireRole(UserRole.ANALYST), (context) =>
      context.body(null, 204),
    );

    const response = await app.request('/teste/analistas');

    expect(response.status).toBe(401);
    expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('autoriza somente quem tem a função exigida pela rota', async () => {
    const { app, store, clock, login } = setup();
    app.get(
      '/teste/analistas',
      session({ users: store.users, sessions: store.sessions, clock }),
      requireRole(UserRole.ANALYST),
      (context) => context.body(null, 204),
    );

    const { cookie } = readSessionCookie(await login());
    const denied = await app.request('/teste/analistas', { headers: { Cookie: cookie } });
    expect(denied.status).toBe(403);
    expect(ErrorResponseSchema.parse(await denied.json()).error.code).toBe('FORBIDDEN');

    const analyst = SEED_USERS.find(({ role }) => role === UserRole.ANALYST);
    if (analyst === undefined) {
      throw new Error('Analista ausente no seed');
    }
    const approved = readSessionCookie(await login({ email: analyst.email, password: 'senha' }));
    expect(
      (await app.request('/teste/analistas', { headers: { Cookie: approved.cookie } })).status,
    ).toBe(204);
  });

  it('registra o identificador da sessão autenticada sem vazar credenciais ou dados pessoais', async () => {
    const { app, logs, login } = setup();
    const { token, cookie } = readSessionCookie(await login());
    const response = await app.request('/auth/me', { headers: { Cookie: cookie } });

    expect(logs).toHaveLength(2);
    const durationMs: unknown = expect.any(Number);
    expect(logs.map((line): unknown => JSON.parse(line))[1]).toEqual({
      level: 30,
      requestId: response.headers.get(REQUEST_ID_HEADER),
      userId: ana.id,
      method: 'GET',
      path: '/auth/me',
      status: 200,
      durationMs,
    });
    expect(logs.join('')).not.toContain(token);
    expect(logs.join('')).not.toContain(anaEmail);
    expect(logs.join('')).not.toContain('senha-privada');
    expect(logs.join('')).not.toContain(ana.name);
  });
});
