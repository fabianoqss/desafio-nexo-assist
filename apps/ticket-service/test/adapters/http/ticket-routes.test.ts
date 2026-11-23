import {
  ACTOR_ID_HEADER,
  ACTOR_ROLE_HEADER,
  DuplicateCandidateResponseSchema,
  ErrorCode,
  ErrorResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
  SERVICE_AUTH_HEADER,
  TicketResponseSchema,
} from '@nexo/contracts';
import { UserRole } from '@nexo/domain';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/adapters/http/app.ts';
import { createLogger } from '../../../src/adapters/logging/logger.ts';
import { createDatabase } from '../../../src/adapters/persistence/database.ts';
import { createDrizzleIdempotencyRepository } from '../../../src/adapters/persistence/drizzle-idempotency-repository.ts';
import { createDrizzleTicketRepository } from '../../../src/adapters/persistence/drizzle-ticket-repository.ts';
import { createDrizzleUnitOfWork } from '../../../src/adapters/persistence/drizzle-unit-of-work.ts';
import { FixedClock } from '../../support/fixed-clock.ts';
import { startPostgres } from '../../support/postgres-container.ts';

const apiToken = 'token-de-integracao-do-ticket-service';
const now = new Date('2026-12-09T12:00:00.000Z');
const ana = '00000000-0000-4000-8000-000000000001';
const bruno = '00000000-0000-4000-8000-000000000002';
const analyst = '00000000-0000-4000-8000-000000000003';
const draft = {
  type: 'INC',
  title: 'VPN não conecta',
  description: 'VPN não conecta ao trabalhar remotamente.',
  category: 'NETWORK_VPN',
  impact: 'SELF',
  urgency: 'BLOCKED',
};

const employeeHeaders = {
  [SERVICE_AUTH_HEADER]: `Bearer ${apiToken}`,
  [ACTOR_ID_HEADER]: ana,
  [ACTOR_ROLE_HEADER]: UserRole.EMPLOYEE,
};
const analystHeaders = {
  ...employeeHeaders,
  [ACTOR_ID_HEADER]: analyst,
  [ACTOR_ROLE_HEADER]: UserRole.ANALYST,
};

async function expectError(response: Response, status: number, code: ErrorCode) {
  expect(response.status).toBe(status);
  const body = ErrorResponseSchema.parse(await response.json());
  expect(body.error.code).toBe(code);
  return body;
}

describe('rotas HTTP de chamados com PostgreSQL', () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>> | undefined;
  let database: ReturnType<typeof createDatabase> | undefined;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    postgres = await startPostgres();
    database = createDatabase(postgres.url);
    const { db, checkReadiness } = database;
    app = createApp({
      logger: createLogger('silent'),
      checkReadiness,
      apiToken,
      tickets: createDrizzleTicketRepository(db),
      unitOfWork: createDrizzleUnitOfWork(db),
      idempotency: createDrizzleIdempotencyRepository(db),
      clock: new FixedClock(now),
    });
  }, 120_000);

  beforeEach(async () => {
    await database?.db.execute(sql`truncate table idempotency_keys, ticket_events, tickets`);
  });

  afterAll(async () => {
    try {
      await database?.pool.end();
    } finally {
      await postgres?.stop();
    }
  });

  function post(
    path: string,
    key: string,
    body: string,
    actorHeaders: Record<string, string> = employeeHeaders,
  ) {
    return app.request(path, {
      method: 'POST',
      headers: {
        ...actorHeaders,
        [IDEMPOTENCY_KEY_HEADER]: key,
        'content-type': 'application/json',
      },
      body,
    });
  }

  async function createAs(requesterId = ana, key = 'create-ticket') {
    const response = await post('/tickets', key, JSON.stringify(draft), {
      ...employeeHeaders,
      [ACTOR_ID_HEADER]: requesterId,
    });
    expect(response.status).toBe(201);
    return TicketResponseSchema.parse(await response.json());
  }

  async function listAsAna() {
    const response = await app.request('/tickets', { headers: employeeHeaders });
    expect(response.status).toBe(200);
    return TicketResponseSchema.array().parse(await response.json());
  }

  it('retorna 401 sem Authorization', async () => {
    const headers = new Headers(employeeHeaders);
    headers.delete(SERVICE_AUTH_HEADER);
    await expectError(await app.request('/tickets', { headers }), 401, ErrorCode.UNAUTHORIZED);
  });

  it.each(['x'.repeat(apiToken.length), 'curto'])(
    'retorna 401 com token incorreto (%s)',
    async (token) => {
      const headers = { ...employeeHeaders, [SERVICE_AUTH_HEADER]: `Bearer ${token}` };
      await expectError(await app.request('/tickets', { headers }), 401, ErrorCode.UNAUTHORIZED);
    },
  );

  it('retorna 400 sem X-Actor-Role', async () => {
    const headers = new Headers(employeeHeaders);
    headers.delete(ACTOR_ROLE_HEADER);
    await expectError(await app.request('/tickets', { headers }), 400, ErrorCode.VALIDATION_FAILED);
  });

  it('cria um chamado e repete o 201 e o ID no replay sem criar outro', async () => {
    const body = JSON.stringify(draft);
    const first = await post('/tickets', 'replay-create', body);
    expect(first.status).toBe(201);
    expect(first.headers.has(IDEMPOTENT_REPLAYED_HEADER)).toBe(false);
    const ticket = TicketResponseSchema.parse(await first.json());
    expect(ticket).toMatchObject({
      requesterId: ana,
      status: 'OPEN',
      createdAt: now.toISOString(),
      lastUpdateAt: now.toISOString(),
    });
    expect(ticket).not.toHaveProperty('item');
    expect(ticket).not.toHaveProperty('resolvedAt');

    const replay = await post('/tickets', 'replay-create', body);
    expect(replay.status).toBe(201);
    expect(replay.headers.get(IDEMPOTENT_REPLAYED_HEADER)).toBe('true');
    expect(TicketResponseSchema.parse(await replay.json()).id).toBe(ticket.id);
    expect(await listAsAna()).toEqual([ticket]);

    const detail = await app.request(`/tickets/${ticket.id}`, { headers: employeeHeaders });
    expect(detail.status).toBe(200);
    expect(TicketResponseSchema.parse(await detail.json())).toEqual(ticket);
  });

  it('grava um único chamado quando duas criações com a mesma chave chegam juntas', async () => {
    const body = JSON.stringify(draft);
    const responses = await Promise.all([
      post('/tickets', 'concurrent-create', body),
      post('/tickets', 'concurrent-create', body),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses.map((response) => response.headers.get(IDEMPOTENT_REPLAYED_HEADER))).toEqual(
      expect.arrayContaining([null, 'true']),
    );
    const [first, second] = await Promise.all(
      responses.map(async (response) => TicketResponseSchema.parse(await response.json())),
    );
    expect(first?.id).toBe(second?.id);
    expect(await listAsAna()).toEqual([first]);
  });

  it('retorna 400 sem Idempotency-Key', async () => {
    const response = await app.request('/tickets', {
      method: 'POST',
      headers: { ...employeeHeaders, 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    });
    await expectError(response, 400, ErrorCode.VALIDATION_FAILED);
  });

  it('retorna 400 com a categoria HR', async () => {
    const response = await post(
      '/tickets',
      'invalid-category',
      JSON.stringify({ ...draft, category: 'HR' }),
    );
    await expectError(response, 400, ErrorCode.VALIDATION_FAILED);
  });

  it('retorna 400 com JSON malformado', async () => {
    const response = await post('/tickets', 'invalid-json', '{"type":');
    await expectError(response, 400, ErrorCode.VALIDATION_FAILED);
  });

  it('retorna 413 para um corpo de 70 KB', async () => {
    const body = JSON.stringify({ ...draft, description: 'x'.repeat(70 * 1024) });
    const response = await post('/tickets', 'oversized-body', body);
    await expectError(response, 413, ErrorCode.PAYLOAD_TOO_LARGE);
  });

  it('responde com o mesmo 404 para um chamado de Bruno e para um ID inexistente', async () => {
    const ticket = await createAs(bruno);
    const foreign = await app.request(`/tickets/${ticket.id}`, { headers: employeeHeaders });
    const missing = await app.request('/tickets/INC-99999', { headers: employeeHeaders });
    expect(await expectError(foreign, 404, ErrorCode.NOT_FOUND)).toEqual(
      await expectError(missing, 404, ErrorCode.NOT_FOUND),
    );
  });

  it('retorna 403 quando Ana filtra os chamados de Bruno', async () => {
    const response = await app.request(`/tickets?requesterId=${bruno}`, {
      headers: employeeHeaders,
    });
    await expectError(response, 403, ErrorCode.FORBIDDEN);
  });

  it('retorna 400 para o ID inc-1', async () => {
    const response = await app.request('/tickets/inc-1', { headers: employeeHeaders });
    await expectError(response, 400, ErrorCode.VALIDATION_FAILED);
  });

  it('permite que o analista resolva o chamado e que Ana o reabra em seguida', async () => {
    const ticket = await createAs();
    const statusPath = `/tickets/${ticket.id}/status`;
    const resolvedBody = JSON.stringify({ status: 'RESOLVED' });
    const forbidden = await post(statusPath, 'resolve-ana', resolvedBody);
    await expectError(forbidden, 403, ErrorCode.FORBIDDEN);

    const resolved = await post(statusPath, 'resolve-analyst', resolvedBody, analystHeaders);
    expect(resolved.status).toBe(200);
    expect(TicketResponseSchema.parse(await resolved.json())).toMatchObject({
      id: ticket.id,
      status: 'RESOLVED',
      resolvedAt: now.toISOString(),
    });

    const replay = await post(statusPath, 'resolve-analyst', resolvedBody, analystHeaders);
    expect(replay.status).toBe(200);
    expect(replay.headers.get(IDEMPOTENT_REPLAYED_HEADER)).toBe('true');

    const reopened = await post(
      `/tickets/${ticket.id}/reopen`,
      'reopen-ticket',
      JSON.stringify({ message: 'A conexão voltou a falhar.' }),
    );
    expect(reopened.status).toBe(200);
    const reopenedTicket = TicketResponseSchema.parse(await reopened.json());
    expect(reopenedTicket).toMatchObject({ id: ticket.id, status: 'OPEN' });
    expect(reopenedTicket).not.toHaveProperty('resolvedAt');
  });

  it('busca duplicados de Ana e devolve a lista no contrato', async () => {
    const ticket = await createAs();
    await createAs(bruno);
    const query = new URLSearchParams({ category: 'NETWORK_VPN', summary: 'VPN não conecta' });
    const response = await app.request(`/tickets/duplicates?${query.toString()}`, {
      headers: employeeHeaders,
    });

    expect(response.status).toBe(200);
    const candidates = DuplicateCandidateResponseSchema.array().parse(await response.json());
    expect(candidates.map((candidate) => candidate.ticket.id)).toEqual([ticket.id]);
  });

  it('acrescenta informação e rejeita a mesma chave em outro ID ou com outros bytes', async () => {
    const first = await createAs();
    const second = await createAs(ana, 'create-second');
    const path = `/tickets/${first.id}/info`;
    const body = JSON.stringify({ message: 'Falha ao reconectar.' });
    const added = await post(path, 'add-ticket-info', body);
    expect(added.status).toBe(200);
    expect(TicketResponseSchema.parse(await added.json()).id).toBe(first.id);

    const otherTicket = await post(`/tickets/${second.id}/info`, 'add-ticket-info', body);
    await expectError(otherTicket, 409, ErrorCode.IDEMPOTENCY_KEY_REUSED);
    const otherBytes = await post(path, 'add-ticket-info', ` ${body}`);
    await expectError(otherBytes, 409, ErrorCode.IDEMPOTENCY_KEY_REUSED);
  });
});
