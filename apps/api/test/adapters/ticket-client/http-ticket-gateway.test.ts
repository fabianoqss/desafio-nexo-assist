import {
  ACTOR_ID_HEADER,
  ACTOR_ROLE_HEADER,
  ErrorCode,
  IDEMPOTENCY_KEY_HEADER,
  REQUEST_ID_HEADER,
  SERVICE_AUTH_HEADER,
  type CreateTicketRequest,
  type TicketResponse,
} from '@nexo/contracts';
import {
  ApplicationError,
  ConflictError,
  HTTP_STATUS_BY_ERROR_CODE,
  NotFoundError,
} from '@nexo/server-kit';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unavailableAgentTurnRunner } from '../../../src/adapters/agent/unavailable-agent-turn-runner.ts';
import { createInMemoryConversationEventBus } from '../../../src/adapters/events/in-memory-conversation-event-bus.ts';
import { createApp } from '../../../src/adapters/http/app.ts';
import { systemClock } from '../../../src/adapters/clock/system-clock.ts';
import { createInMemoryRateLimiter } from '../../../src/adapters/rate-limit/in-memory-rate-limiter.ts';
import { createHttpTicketGateway } from '../../../src/adapters/ticket-client/http-ticket-gateway.ts';
import { TicketServiceUnavailableError } from '../../../src/application/ports/ticket-gateway.ts';
import { createFakeTicketService } from '../../support/fake-ticket-service.ts';
import { InMemoryApiStore } from '../../support/in-memory-api-store.ts';
import { RecordingMetrics } from '../../support/recording-metrics.ts';

const apiToken = 'token-privado-do-servico-de-chamados';
const actor = { id: '6ba7b810-9dad-41d1-80b4-00c04fd430c8', role: 'EMPLOYEE' } as const;
const ticketRequest: CreateTicketRequest = {
  type: 'INC',
  title: 'VPN indisponível',
  description: 'A conexão cai depois da autenticação',
  category: 'NETWORK_VPN',
  impact: 'SELF',
  urgency: 'BLOCKED',
};
const ticket: TicketResponse = {
  ...ticketRequest,
  id: 'INC-00001',
  priority: 'HIGH',
  status: 'OPEN',
  requesterId: actor.id,
  createdAt: '2026-11-23T10:00:00Z',
  lastUpdateAt: '2026-11-23T10:00:00Z',
  dueAt: '2026-11-23T18:00:00Z',
  overdue: false,
};
const unavailable = {
  status: 503,
  body: { error: { code: ErrorCode.SERVICE_UNAVAILABLE, message: 'Indisponível' } },
};

function setup({
  fetch,
  baseUrl = 'http://ticket-service.test',
}: { fetch?: typeof globalThis.fetch; baseUrl?: string } = {}) {
  const fake = createFakeTicketService();
  const metrics = new RecordingMetrics();
  const logs: string[] = [];
  const logger = pino({}, { write: (line) => logs.push(line) });
  const gateway = createHttpTicketGateway({
    baseUrl,
    apiToken,
    fetch: fetch ?? fake.fetch,
    metrics,
    logger,
    policy: { timeoutMs: 20, initialDelayMs: 1, maxDelayMs: 2, halfOpenAfterMs: 100 },
  });
  return { gateway, fake, logger, logs, metrics };
}

describe('gateway HTTP de chamados', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('serializa a busca e propaga o ator e o ID da requisição corrente da API', async () => {
    const { gateway, fake, logger, metrics } = setup();
    const store = new InMemoryApiStore();
    const app = createApp({
      logger,
      checkReadiness: () => Promise.resolve(true),
      env: { WEB_ORIGIN: 'http://localhost:5173', TRUST_PROXY: false, SESSION_TTL_HOURS: 12 },
      clock: systemClock,
      metrics,
      rateLimiter: createInMemoryRateLimiter(),
      users: store.users,
      sessions: store.sessions,
      unitOfWork: store,
      eventBus: createInMemoryConversationEventBus(),
      agentTurnRunner: unavailableAgentTurnRunner,
      ticketGateway: gateway,
    });
    const query = { requesterId: actor.id, status: 'OPEN', limit: 7 } as const;
    app.get('/test-tickets', async (context) => context.json(await gateway.list(actor, query)));
    fake.program('GET', '/tickets', { status: 200, body: [{ ...ticket, extra: true }] });

    const response = await app.request('/test-tickets');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([ticket]);
    const [sent] = fake.requests;
    expect(Object.fromEntries(sent?.url.searchParams ?? [])).toEqual({ ...query, limit: '7' });
    expect(sent?.headers.get(SERVICE_AUTH_HEADER)).toBe(`Bearer ${apiToken}`);
    expect(sent?.headers.get(ACTOR_ID_HEADER)).toBe(actor.id);
    expect(sent?.headers.get(ACTOR_ROLE_HEADER)).toBe(actor.role);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBeTruthy();
    expect(sent?.headers.get(REQUEST_ID_HEADER)).toBe(response.headers.get(REQUEST_ID_HEADER));
    expect(sent?.headers.has(IDEMPOTENCY_KEY_HEADER)).toBe(false);
  });

  it('repete a escrita com a mesma chave e registra os dois retries da operação', async () => {
    const { gateway, fake, metrics } = setup();
    const key = 'draft-00001';
    fake.program('POST', '/tickets', unavailable, unavailable, { status: 200, body: ticket });

    const request = gateway.create(actor, { ...ticketRequest, ...{ actorId: 'outro-ator' } }, key);
    await vi.runAllTimersAsync();

    expect(await request).toEqual(ticket);
    expect(fake.requests.map(({ headers }) => headers.get(IDEMPOTENCY_KEY_HEADER))).toEqual([
      key,
      key,
      key,
    ]);
    for (const sent of fake.requests) {
      expect(sent.headers.get(ACTOR_ID_HEADER)).toBe(actor.id);
      expect(sent.headers.has(REQUEST_ID_HEADER)).toBe(false);
      expect(sent.headers.get('content-type')).toBe('application/json');
      expect(JSON.parse(sent.body)).toEqual(ticketRequest);
    }
    expect(metrics.calls.filter(({ method }) => method === 'increment')).toEqual(
      Array.from({ length: 2 }, () => ({
        method: 'increment',
        name: 'nexo_ticket_client_retries_total',
        labels: { operation: 'create' },
      })),
    );
  });

  it('esgota os retries para 503 e retorna o erro de indisponibilidade', async () => {
    const { gateway, fake } = setup();
    fake.program('GET', `/tickets/${ticket.id}`, unavailable, unavailable, unavailable);

    const assertion = expect(gateway.get(actor, ticket.id)).rejects.toBeInstanceOf(
      TicketServiceUnavailableError,
    );
    await vi.runAllTimersAsync();

    await assertion;
    expect(fake.requests).toHaveLength(3);
    expect(HTTP_STATUS_BY_ERROR_CODE[new TicketServiceUnavailableError().code]).toBe(503);
  });

  it('aborta cada tentativa que excede o timeout e esgota os retries', async () => {
    const { gateway, fake } = setup();
    const delayed = { status: 200, body: ticket, delayMs: 100 };
    fake.program('GET', `/tickets/${ticket.id}`, delayed, delayed, delayed);

    const assertion = expect(gateway.get(actor, ticket.id)).rejects.toBeInstanceOf(
      TicketServiceUnavailableError,
    );
    await vi.advanceTimersByTimeAsync(70);

    await assertion;
    expect(fake.requests).toHaveLength(3);
    expect(fake.requests.every(({ signal }) => signal.aborted)).toBe(true);
    await vi.runAllTimersAsync();
  });

  it('refaz uma chamada cujo fetch falha na rede', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError('Falha na rede'))
      .mockResolvedValueOnce(Response.json(ticket));
    const { gateway } = setup({ fetch });
    const request = gateway.get(actor, ticket.id);
    await vi.runAllTimersAsync();

    expect(await request).toEqual(ticket);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('devolve NotFoundError para 404 sem retry', async () => {
    const { gateway, fake } = setup();
    fake.program('GET', `/tickets/${ticket.id}`, {
      status: 404,
      body: { error: { code: ErrorCode.NOT_FOUND, message: 'Ausente' } },
    });

    await expect(gateway.get(actor, ticket.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(fake.requests).toHaveLength(1);
  });

  it('devolve NotFoundError sem esperar por um corpo de 404 que ficou pendente', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(body, { status: 404 }));
    const { gateway } = setup({ fetch });

    const assertion = expect(gateway.get(actor, ticket.id)).rejects.toBeInstanceOf(NotFoundError);
    await vi.runAllTimersAsync();

    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('mantém o prefixo de caminho configurado na URL do serviço', async () => {
    const { gateway, fake } = setup({ baseUrl: 'http://ticket-service.test/proxy/chamados' });
    fake.program('GET', '/proxy/chamados/tickets', { status: 200, body: [] });

    await expect(gateway.list(actor, { limit: 1 })).resolves.toEqual([]);
    expect(fake.requests[0]?.url.pathname).toBe('/proxy/chamados/tickets');
  });

  it('preserva o código do conflito de reabertura sem retry', async () => {
    const { gateway, fake } = setup();
    fake.program('POST', `/tickets/${ticket.id}/reopen`, {
      status: 409,
      body: { error: { code: ErrorCode.REOPEN_NOT_ALLOWED, message: 'Fechado' } },
    });

    const error = await gateway
      .reopen(actor, ticket.id, { message: 'Falha recorrente' }, 'draft-00002')
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toMatchObject({ code: ErrorCode.REOPEN_NOT_ALLOWED });
    expect(fake.requests).toHaveLength(1);
  });

  it('valida e retorna candidatos a duplicidade e o chamado atualizado', async () => {
    const { gateway, fake } = setup();
    const candidate = { ticket, similarity: 0.8, action: 'UPDATE' };
    const query = { category: 'NETWORK_VPN', summary: 'Rede & VPN + erro?' } as const;
    const update = { message: 'Há mais pessoas afetadas' };
    fake.program('GET', '/tickets/duplicates', { status: 200, body: [candidate] });
    fake.program('POST', `/tickets/${ticket.id}/info`, { status: 200, body: ticket });

    await expect(gateway.findDuplicates(actor, query)).resolves.toEqual([candidate]);
    await expect(gateway.addInfo(actor, ticket.id, update, 'draft-00003')).resolves.toEqual(ticket);
    const [search, info] = fake.requests;
    expect(Object.fromEntries(search?.url.searchParams ?? [])).toEqual(query);
    expect(info?.headers.get(IDEMPOTENCY_KEY_HEADER)).toBe('draft-00003');
    expect(info?.body).toBe(JSON.stringify(update));
  });

  it('retorna INTERNAL_ERROR para um sucesso fora do contrato', async () => {
    const { gateway, fake } = setup();
    fake.program('GET', `/tickets/${ticket.id}`, { status: 200, body: { id: ticket.id } });

    await expect(gateway.get(actor, ticket.id)).rejects.toEqual(
      expect.objectContaining({ code: ErrorCode.INTERNAL_ERROR }),
    );
    expect(fake.requests).toHaveLength(1);
  });

  it.each([400, 401, 403, 409, 500])(
    'mapeia o erro de integração %s e omite dados privados',
    async (status) => {
      const { gateway, fake, logs } = setup();
      const privateData = 'dados-pessoais-privados';
      fake.program('GET', `/tickets/${ticket.id}`, {
        status,
        body: { error: { code: ErrorCode.UNAUTHORIZED, message: `${privateData} ${apiToken}` } },
      });

      const error = await gateway.get(actor, ticket.id).catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(ApplicationError);
      expect(error).toMatchObject({ code: ErrorCode.INTERNAL_ERROR });
      expect(String(error)).not.toContain(apiToken);
      expect(fake.requests).toHaveLength(1);
      expect(logs.map((line): unknown => JSON.parse(line))).toContainEqual(
        expect.objectContaining({ errorName: 'ApplicationError', status }),
      );
      expect(logs.join('')).not.toContain(apiToken);
      expect(logs.join('')).not.toContain(privateData);
    },
  );

  it('não expõe dados da exceção de um fetch rejeitado', async () => {
    const unsafe = Object.assign(new TypeError(apiToken), { name: apiToken, code: apiToken });
    const { gateway, logs } = setup({ fetch: () => Promise.reject(unsafe) });
    const result = gateway.get(actor, ticket.id).catch((cause: unknown) => cause);
    await vi.runAllTimersAsync();

    const error = await result;
    expect(error).toBeInstanceOf(TicketServiceUnavailableError);
    expect(String(error)).not.toContain(apiToken);
    expect(logs.join('')).not.toContain(apiToken);
  });

  it('rejeita um header local inválido sem tentar o transporte ou expor o token', async () => {
    const fake = createFakeTicketService();
    const metrics = new RecordingMetrics();
    const logs: string[] = [];
    const logger = pino({}, { write: (line) => logs.push(line) });
    const fetch = vi.fn(fake.fetch);
    const gateway = createHttpTicketGateway({
      baseUrl: 'http://ticket-service.test',
      apiToken: `${apiToken}\ninválido`,
      fetch,
      logger,
      metrics,
    });

    const result = gateway.get(actor, ticket.id).catch((cause: unknown) => cause);
    await vi.runAllTimersAsync();

    const error = await result;
    expect(error).toMatchObject({ code: ErrorCode.INTERNAL_ERROR });
    expect(fetch).not.toHaveBeenCalled();
    expect(String(error)).not.toContain(apiToken);
    expect(logs.join('')).not.toContain(apiToken);
  });
});
