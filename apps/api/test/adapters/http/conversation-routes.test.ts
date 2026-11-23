import {
  ConversationEventSchema,
  ConversationResponseSchema,
  ErrorResponseSchema,
} from '@nexo/contracts';
import { SEED_USERS } from '@nexo/seed-data';
import { SSEStreamingApi } from 'hono/streaming';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { unavailableAgentTurnRunner } from '../../../src/adapters/agent/unavailable-agent-turn-runner.ts';
import { createInMemoryConversationEventBus } from '../../../src/adapters/events/in-memory-conversation-event-bus.ts';
import { createApp } from '../../../src/adapters/http/app.ts';
import { createInMemoryRateLimiter } from '../../../src/adapters/rate-limit/in-memory-rate-limiter.ts';
import type {
  AgentTurnEvent,
  AgentTurnRunner,
} from '../../../src/application/ports/agent-turn-runner.ts';
import { FixedClock } from '../../support/fixed-clock.ts';
import { InMemoryApiStore } from '../../support/in-memory-api-store.ts';
import { RecordingMetrics } from '../../support/recording-metrics.ts';

const [ana, bruno, , , , , gabriela] = SEED_USERS;
const origin = 'https://web.example.com';
const missingId = 'f9f22003-706e-450d-993e-aece4f4ec228';

function setup(agentTurnRunner: AgentTurnRunner = unavailableAgentTurnRunner, pingIntervalMs = 5) {
  const unitOfWork = new InMemoryApiStore(SEED_USERS);
  const clock = new FixedClock();
  const metrics = new RecordingMetrics();
  const eventBus = createInMemoryConversationEventBus();
  const unsubscribe = vi.fn();
  const subscribeToBus = eventBus.subscribe.bind(eventBus);
  const subscribe = vi.spyOn(eventBus, 'subscribe').mockImplementation((filter, listener) => {
    const remove = subscribeToBus(filter, listener);
    return () => {
      unsubscribe();
      remove();
    };
  });
  const logs: string[] = [];
  const logger = pino({ base: null, timestamp: false }, { write: (line) => logs.push(line) });
  const app = createApp({
    logger,
    checkReadiness: () => Promise.resolve(true),
    env: { WEB_ORIGIN: origin, TRUST_PROXY: false, SESSION_TTL_HOURS: 12 },
    clock,
    metrics,
    rateLimiter: createInMemoryRateLimiter(),
    users: unitOfWork.users,
    sessions: unitOfWork.sessions,
    unitOfWork,
    eventBus,
    agentTurnRunner,
    pingIntervalMs,
  });

  function post(path: string, body: unknown, cookie?: string) {
    const headers = new Headers({ Origin: origin, 'Content-Type': 'application/json' });
    if (cookie !== undefined) {
      headers.set('Cookie', cookie);
    }
    return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
  }

  async function login(email: string = ana.email) {
    const response = await post('/auth/login', { email, password: 'senha' });
    const cookie = response.headers.get('Set-Cookie')?.split(';')[0];
    if (!cookie) {
      throw new Error('Cookie de sessão ausente');
    }
    return cookie;
  }

  async function current(cookie: string) {
    const response = await app.request('/conversations/current', { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    return ConversationResponseSchema.parse(await response.json());
  }

  return {
    app,
    post,
    login,
    current,
    clock,
    unitOfWork,
    eventBus,
    unsubscribe,
    subscribe,
    metrics,
    logs,
  };
}

function parseEvents(body: string) {
  return body
    .trim()
    .split('\n\n')
    .map((frame) => {
      const data = frame.split('\n').find((line) => line.startsWith('data: '));
      if (!data) {
        throw new Error('Frame SSE sem dados');
      }
      return ConversationEventSchema.parse(JSON.parse(data.slice('data: '.length)));
    });
}

async function readUntilPing(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Stream SSE ausente');
  }
  const decoder = new TextDecoder();
  let body = '';
  try {
    while (!body.includes('event: ping\n')) {
      const chunk = await reader.read();
      if (chunk.done || !(chunk.value instanceof Uint8Array)) {
        throw new Error('Stream encerrado antes do ping');
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    return body;
  } finally {
    await reader.cancel();
  }
}

describe('rotas de conversas do funcionário', () => {
  it('usa o funcionário da sessão e devolve eventos válidos com done', async () => {
    const { post, login, current, logs } = setup();
    const cookie = await login();
    const { id } = await current(cookie);
    expect(id).toBe(id.toLowerCase());
    const response = await post(
      `/conversations/${id.toUpperCase()}/messages`,
      {
        content: '  Conteúdo privado\n de Ana  ',
        employeeId: bruno.id,
        authorId: bruno.id,
      },
      cookie,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(parseEvents(await response.text())).toMatchObject([
      {
        type: 'message',
        message: { author: 'EMPLOYEE', authorId: ana.id, content: 'Conteúdo privado\n de Ana' },
      },
      { type: 'message', message: { author: 'SYSTEM' } },
      { type: 'done' },
    ]);
    expect(logs.at(-1)).toContain('/conversations/:id/messages');
    expect(logs.join('')).not.toMatch(/Conteúdo privado|de Ana/);
    expect((await current(cookie)).employeeMessageCount).toBe(1);
  });

  it('emite erro genérico e done se o runner falhar após abrir o SSE', async () => {
    const { login, current, post, logs } = setup({
      run() {
        throw new Error('dado privado do runner');
      },
    });
    const cookie = await login();
    const { id } = await current(cookie);
    const response = await post(`/conversations/${id}/messages`, { content: 'Ajuda' }, cookie);

    const body = await response.text();
    expect(response.status).toBe(200);
    expect(parseEvents(body).map(({ type }) => type)).toEqual([
      'message',
      'error',
      'message',
      'done',
    ]);
    expect(body + logs.join('')).not.toContain('dado privado do runner');
  });

  it.each(['requisição', 'corpo da resposta'])(
    'cancela o runner ao abortar %s e descarta saídas tardias',
    async (source) => {
      const started = Promise.withResolvers<AbortSignal>();
      const output = Promise.withResolvers<IteratorResult<AgentTurnEvent>>();
      const returned = Promise.withResolvers<IteratorResult<AgentTurnEvent>>();
      const next = vi.fn(() => output.promise);
      const returnFromRunner = vi.fn(() => returned.promise);
      const { app, login, current } = setup({
        run({ signal }) {
          started.resolve(signal);
          return { [Symbol.asyncIterator]: () => ({ next, return: returnFromRunner }) };
        },
      });
      const cookie = await login();
      const { id } = await current(cookie);
      const controller = new AbortController();
      const response = await app.request(`/conversations/${id}/messages`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Ajuda' }),
        signal: controller.signal,
      });
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Stream SSE ausente');
      }

      try {
        const first = await reader.read();
        if (first.done || !(first.value instanceof Uint8Array)) {
          throw new Error('Stream encerrado antes da primeira mensagem');
        }
        expect(new TextDecoder().decode(first.value)).toContain('"author":"EMPLOYEE"');
        const runnerSignal = await started.promise;
        expect(runnerSignal).toBeInstanceOf(AbortSignal);
        expect(runnerSignal.aborted).toBe(false);
        await vi.waitFor(() => {
          expect(next).toHaveBeenCalledTimes(1);
        });

        if (source === 'requisição') {
          controller.abort();
        } else {
          await reader.cancel();
        }
        expect(runnerSignal.aborted).toBe(true);
        await vi.waitFor(() => {
          expect(returnFromRunner).toHaveBeenCalledTimes(1);
        });
        expect((await reader.read()).done).toBe(true);
      } finally {
        controller.abort();
        output.resolve({
          done: false,
          value: { type: 'message', author: 'AGENT', content: 'Tardia' },
        });
        returned.resolve({ done: true, value: undefined });
        await reader.cancel();
      }

      expect(next).toHaveBeenCalledTimes(1);
      expect((await current(cookie)).messages.map(({ author }) => author)).toEqual(['EMPLOYEE']);
    },
  );

  it('iguala ids alheios e inexistentes e aplica RBAC antes de postar', async () => {
    const { app, login, current, post } = setup();
    const anaCookie = await login();
    const brunoCookie = await login(bruno.email);
    const analystCookie = await login(gabriela.email);
    const { id } = await current(anaCookie);
    for (const path of ['messages', 'handoff'] as const) {
      const body = { content: 'Ajuda', reason: 'EMPLOYEE_REQUEST' };
      const other = await post(`/conversations/${id}/${path}`, body, brunoCookie);
      const absent = await post(`/conversations/${missingId}/${path}`, body, brunoCookie);

      expect(other.status).toBe(404);
      expect(absent.status).toBe(404);
      expect(await other.json()).toEqual(await absent.json());
    }
    const analyst = await post(
      `/conversations/${id}/messages`,
      { content: 'Ajuda' },
      analystCookie,
    );
    expect(analyst.status).toBe(403);
    expect(ErrorResponseSchema.parse(await analyst.json()).error.code).toBe('FORBIDDEN');
    const anonymous = await app.request(`/conversations/${id}/events`);
    expect(anonymous.status).toBe(401);
    expect((await current(anaCookie)).messages).toEqual([]);
  });

  it('valida o UUID, o conteúdo e o JSON antes de gravar', async () => {
    const { app, login, current, post } = setup();
    const cookie = await login();
    const { id } = await current(cookie);

    for (const response of [
      await post('/conversations/inválido/messages', { content: 'Ok' }, cookie),
      await post(`/conversations/${id}/messages`, { content: '   ' }, cookie),
      await post(`/conversations/${id}/messages`, { content: 'x'.repeat(4001) }, cookie),
      await post(`/conversations/${id}/messages`, { content: 'a\u0000b' }, cookie),
      await app.request(`/conversations/${id}/messages`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
        body: '{',
      }),
    ]) {
      expect(response.status).toBe(400);
      expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe('VALIDATION_FAILED');
    }

    expect((await current(cookie)).messages).toEqual([]);
  });

  it('responde com 409 JSON antes de iniciar o SSE quando atinge o limite', async () => {
    const { login, current, post, unitOfWork } = setup();
    const cookie = await login();
    const { id } = await current(cookie);
    const stored = await unitOfWork.conversations.findById(id);
    if (!stored) {
      throw new Error('Conversa ausente');
    }
    await unitOfWork.conversations.update({ ...stored, employeeMessageCount: 30 });

    const response = await post(`/conversations/${id}/messages`, { content: 'Ajuda' }, cookie);
    expect(response.status).toBe(409);
    expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe(
      'MESSAGE_LIMIT_REACHED',
    );
    expect((await current(cookie)).messages).toEqual([]);
  });

  it('limita a 20 envios por minuto por usuário, com Retry-After e métrica por escopo', async () => {
    const { login, current, post, clock, metrics } = setup();
    const cookie = await login();
    const brunoCookie = await login(bruno.email);
    const { id } = await current(cookie);
    const { id: brunoId } = await current(brunoCookie);
    const path = `/conversations/${id}/messages`;
    const body = { content: 'Ajuda' };
    for (let index = 0; index < 20; index += 1) {
      const response = await post(path, body, cookie);
      expect(response.status).toBe(200);
      expect(parseEvents(await response.text()).at(-1)).toEqual({ type: 'done' });
    }
    const limited = await post(path, body, cookie);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
    expect(ErrorResponseSchema.parse(await limited.json()).error.code).toBe('RATE_LIMITED');
    expect(metrics.calls).toContainEqual({
      method: 'increment',
      name: 'nexo_rate_limited_total',
      labels: { scope: 'messages' },
    });

    const other = await post(`/conversations/${brunoId}/messages`, body, brunoCookie);
    expect(other.status).toBe(200);
    await other.text();
    clock.set(new Date(clock.now().getTime() + 60_000));
    const resumed = await post(path, body, cookie);
    expect(resumed.status).toBe(200);
    await resumed.text();
  });

  it.each([
    ['EMPLOYEE_REQUEST', 'O funcionário pediu para falar com um analista.'],
    ['MESSAGE_LIMIT', 'Limite de 30 mensagens atingido.'],
  ])(
    'transfere com o resumo previsto para %s e usa a prioridade do domínio',
    async (reason, summary) => {
      const { login, current, post } = setup();
      const cookie = await login();
      const { id } = await current(cookie);
      const response = await post(
        `/conversations/${id}/handoff`,
        {
          reason,
          summary: 'Resumo forjado',
          priority: 'CRITICAL',
          actorId: bruno.id,
        },
        cookie,
      );

      expect(response.status).toBe(200);
      expect(ConversationResponseSchema.parse(await response.json())).toMatchObject({
        status: 'WAITING_ANALYST',
        handoff: { reason, summary, priority: 'MEDIUM' },
        messages: [{ author: 'SYSTEM', content: 'Conversa transferida para um analista.' }],
      });
    },
  );

  it('filtra eventos pelo id, emite ping e remove a assinatura ao cancelar', async () => {
    const { app, login, current, eventBus, subscribe, unsubscribe, clock } = setup();
    const cookie = await login();
    const { id } = await current(cookie);
    const brunoCookie = await login(bruno.email);
    const { id: brunoId } = await current(brunoCookie);

    const other = await app.request(`/conversations/${id}/events`, {
      headers: { Cookie: brunoCookie },
    });
    const absent = await app.request(`/conversations/${missingId}/events`, {
      headers: { Cookie: brunoCookie },
    });
    expect(other.status).toBe(404);
    expect(absent.status).toBe(404);
    expect(await other.json()).toEqual(await absent.json());
    expect(subscribe).not.toHaveBeenCalled();

    const response = await app.request(`/conversations/${id}/events`, {
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    const message = {
      id: '42',
      author: 'ANALYST',
      authorId: gabriela.id,
      createdAt: clock.now().toISOString(),
      content: 'Resposta privada',
    } as const;
    eventBus.publish({
      conversationId: brunoId,
      type: 'message',
      message: { ...message, content: 'Resposta de outra conversa' },
    });
    eventBus.publish({ conversationId: id, type: 'message', message });
    const body = await readUntilPing(response);

    expect(body).toContain('event: ping\n');
    expect(parseEvents(body.split('event: ping')[0] ?? '')).toEqual([{ type: 'message', message }]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('encerra a assinatura assim que a fila atinge o limite de escrita', async () => {
    const { app, login, current, eventBus, unsubscribe } = setup(
      unavailableAgentTurnRunner,
      60_000,
    );
    const cookie = await login();
    const { id } = await current(cookie);
    const response = await app.request(`/conversations/${id}/events`, {
      headers: { Cookie: cookie },
    });

    try {
      for (let index = 0; index < 64; index += 1) {
        eventBus.publish({ conversationId: id, type: 'status', status: 'WAITING_ANALYST' });
      }

      await vi.waitFor(() => {
        expect(unsubscribe).toHaveBeenCalledTimes(1);
      });
      expect(await response.text()).toBe('');
    } finally {
      if (!response.bodyUsed) {
        await response.body?.cancel();
      }
    }
  });

  it.each(['logout', 'expiração', 'sessão válida'])(
    'revalida a sessão com escrita pendente e fecha o SSE após %s',
    async (state) => {
      const pingIntervalMs = 100;
      const { app, login, current, post, eventBus, unsubscribe, unitOfWork, clock } = setup(
        unavailableAgentTurnRunner,
        pingIntervalMs,
      );
      const cookie = await login();
      const { id } = await current(cookie);
      const pendingWrite = Promise.withResolvers<undefined>();
      const write = vi
        .spyOn(SSEStreamingApi.prototype, 'writeSSE')
        .mockReturnValue(pendingWrite.promise);
      const findValid = vi.spyOn(unitOfWork.sessions, 'findValid');
      const controller = new AbortController();
      vi.useFakeTimers();
      try {
        const response = await app.request(`/conversations/${id}/events`, {
          headers: { Cookie: cookie },
          signal: controller.signal,
        });
        await vi.advanceTimersByTimeAsync(pingIntervalMs / 2);
        eventBus.publish({ conversationId: id, type: 'status', status: 'WAITING_ANALYST' });
        await vi.advanceTimersByTimeAsync(0);
        expect(write).toHaveBeenCalledTimes(1);

        if (state === 'logout') {
          expect((await post('/auth/logout', {}, cookie)).status).toBe(204);
        } else if (state === 'expiração') {
          clock.set(new Date(clock.now().getTime() + 12 * 60 * 60_000));
        }
        findValid.mockClear();
        await vi.advanceTimersByTimeAsync(pingIntervalMs / 2);
        expect(findValid).toHaveBeenCalledTimes(1);
        if (state === 'sessão válida') {
          expect(unsubscribe).not.toHaveBeenCalled();
          await vi.advanceTimersByTimeAsync(pingIntervalMs / 2 + 1);
        }
        expect(unsubscribe).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
        expect(await response.text()).toBe('');
      } finally {
        controller.abort();
        pendingWrite.resolve(undefined);
        write.mockRestore();
        findValid.mockRestore();
        vi.useRealTimers();
      }
    },
  );

  it('limita a cinco assinaturas concorrentes por usuário, registra a métrica e libera a vaga', async () => {
    const { app, login, current, metrics, unsubscribe } = setup(unavailableAgentTurnRunner, 1_000);
    const cookie = await login();
    const secondCookie = await login();
    const brunoCookie = await login(bruno.email);
    const { id } = await current(cookie);
    const { id: brunoId } = await current(brunoCookie);
    const open = async (conversationId: string, session: string) =>
      app.request(`/conversations/${conversationId}/events`, { headers: { Cookie: session } });
    const responses = await Promise.all(Array.from({ length: 5 }, () => open(id, cookie)));
    const limited = await open(id, secondCookie);
    responses.push(limited);
    try {
      expect(responses.slice(0, 5).map(({ status }) => status)).toEqual(Array(5).fill(200));
      expect(limited.status).toBe(429);
      expect(limited.headers.get('Retry-After')).toBe('30');
      expect(ErrorResponseSchema.parse(await limited.json()).error.code).toBe('RATE_LIMITED');
      expect(metrics.calls).toContainEqual({
        method: 'increment',
        name: 'nexo_rate_limited_total',
        labels: { scope: 'conversation-events' },
      });

      const otherUser = await open(brunoId, brunoCookie);
      responses.push(otherUser);
      expect(otherUser.status).toBe(200);

      await responses[0]?.body?.cancel();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      const resumed = await open(id, secondCookie);
      responses.push(resumed);
      expect(resumed.status).toBe(200);
    } finally {
      await Promise.all(
        responses.map(async (response) => {
          if (!response.bodyUsed) {
            await response.body?.cancel();
          }
        }),
      );
    }
  });

  it('encerra a assinatura no próximo evento após logout', async () => {
    const { app, login, current, post, eventBus, unsubscribe } = setup(
      unavailableAgentTurnRunner,
      1_000,
    );
    const cookie = await login();
    const { id } = await current(cookie);
    const response = await app.request(`/conversations/${id}/events`, {
      headers: { Cookie: cookie },
    });
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Stream SSE ausente');
    }
    try {
      expect((await post('/auth/logout', {}, cookie)).status).toBe(204);
      eventBus.publish({
        conversationId: id,
        type: 'status',
        status: 'WAITING_ANALYST',
      });
      expect((await reader.read()).done).toBe(true);
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    } finally {
      await reader.cancel();
    }
  });

  it('encerra a assinatura no próximo ping após a sessão expirar', async () => {
    const { app, login, current, clock, unsubscribe } = setup();
    const cookie = await login();
    const { id } = await current(cookie);
    const response = await app.request(`/conversations/${id}/events`, {
      headers: { Cookie: cookie },
    });
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Stream SSE ausente');
    }
    try {
      clock.set(new Date(clock.now().getTime() + 12 * 60 * 60_000));
      expect((await reader.read()).done).toBe(true);
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    } finally {
      await reader.cancel();
    }
  });

  it('responde a HEAD da conversa atual sem criar uma conversa', async () => {
    const { app, login, unitOfWork } = setup();
    const cookie = await login();
    const head = await app.request('/conversations/current', {
      method: 'HEAD',
      headers: { Cookie: cookie },
    });
    expect(head.status).toBe(200);
    expect(await unitOfWork.conversations.findOpenByEmployee(ana.id)).toBeUndefined();
  });

  it('dispensa assinaturas SSE em HEAD e encerra em abort do sinal da requisição', async () => {
    const { app, login, current, subscribe, unsubscribe } = setup();
    const cookie = await login();
    const { id } = await current(cookie);
    const path = `/conversations/${id}/events`;
    const headers = { Cookie: cookie };
    const head = await app.request(path, { method: 'HEAD', headers });
    expect(head.status).toBe(200);
    expect(head.headers.get('Content-Type')).toBe('text/event-stream');
    expect(await head.text()).toBe('');
    expect(subscribe).not.toHaveBeenCalled();

    const controller = new AbortController();
    const response = await app.request(path, { headers, signal: controller.signal });
    controller.abort();
    expect(await response.text()).toBe('');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
