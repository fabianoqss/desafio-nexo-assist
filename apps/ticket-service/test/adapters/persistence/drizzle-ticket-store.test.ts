import type { Ticket } from '@nexo/domain';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../src/adapters/persistence/database.ts';
import { createDrizzleIdempotencyRepository } from '../../../src/adapters/persistence/drizzle-idempotency-repository.ts';
import { createDrizzleTicketRepository } from '../../../src/adapters/persistence/drizzle-ticket-repository.ts';
import { createDrizzleUnitOfWork } from '../../../src/adapters/persistence/drizzle-unit-of-work.ts';
import { ticketEvents } from '../../../src/adapters/persistence/schema.ts';
import { IdempotencyKeyTakenError } from '../../../src/application/ports/idempotency-repository.ts';
import { startPostgres } from '../../support/postgres-container.ts';

const createdAt = new Date('2026-11-20T15:00:00Z');
const newer = new Date('2026-11-20T16:00:00Z');
const newest = new Date('2026-11-20T17:00:00Z');

function ticket(id: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    id,
    type: 'INC',
    title: 'VPN indisponível',
    description: 'A conexão foi interrompida.',
    category: 'NETWORK_VPN',
    impact: 'SELF',
    urgency: 'BLOCKED',
    priority: 'MEDIUM',
    status: 'OPEN',
    requesterId: '91628935-4550-4566-9943-48f113a6f14a',
    createdAt,
    lastUpdateAt: createdAt,
    ...overrides,
  };
}

describe('persistência de chamados com Drizzle', () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>> | undefined;
  let pool: ReturnType<typeof createDatabase>['pool'] | undefined;
  let db: ReturnType<typeof createDatabase>['db'];
  let repository: ReturnType<typeof createDrizzleTicketRepository>;
  let unitOfWork: ReturnType<typeof createDrizzleUnitOfWork>;

  beforeAll(async () => {
    postgres = await startPostgres();
    ({ pool, db } = createDatabase(postgres.url));
    repository = createDrizzleTicketRepository(db);
    unitOfWork = createDrizzleUnitOfWork(db);
  }, 120_000);

  afterAll(async () => {
    try {
      await pool?.end();
    } finally {
      await postgres?.stop();
    }
  }, 120_000);

  it('devolve o mesmo chamado e omite propriedades opcionais ausentes', async () => {
    const withItem = ticket('INC-100', { item: 'Cliente VPN' });
    const withoutItem = ticket('INC-101');

    await repository.insert(withItem);
    await repository.insert(withoutItem);

    expect(await repository.findById(withItem.id)).toStrictEqual(withItem);
    const saved = await repository.findById(withoutItem.id);
    expect(saved).toStrictEqual(withoutItem);
    expect(saved).not.toHaveProperty('item');
    expect(saved).not.toHaveProperty('resolvedAt');
  });

  it('remove item e data de resolução ao atualizar o chamado', async () => {
    const updated = ticket('INC-102', { lastUpdateAt: newest });
    await repository.insert({
      ...updated,
      item: 'Cliente VPN',
      status: 'RESOLVED',
      lastUpdateAt: newer,
      resolvedAt: newer,
    });

    await repository.update(updated);

    const saved = await repository.findById(updated.id);
    expect(saved).toStrictEqual(updated);
    expect(saved).not.toHaveProperty('item');
    expect(saved).not.toHaveProperty('resolvedAt');
  });

  it('persiste o tipo e o payload do evento do chamado', async () => {
    const entry = ticket('INC-103');
    await repository.insert(entry);

    await repository.appendEvent({
      ticketId: entry.id,
      kind: 'CREATED',
      actorId: entry.requesterId,
      payload: { status: 'OPEN' },
      createdAt,
    });

    const events = await db
      .select({ kind: ticketEvents.kind, payload: ticketEvents.payload })
      .from(ticketEvents)
      .where(eq(ticketEvents.ticketId, entry.id));

    expect(events).toStrictEqual([{ kind: 'CREATED', payload: { status: 'OPEN' } }]);
  });

  it('gera IDs a partir das sequências independentes de incidentes e requisições', async () => {
    expect(await repository.nextId('INC')).toBe('INC-20400');
    expect(await repository.nextId('INC')).toBe('INC-20401');
    expect(await repository.nextId('REQ')).toBe('REQ-10500');
  });

  it('lista somente chamados do solicitante em ordem decrescente com limite de dois', async () => {
    const requesterId = '1cf634e4-ef1f-4f58-900f-d64018b4bda2';
    const oldest = ticket('INC-110', { requesterId });
    const latest = ticket('INC-111', { requesterId, lastUpdateAt: newest });
    const middle = ticket('INC-112', { requesterId, lastUpdateAt: newer });
    const other = ticket('INC-113', {
      requesterId: '515570c9-6f88-4023-9383-b8a39accf87a',
      lastUpdateAt: new Date('2026-11-20T18:00:00Z'),
    });

    for (const entry of [oldest, latest, middle, other]) {
      await repository.insert(entry);
    }

    expect(await repository.list({ requesterId, limit: 2 })).toStrictEqual([latest, middle]);
  });

  it('filtra a lista por status', async () => {
    const resolved = ticket('INC-120', {
      status: 'RESOLVED',
      lastUpdateAt: newer,
      resolvedAt: newer,
    });
    await repository.insert(resolved);
    await repository.insert(ticket('INC-121'));

    expect(await repository.list({ status: 'RESOLVED', limit: 50 })).toStrictEqual([resolved]);
  });

  it('desfaz a inserção quando o trabalho lança um erro', async () => {
    const entry = ticket('INC-130');
    const error = new Error('falha durante a transação');

    await expect(
      unitOfWork.run(async ({ tickets }) => {
        await tickets.insert(entry);
        throw error;
      }),
    ).rejects.toBe(error);

    expect(await repository.findById(entry.id)).toBeUndefined();
  });

  it('traduz a violação de unicidade do par ator e chave', async () => {
    const entry = ticket('INC-140');
    await repository.insert(entry);
    const record = {
      actorId: entry.requesterId,
      key: 'repeated-key',
      operation: 'create-ticket',
      requestHash: 'request-hash',
      ticketId: entry.id,
      createdAt,
    };

    await unitOfWork.run(({ idempotency }) => idempotency.save(record));

    await expect(
      unitOfWork.run(({ idempotency }) => idempotency.save(record)),
    ).rejects.toBeInstanceOf(IdempotencyKeyTakenError);
  });

  it('encontra o registro de idempotência pela chave gravada', async () => {
    const entry = ticket('INC-141');
    await repository.insert(entry);
    const record = {
      actorId: entry.requesterId,
      key: 'saved-key',
      operation: 'create-ticket',
      requestHash: 'request-hash',
      ticketId: entry.id,
      createdAt,
    };
    await unitOfWork.run(({ idempotency }) => idempotency.save(record));

    const idempotency = createDrizzleIdempotencyRepository(db);

    expect(await idempotency.find(record.actorId, record.key)).toStrictEqual(record);
    expect(await idempotency.find(record.actorId, 'another-key')).toBeUndefined();
  });

  it('bloqueia a segunda leitura até o commit e devolve o status atualizado', async () => {
    const entry = ticket('INC-150');
    await repository.insert(entry);
    const locked = Promise.withResolvers<undefined>();
    const update = Promise.withResolvers<undefined>();

    const first = unitOfWork.run(async ({ tickets }) => {
      const current = await tickets.findByIdForUpdate(entry.id);
      expect(current?.status).toBe('OPEN');
      locked.resolve(undefined);
      await update.promise;
      await tickets.update({ ...entry, status: 'IN_PROGRESS', lastUpdateAt: newer });
    });
    const second = Promise.race([first, locked.promise]).then(() =>
      unitOfWork.run(({ tickets }) => tickets.findByIdForUpdate(entry.id)),
    );
    const settled = Promise.allSettled([first, second]);

    try {
      await expect
        .poll(
          async () => {
            const { rows } = await db.execute<{ blocked: boolean }>(sql`
            select exists (
              select 1 from pg_stat_activity
              where datname = current_database() and cardinality(pg_blocking_pids(pid)) > 0
            ) as blocked
          `);
            return rows[0]?.blocked;
          },
          { timeout: 5_000 },
        )
        .toBe(true);
    } finally {
      update.resolve(undefined);
      await settled;
    }

    await first;
    expect(await second).toMatchObject({ status: 'IN_PROGRESS', lastUpdateAt: newer });
  }, 10_000);
});
