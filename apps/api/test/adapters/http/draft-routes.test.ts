import {
  ACTOR_ID_HEADER,
  ACTOR_ROLE_HEADER,
  DraftResponseSchema,
  ErrorCode,
  ErrorResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
  type CreateTicketRequest,
  type TicketResponse,
} from '@nexo/contracts';
import { DraftKind, DraftStatus, MessageAuthor } from '@nexo/domain';
import { SEED_USERS } from '@nexo/seed-data';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { unavailableAgentTurnRunner } from '../../../src/adapters/agent/unavailable-agent-turn-runner.ts';
import { createInMemoryConversationEventBus } from '../../../src/adapters/events/in-memory-conversation-event-bus.ts';
import { createApp } from '../../../src/adapters/http/app.ts';
import { createDatabase } from '../../../src/adapters/persistence/database.ts';
import { createDrizzleSessionRepository } from '../../../src/adapters/persistence/drizzle-session-repository.ts';
import { createDrizzleUnitOfWork } from '../../../src/adapters/persistence/drizzle-unit-of-work.ts';
import { createDrizzleUserRepository } from '../../../src/adapters/persistence/drizzle-user-repository.ts';
import { createInMemoryRateLimiter } from '../../../src/adapters/rate-limit/in-memory-rate-limiter.ts';
import { createHttpTicketGateway } from '../../../src/adapters/ticket-client/http-ticket-gateway.ts';
import type { Conversation } from '../../../src/application/model/conversation.ts';
import type { Draft } from '../../../src/application/model/draft.ts';
import { createFakeTicketService } from '../../support/fake-ticket-service.ts';
import { FixedClock } from '../../support/fixed-clock.ts';
import { startPostgres } from '../../support/postgres-container.ts';
import { RecordingMetrics } from '../../support/recording-metrics.ts';

const [ana, bruno, , , , , gabriela] = SEED_USERS;
const origin = 'https://web.example.com';
const apiToken = 'token-secreto-integracao-chamados-1234';
const baseDate = new Date('2026-11-23T15:00:00.000Z');

const createTicketRequest: CreateTicketRequest = {
  type: 'INC',
  title: 'VPN indisponível para o time',
  description: 'A VPN cai logo após a autenticação MFA',
  category: 'NETWORK_VPN',
  impact: 'SELF',
  urgency: 'BLOCKED',
};

function ticketResponse(id: string, requesterId: string = ana.id): TicketResponse {
  return {
    ...createTicketRequest,
    id,
    priority: 'HIGH',
    status: 'OPEN',
    requesterId,
    createdAt: baseDate.toISOString(),
    lastUpdateAt: baseDate.toISOString(),
    dueAt: '2026-11-23T23:00:00.000Z',
    overdue: false,
  };
}

describe('rotas de rascunhos com PostgreSQL e cliente resiliente', () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>> | undefined;
  let database: ReturnType<typeof createDatabase> | undefined;
  let db: ReturnType<typeof createDatabase>['db'];
  let unitOfWork: ReturnType<typeof createDrizzleUnitOfWork>;

  beforeAll(async () => {
    postgres = await startPostgres();
    database = createDatabase(postgres.url);
    db = database.db;
    unitOfWork = createDrizzleUnitOfWork(db);
  }, 120_000);

  afterAll(async () => {
    try {
      await database?.pool.end();
    } finally {
      await postgres?.stop();
    }
  }, 120_000);

  beforeEach(async () => {
    await db.execute(
      sql`truncate table users, sessions, conversations, messages, ticket_drafts restart identity`,
    );
    await db.execute(sql`alter sequence public.draft_number_seq restart with 400`);
    await unitOfWork.run(({ users }) => users.upsertMany(SEED_USERS));
  });

  function setup(fetchOverride?: typeof globalThis.fetch) {
    const fake = createFakeTicketService();
    const clock = new FixedClock(baseDate);
    const metrics = new RecordingMetrics();
    const eventBus = createInMemoryConversationEventBus();
    const logs: string[] = [];
    const logger = pino({ base: null, timestamp: false }, { write: (line) => logs.push(line) });
    const ticketGateway = createHttpTicketGateway({
      baseUrl: 'http://ticket-service.test',
      apiToken,
      fetch: fetchOverride ?? fake.fetch,
      metrics,
      logger,
      policy: {
        timeoutMs: 100,
        maxRetries: 2,
        initialDelayMs: 5,
        maxDelayMs: 10,
        failureThreshold: 5,
        halfOpenAfterMs: 50,
      },
    });
    const app = createApp({
      logger,
      checkReadiness: () => Promise.resolve(true),
      env: { WEB_ORIGIN: origin, TRUST_PROXY: false, SESSION_TTL_HOURS: 12 },
      clock,
      metrics,
      rateLimiter: createInMemoryRateLimiter(),
      users: createDrizzleUserRepository(db),
      sessions: createDrizzleSessionRepository(db),
      unitOfWork,
      eventBus,
      agentTurnRunner: unavailableAgentTurnRunner,
      ticketGateway,
    });

    async function login(email: string = ana.email) {
      const response = await app.request('/auth/login', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'senha' }),
      });
      const cookie = response.headers.get('Set-Cookie')?.split(';')[0];
      if (!cookie) {
        throw new Error('Cookie de sessão ausente');
      }
      return cookie;
    }

    function post(path: string, cookie?: string, body?: unknown) {
      const headers = new Headers({ Origin: origin });
      if (cookie !== undefined) {
        headers.set('Cookie', cookie);
      }
      if (body !== undefined) {
        headers.set('Content-Type', 'application/json');
      }
      return app.request(path, {
        method: 'POST',
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }

    async function seedDraft(
      employeeId: string = ana.id,
      payload: Draft['payload'] = { kind: DraftKind.CREATE, ticket: createTicketRequest },
    ) {
      const conversation: Conversation = {
        id: randomUUID(),
        employeeId,
        status: 'WITH_AGENT',
        employeeMessageCount: 1,
        createdAt: baseDate,
        lastMessageAt: baseDate,
      };
      return unitOfWork.run(async ({ conversations, drafts }) => {
        await conversations.insert(conversation);
        const draft: Draft = {
          id: await drafts.nextId(),
          conversationId: conversation.id,
          status: DraftStatus.PENDING,
          payload,
          createdAt: baseDate,
        };
        await drafts.insert(draft);
        return { conversation, draft };
      });
    }

    return { app, fake, clock, metrics, eventBus, logs, login, post, seedDraft };
  }

  it('confirma um rascunho CREATE, grava mensagem SYSTEM, publica eventos e oculta conteúdo nos logs', async () => {
    const { fake, metrics, eventBus, logs, login, post, seedDraft } = setup();
    const { conversation, draft } = await seedDraft();
    const cookie = await login();
    const created = ticketResponse('INC-20321');
    fake.program('POST', '/tickets', { status: 201, body: created });
    const events: unknown[] = [];
    eventBus.subscribe({ conversationId: conversation.id }, (event) => {
      events.push(event);
    });

    const response = await post(`/drafts/${draft.id}/confirm`, cookie, {
      actorId: bruno.id,
      requesterId: bruno.id,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = DraftResponseSchema.parse(await response.json());
    expect(body).toEqual({
      id: draft.id,
      conversationId: conversation.id,
      status: DraftStatus.CONFIRMED,
      payload: draft.payload,
      ticketId: 'INC-20321',
      createdAt: baseDate.toISOString(),
    });

    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.headers.get(ACTOR_ID_HEADER)).toBe(ana.id);
    expect(fake.requests[0]?.headers.get(ACTOR_ROLE_HEADER)).toBe('EMPLOYEE');
    expect(fake.requests[0]?.headers.get(IDEMPOTENCY_KEY_HEADER)).toBe(`draft-${draft.id}`);

    const messages = await unitOfWork.run(({ messages: repo }) =>
      repo.listByConversation(conversation.id, 10),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      author: MessageAuthor.SYSTEM,
      content: 'Chamado INC-20321 criado.',
    });
    expect(events).toHaveLength(2);
    expect(metrics.calls).toContainEqual({
      method: 'increment',
      name: 'nexo_drafts_total',
      labels: { kind: DraftKind.CREATE, outcome: 'confirmed' },
    });
    expect(metrics.calls).toContainEqual({
      method: 'increment',
      name: 'nexo_tickets_created_total',
      labels: { type: 'INC' },
    });
    expect(logs.join('')).not.toContain(createTicketRequest.title);
    expect(logs.join('')).not.toContain(createTicketRequest.description);
    expect(logs.join('')).not.toContain(apiToken);
    expect(logs.join('')).not.toContain(ana.email);
  });

  it('devolve o mesmo ticketId em confirmação repetida sem chamar o serviço outra vez', async () => {
    const { fake, login, post, seedDraft } = setup();
    const { draft } = await seedDraft();
    const cookie = await login();
    fake.program('POST', '/tickets', { status: 201, body: ticketResponse('INC-20322') });

    const first = await post(`/drafts/${draft.id}/confirm`, cookie);
    const second = await post(`/drafts/${draft.id}/confirm`, cookie);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(DraftResponseSchema.parse(await second.json())).toEqual(
      DraftResponseSchema.parse(await first.json()),
    );
    expect(fake.requests).toHaveLength(1);
  });

  it('deduplica duas confirmações simultâneas com a mesma chave de idempotência no PostgreSQL', async () => {
    const byIdempotencyKey = new Map<string, TicketResponse>();
    const receivedKeys: (string | null)[] = [];
    let sequence = 20330;

    const idempotentFetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      const key = request.headers.get(IDEMPOTENCY_KEY_HEADER);
      receivedKeys.push(key);
      expect(request.headers.get(ACTOR_ID_HEADER)).toBe(ana.id);
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
      const existing = key ? byIdempotencyKey.get(key) : undefined;
      const ticket = existing ?? ticketResponse(`INC-${String(sequence++)}`);
      if (key && !existing) {
        byIdempotencyKey.set(key, ticket);
      }
      return Response.json(ticket, { status: 201 });
    };

    const { metrics, login, post, seedDraft } = setup(idempotentFetch);
    const { conversation, draft } = await seedDraft();
    const cookie = await login();

    const [first, second] = await Promise.all([
      post(`/drafts/${draft.id}/confirm`, cookie),
      post(`/drafts/${draft.id}/confirm`, cookie),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = DraftResponseSchema.parse(await first.json());
    const secondBody = DraftResponseSchema.parse(await second.json());
    expect(firstBody.status).toBe(DraftStatus.CONFIRMED);
    expect(secondBody).toEqual(firstBody);
    expect(firstBody.ticketId).toBe('INC-20330');
    expect(byIdempotencyKey.size).toBe(1);
    expect(receivedKeys).toEqual([`draft-${draft.id}`, `draft-${draft.id}`]);

    const messages = await unitOfWork.run(({ messages: repo }) =>
      repo.listByConversation(conversation.id, 10),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('Chamado INC-20330 criado.');
    expect(
      metrics.calls.filter(
        (call) => call.name === 'nexo_drafts_total' && call.labels?.outcome === 'confirmed',
      ),
    ).toHaveLength(1);
    expect(metrics.calls.filter((call) => call.name === 'nexo_tickets_created_total')).toHaveLength(
      1,
    );
  });

  it('retorna 503 preservando PENDING quando o serviço falha e confirma ao recuperar', async () => {
    const { fake, metrics, login, post, seedDraft } = setup();
    const { conversation, draft } = await seedDraft();
    const cookie = await login();
    const unavailable = {
      status: 503,
      body: { error: { code: ErrorCode.SERVICE_UNAVAILABLE, message: 'Indisponível' } },
    };
    fake.program('POST', '/tickets', unavailable, unavailable, unavailable, {
      status: 201,
      body: ticketResponse('INC-20340'),
    });

    const failed = await post(`/drafts/${draft.id}/confirm`, cookie);
    expect(failed.status).toBe(503);
    expect(ErrorResponseSchema.parse(await failed.json()).error.code).toBe(
      ErrorCode.TICKET_SERVICE_UNAVAILABLE,
    );

    const storedAfterFailure = await unitOfWork.run(({ drafts }) => drafts.findById(draft.id));
    expect(storedAfterFailure?.status).toBe(DraftStatus.PENDING);
    expect(
      await unitOfWork.run(({ messages }) => messages.listByConversation(conversation.id, 10)),
    ).toEqual([]);
    expect(metrics.calls).toContainEqual({
      method: 'increment',
      name: 'nexo_drafts_total',
      labels: { kind: DraftKind.CREATE, outcome: 'failed' },
    });

    const recovered = await post(`/drafts/${draft.id}/confirm`, cookie);
    expect(recovered.status).toBe(200);
    expect(DraftResponseSchema.parse(await recovered.json())).toMatchObject({
      status: DraftStatus.CONFIRMED,
      ticketId: 'INC-20340',
    });
    expect(fake.requests.map(({ headers }) => headers.get(IDEMPOTENCY_KEY_HEADER))).toEqual([
      `draft-${draft.id}`,
      `draft-${draft.id}`,
      `draft-${draft.id}`,
      `draft-${draft.id}`,
    ]);
  });

  it('propaga 409 REOPEN_NOT_ALLOWED mantendo o rascunho PENDING', async () => {
    const { fake, login, post, seedDraft } = setup();
    const { conversation, draft } = await seedDraft(ana.id, {
      kind: DraftKind.REOPEN,
      ticketId: 'INC-20298',
      message: 'Tentando reabrir chamado antigo',
    });
    const cookie = await login();
    fake.program('POST', '/tickets/INC-20298/reopen', {
      status: 409,
      body: { error: { code: ErrorCode.REOPEN_NOT_ALLOWED, message: 'Prazo expirado' } },
    });

    const response = await post(`/drafts/${draft.id}/confirm`, cookie);

    expect(response.status).toBe(409);
    expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe(
      ErrorCode.REOPEN_NOT_ALLOWED,
    );
    expect((await unitOfWork.run(({ drafts }) => drafts.findById(draft.id)))?.status).toBe(
      DraftStatus.PENDING,
    );
    expect(
      await unitOfWork.run(({ messages }) => messages.listByConversation(conversation.id, 10)),
    ).toEqual([]);
  });

  it('iguala 404 para rascunho de outro funcionário e inexistente e aplica RBAC e validação', async () => {
    const { fake, login, post, seedDraft } = setup();
    const { draft } = await seedDraft();
    const brunoCookie = await login(bruno.email);
    const analystCookie = await login(gabriela.email);

    for (const action of ['confirm', 'cancel'] as const) {
      const other = await post(`/drafts/${draft.id}/${action}`, brunoCookie);
      const missing = await post(`/drafts/D-99999/${action}`, brunoCookie);
      expect(other.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(await other.json()).toEqual(await missing.json());

      const analyst = await post(`/drafts/${draft.id}/${action}`, analystCookie);
      expect(analyst.status).toBe(403);
      expect(ErrorResponseSchema.parse(await analyst.json()).error.code).toBe(ErrorCode.FORBIDDEN);

      const anonymous = await post(`/drafts/${draft.id}/${action}`);
      expect(anonymous.status).toBe(401);
      expect(ErrorResponseSchema.parse(await anonymous.json()).error.code).toBe(
        ErrorCode.UNAUTHORIZED,
      );

      const invalid = await post(`/drafts/invalido/${action}`, brunoCookie);
      expect(invalid.status).toBe(400);
      expect(ErrorResponseSchema.parse(await invalid.json()).error.code).toBe(
        ErrorCode.VALIDATION_FAILED,
      );
    }

    expect(fake.requests).toEqual([]);
  });

  it('cancela um rascunho PENDING e rejeita cancelamento ou confirmação posterior com 409', async () => {
    const { fake, metrics, login, post, seedDraft } = setup();
    const { draft } = await seedDraft();
    const cookie = await login();

    const cancelled = await post(`/drafts/${draft.id}/cancel`, cookie);
    expect(cancelled.status).toBe(200);
    expect(DraftResponseSchema.parse(await cancelled.json())).toMatchObject({
      id: draft.id,
      status: DraftStatus.CANCELLED,
    });

    const cancelAgain = await post(`/drafts/${draft.id}/cancel`, cookie);
    expect(cancelAgain.status).toBe(409);
    expect(ErrorResponseSchema.parse(await cancelAgain.json()).error.code).toBe(
      ErrorCode.DRAFT_NOT_PENDING,
    );

    const confirmCancelled = await post(`/drafts/${draft.id}/confirm`, cookie);
    expect(confirmCancelled.status).toBe(409);
    expect(ErrorResponseSchema.parse(await confirmCancelled.json()).error.code).toBe(
      ErrorCode.DRAFT_NOT_PENDING,
    );
    expect(fake.requests).toEqual([]);
    expect(metrics.calls).toContainEqual({
      method: 'increment',
      name: 'nexo_drafts_total',
      labels: { kind: DraftKind.CREATE, outcome: 'cancelled' },
    });
  });
});
