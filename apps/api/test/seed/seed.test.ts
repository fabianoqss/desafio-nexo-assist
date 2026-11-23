import { computeDueAt, Priority } from '@nexo/domain';
import { SEED_USERS } from '@nexo/seed-data';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/adapters/persistence/database.ts';
import { createDrizzleUnitOfWork } from '../../src/adapters/persistence/drizzle-unit-of-work.ts';
import { conversations, messages, users } from '../../src/adapters/persistence/schema.ts';
import type { UnitOfWork } from '../../src/application/ports/unit-of-work.ts';
import { seedApi } from '../../src/seed/seed.ts';
import { InMemoryApiStore } from '../support/in-memory-api-store.ts';
import { startPostgres } from '../support/postgres-container.ts';

const now = new Date('2026-11-23T15:00:00Z');
const tomorrow = new Date('2026-11-24T15:00:00Z');
const [, bruno, carla] = SEED_USERS;
const requestedAt = new Date('2026-11-23T14:40:00Z');

async function expectSeed(unitOfWork: UnitOfWork) {
  await unitOfWork.run(async ({ users, conversations, messages }) => {
    const seededUsers = await users.findManyByIds(SEED_USERS.map(({ id }) => id));
    expect(seededUsers).toHaveLength(8);
    expect(seededUsers).toEqual(expect.arrayContaining([...SEED_USERS]));

    const brunoConversation = await conversations.findOpenByEmployee(bruno.id);
    const carlaConversation = await conversations.findOpenByEmployee(carla.id);
    expect(brunoConversation).toMatchObject({
      status: 'WAITING_ANALYST',
      handoff: {
        reason: 'CRITICAL_CASE',
        summary: 'VPN caiu para o time comercial; INC-20320 crítico',
        priority: 'CRITICAL',
        requestedAt,
        dueAt: computeDueAt(Priority.CRITICAL, requestedAt),
      },
    });
    expect(carlaConversation).toMatchObject({ status: 'WITH_AGENT' });
    if (!brunoConversation || !carlaConversation) {
      throw new Error('Conversas de demonstração ausentes');
    }

    for (const [conversation, count] of [
      [brunoConversation, 3],
      [carlaConversation, 2],
    ] as const) {
      const history = await messages.listByConversation(conversation.id, 10);
      expect(history).toHaveLength(count);
      expect(history[0]?.createdAt).toEqual(conversation.createdAt);
      expect(history.at(-1)?.createdAt).toEqual(conversation.lastMessageAt);
      expect(history.filter(({ author }) => author === 'EMPLOYEE')).toHaveLength(
        conversation.employeeMessageCount,
      );
    }
  });
}

describe('seed da API em memória', () => {
  it('restaura o cadastro dos usuários e preserva as conversas abertas e mensagens', async () => {
    const store = new InMemoryApiStore();
    await seedApi(store, now);
    const first = await store.conversations.listForConsole('ALL', '', 10);
    await store.users.upsertMany([{ ...bruno, name: 'Nome alterado' }]);

    await seedApi(store, tomorrow);

    expect(await store.conversations.listForConsole('ALL', '', 10)).toStrictEqual(first);
    await expectSeed(store);
  });
});

describe('seed da API com PostgreSQL', () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>> | undefined;

  beforeAll(async () => {
    postgres = await startPostgres();
  }, 120_000);

  afterAll(async () => {
    await postgres?.stop();
  }, 120_000);

  it('mantém oito usuários, duas conversas e cinco mensagens após duas execuções', async () => {
    if (!postgres) {
      throw new Error('PostgreSQL não inicializado');
    }

    const { db, pool } = createDatabase(postgres.url);
    const unitOfWork = createDrizzleUnitOfWork(db);
    try {
      await seedApi(unitOfWork, now);
      await seedApi(unitOfWork, tomorrow);

      expect(await db.$count(users)).toBe(8);
      expect(await db.$count(conversations)).toBe(2);
      expect(await db.$count(messages)).toBe(5);
      await expectSeed(unitOfWork);
    } finally {
      await pool.end();
    }
  });
});
