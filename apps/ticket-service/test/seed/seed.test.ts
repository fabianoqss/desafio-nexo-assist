import { canReopen, isOverdue, Priority, UserRole } from '@nexo/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/adapters/persistence/database.ts';
import { createDrizzleUnitOfWork } from '../../src/adapters/persistence/drizzle-unit-of-work.ts';
import { ticketEvents, tickets } from '../../src/adapters/persistence/schema.ts';
import { buildSeedTickets } from '../../src/seed/seed-tickets.ts';
import { SEED_USERS } from '../../src/seed/seed-users.ts';
import { seedTickets } from '../../src/seed/seed.ts';
import { InMemoryTicketStore } from '../support/in-memory-ticket-store.ts';
import { startPostgres } from '../support/postgres-container.ts';

const monday = new Date('2026-12-14T12:00:00Z');
const saturday = new Date('2026-12-19T18:00:00Z');
const hourMs = 3_600_000;
const dayMs = 24 * hourMs;

describe('dados do seed do Anexo B', () => {
  it.each([
    { localTime: 'segunda às 09:00', now: monday },
    { localTime: 'sábado às 15:00', now: saturday },
  ])('reproduz as situações do Anexo B em São Paulo ($localTime)', ({ now }) => {
    const entries = buildSeedTickets(now);

    expect(entries).toHaveLength(8);
    expect(
      Object.fromEntries(entries.map((ticket) => [ticket.id, isOverdue(ticket, now)])),
    ).toEqual({
      'INC-20311': true,
      'REQ-10442': false,
      'INC-20298': false,
      'INC-20250': false,
      'INC-20320': false,
      'REQ-10450': true,
      'INC-20305': false,
      'INC-20290': false,
    });
    expect(entries.filter((ticket) => canReopen(ticket, now)).map((ticket) => ticket.id)).toEqual([
      'INC-20298',
    ]);
    expect(entries.find((ticket) => ticket.id === 'INC-20320')?.priority).toBe(Priority.CRITICAL);
    expect(
      Object.fromEntries(
        entries.map((ticket) => [ticket.id, now.getTime() - ticket.lastUpdateAt.getTime()]),
      ),
    ).toEqual({
      'INC-20311': 7 * dayMs,
      'REQ-10442': hourMs,
      'INC-20298': 2 * dayMs,
      'INC-20250': 20 * dayMs,
      'INC-20320': hourMs / 2,
      'REQ-10450': 7 * dayMs,
      'INC-20305': hourMs,
      'INC-20290': 2 * hourMs,
    });
    for (const ticket of entries) {
      expect(ticket.lastUpdateAt.getTime() - ticket.createdAt.getTime()).toBe(dayMs);
      if (ticket.status === 'RESOLVED') {
        expect(ticket.resolvedAt).toEqual(ticket.lastUpdateAt);
      } else {
        expect(ticket).not.toHaveProperty('resolvedAt');
      }
    }
  });

  it('usa somente solicitantes com papel EMPLOYEE cadastrados no seed', () => {
    const employees = new Set<string>(
      SEED_USERS.filter((user) => user.role === UserRole.EMPLOYEE).map((user) => user.id),
    );

    for (const ticket of buildSeedTickets(monday)) {
      expect(employees.has(ticket.requesterId)).toBe(true);
    }
  });

  it('atualiza os chamados e preserva os eventos originais ao rodar novamente', async () => {
    const store = new InMemoryTicketStore();
    const firstTickets = buildSeedTickets(monday);

    await seedTickets(store, monday);
    await seedTickets(store, saturday);

    expect(await store.list({ limit: 9 })).toHaveLength(8);
    for (const ticket of buildSeedTickets(saturday)) {
      expect(await store.findById(ticket.id)).toStrictEqual(ticket);
    }
    expect(store.events).toHaveLength(8);
    expect(store.events).toEqual(
      expect.arrayContaining(
        firstTickets.map((ticket) => ({
          ticketId: ticket.id,
          kind: 'CREATED',
          actorId: ticket.requesterId,
          payload: {},
          createdAt: ticket.createdAt,
        })),
      ),
    );
  });
});

describe('seed do Anexo B com PostgreSQL', () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>> | undefined;

  beforeAll(async () => {
    postgres = await startPostgres();
  }, 120_000);

  afterAll(async () => {
    await postgres?.stop();
  }, 120_000);

  it('mantém exatamente oito chamados e oito eventos após duas execuções', async () => {
    if (!postgres) {
      throw new Error('PostgreSQL não inicializado');
    }

    const { db, pool } = createDatabase(postgres.url);
    const unitOfWork = createDrizzleUnitOfWork(db);

    try {
      await seedTickets(unitOfWork, monday);
      await seedTickets(unitOfWork, saturday);

      expect(await db.$count(tickets)).toBe(8);
      expect(await db.$count(ticketEvents)).toBe(8);
      await unitOfWork.run(async ({ tickets: repository }) => {
        for (const ticket of buildSeedTickets(saturday)) {
          expect(await repository.findById(ticket.id)).toStrictEqual(ticket);
        }
      });
    } finally {
      await pool.end();
    }
  });
});
