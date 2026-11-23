import { SEED_USERS } from '@nexo/seed-data';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../src/adapters/persistence/database.ts';
import { createDrizzleUnitOfWork } from '../../../src/adapters/persistence/drizzle-unit-of-work.ts';
import { ticketDrafts } from '../../../src/adapters/persistence/schema.ts';
import type { Conversation } from '../../../src/application/model/conversation.ts';
import type { Draft } from '../../../src/application/model/draft.ts';
import type { Session } from '../../../src/application/model/session.ts';
import { startPostgres } from '../../support/postgres-container.ts';

const now = new Date('2026-11-23T15:00:00Z');
const earlier = new Date('2026-11-23T14:59:00Z');
const later = new Date('2026-11-23T16:00:00Z');
const [ana, bruno, carla, diego, elisa, felipe, gabriela, henrique] = SEED_USERS;
const handoff = {
  reason: 'CRITICAL_CASE',
  summary: 'VPN indisponível',
  priority: 'CRITICAL',
  requestedAt: earlier,
  dueAt: later,
} as const;

function conversation(
  employeeId: string = ana.id,
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id: randomUUID(),
    employeeId,
    status: 'WITH_AGENT',
    employeeMessageCount: 0,
    createdAt: earlier,
    lastMessageAt: earlier,
    ...overrides,
  };
}

function draft(conversationId: string): Draft {
  return {
    id: 'D-1',
    conversationId,
    status: 'PENDING',
    payload: { kind: 'UPDATE', ticketId: 'INC-20320', message: 'O erro persiste.' },
    createdAt: now,
  };
}

describe('persistência da API com PostgreSQL', () => {
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
    await unitOfWork.run(({ users }) => users.upsertMany(SEED_USERS));
  });

  it('seleciona usuários por e-mail e IDs', async () => {
    await unitOfWork.run(async ({ users }) => {
      expect(await users.findByEmail(ana.email)).toStrictEqual(ana);
      expect(await users.findById(gabriela.id)).toStrictEqual(gabriela);
      expect(await users.findByEmail('ausente@nexo.com.br')).toBeUndefined();
      expect(await users.findManyByIds([])).toStrictEqual([]);
      const found = await users.findManyByIds([ana.id, gabriela.id, randomUUID(), ana.id]);
      expect(found).toHaveLength(2);
      expect(found).toEqual(expect.arrayContaining([ana, gabriela]));
    });
  });

  it('aplica a fronteira de expiração e remove somente sessões vencidas', async () => {
    const valid: Session = {
      tokenHash: 'valid',
      userId: ana.id,
      createdAt: earlier,
      expiresAt: later,
    };
    await unitOfWork.run(async ({ sessions }) => {
      await sessions.insert(valid);
      await sessions.insert({ ...valid, tokenHash: 'expired', expiresAt: earlier });
      await sessions.insert({ ...valid, tokenHash: 'exact', expiresAt: now });

      expect(await sessions.findValid(valid.tokenHash, now)).toStrictEqual(valid);
      expect(await sessions.findValid('expired', now)).toBeUndefined();
      expect(await sessions.findValid('exact', now)).toBeUndefined();
      await sessions.deleteExpired(now);

      const beforeExpiration = new Date('2026-11-23T14:58:00Z');
      expect(await sessions.findValid('expired', beforeExpiration)).toBeUndefined();
      expect(await sessions.findValid('exact', beforeExpiration)).toBeUndefined();
      expect(await sessions.findValid(valid.tokenHash, now)).toStrictEqual(valid);
      await sessions.delete(valid.tokenHash);
      expect(await sessions.findValid(valid.tokenHash, now)).toBeUndefined();
    });
  });

  it('converte colunas nulas em propriedades ausentes e limpa opcionais na atualização', async () => {
    const entry = conversation();
    const pending = draft(entry.id);
    await unitOfWork.run(async ({ conversations, messages, drafts }) => {
      await conversations.insert(entry);
      expect(await conversations.findOpenByEmployee(ana.id)).toStrictEqual(entry);
      expect(await conversations.findByIdForUpdate(entry.id)).toStrictEqual(entry);

      const closed: Conversation = {
        ...entry,
        status: 'CLOSED',
        assignedAnalystId: gabriela.id,
        handoff,
        assumedAt: now,
        closedAt: later,
      };
      await conversations.update(closed);
      expect(await conversations.findById(entry.id)).toStrictEqual(closed);
      expect(await conversations.findOpenByEmployee(ana.id)).toBeUndefined();
      await conversations.update(entry);
      expect(await conversations.findById(entry.id)).toStrictEqual(entry);

      const newMessage = {
        conversationId: entry.id,
        author: 'SYSTEM',
        content: 'Conversa aberta.',
        createdAt: now,
      } as const;
      const saved = await messages.append(newMessage);
      expect(saved).toStrictEqual({ id: '1', ...newMessage });
      expect(await messages.listByConversation(entry.id, 10)).toStrictEqual([saved]);

      await drafts.insert(pending);
      expect(await drafts.findByIdForUpdate(pending.id)).toStrictEqual(pending);
      expect(await drafts.listPending(entry.id)).toStrictEqual([pending]);
      const confirmed: Draft = {
        ...pending,
        status: 'CONFIRMED',
        ticketId: 'INC-20320',
        decidedAt: later,
      };
      await drafts.update(confirmed);
      expect(await drafts.findById(pending.id)).toStrictEqual(confirmed);
      expect(await drafts.listPending(entry.id)).toStrictEqual([]);
      await drafts.update(pending);
      expect(await drafts.findById(pending.id)).toStrictEqual(pending);
    });
  });

  it('aceita o histórico fechado e garante uma só conversa aberta mesmo com inserções simultâneas', async () => {
    const closed = conversation(ana.id, { status: 'CLOSED', closedAt: earlier });
    await unitOfWork.run(({ conversations }) => conversations.insert(closed));
    const candidates = [conversation(), conversation()];
    const results = await Promise.allSettled(
      candidates.map((entry) => unitOfWork.run(({ conversations }) => conversations.insert(entry))),
    );

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    const reason: unknown = rejected?.reason;
    expect(reason).toMatchObject({
      cause: { code: '23505', constraint: 'conversations_one_open_per_employee_idx' },
    });
    await unitOfWork.run(async ({ conversations }) => {
      expect(await conversations.findById(closed.id)).toStrictEqual(closed);
      expect(candidates).toContainEqual(await conversations.findOpenByEmployee(ana.id));
    });
  });

  it('gera D-400 e D-401 em sequência', async () => {
    await unitOfWork.run(async ({ drafts }) => {
      expect(await drafts.nextId()).toBe('D-400');
      expect(await drafts.nextId()).toBe('D-401');
    });
  });

  it('lista os quatro filtros do console na ordem de prazo e última mensagem', async () => {
    const agent = conversation(ana.id, { lastMessageAt: later });
    const mining = conversation(bruno.id, {
      status: 'WITH_ANALYST',
      assignedAnalystId: gabriela.id,
      lastMessageAt: now,
    });
    const other = conversation(carla.id, {
      status: 'WITH_ANALYST',
      assignedAnalystId: henrique.id,
    });
    const waitingLater = conversation(diego.id, {
      status: 'WAITING_ANALYST',
      handoff,
      lastMessageAt: later,
    });
    const waitingEarlier = conversation(elisa.id, {
      status: 'WAITING_ANALYST',
      handoff: { ...handoff, dueAt: now },
    });
    const waitingRecent = conversation(felipe.id, {
      status: 'WAITING_ANALYST',
      handoff: { ...handoff, dueAt: now },
      lastMessageAt: now,
    });
    const closed = conversation(ana.id, { status: 'CLOSED', closedAt: now });
    const waiting = [waitingRecent, waitingEarlier, waitingLater];

    await unitOfWork.run(async ({ conversations }) => {
      for (const entry of [
        agent,
        mining,
        other,
        waitingLater,
        waitingEarlier,
        waitingRecent,
        closed,
      ]) {
        await conversations.insert(entry);
      }
      expect(await conversations.listForConsole('ALL', gabriela.id, 10)).toStrictEqual([
        ...waiting,
        agent,
        mining,
        other,
      ]);
      expect(await conversations.listForConsole('FOR_YOU', gabriela.id, 10)).toStrictEqual(waiting);
      expect(await conversations.listForConsole('WITH_AGENT', gabriela.id, 10)).toStrictEqual([
        agent,
      ]);
      expect(await conversations.listForConsole('MINE', gabriela.id, 10)).toStrictEqual([mining]);
      expect(await conversations.listForConsole('ALL', gabriela.id, 2)).toStrictEqual(
        waiting.slice(0, 2),
      );
    });
  });

  it('lista as mensagens recentes em ordem cronológica e busca a última por conversa', async () => {
    const first = conversation();
    const second = conversation(bruno.id);
    await unitOfWork.run(async ({ conversations, messages }) => {
      await conversations.insert(first);
      await conversations.insert(second);
      const input = {
        conversationId: first.id,
        author: 'EMPLOYEE',
        authorId: ana.id,
        content: 'Olá',
        createdAt: now,
      } as const;
      await messages.append(input);
      const another = await messages.append({
        ...input,
        conversationId: second.id,
        authorId: bruno.id,
      });
      const middle = await messages.append({ ...input, content: 'Preciso de ajuda' });
      const last = await messages.append({ ...input, content: 'Com a VPN' });

      expect(await messages.listByConversation(first.id, 2)).toStrictEqual([middle, last]);
      expect(await messages.lastByConversations([])).toStrictEqual(new Map());
      expect(
        await messages.lastByConversations([first.id, second.id, randomUUID(), first.id]),
      ).toStrictEqual(
        new Map([
          [first.id, last],
          [second.id, another],
        ]),
      );
    });
  });

  it('calcula agregados da janela de criação e a espera média das conversas assumidas', async () => {
    await unitOfWork.run(async ({ conversations }) => {
      await conversations.insert(
        conversation(ana.id, { createdAt: earlier, status: 'CLOSED', closedAt: now }),
      );
      await conversations.insert(
        conversation(ana.id, { createdAt: now, status: 'CLOSED', closedAt: later }),
      );
      await conversations.insert(
        conversation(bruno.id, {
          createdAt: now,
          status: 'CLOSED',
          handoff,
          assumedAt: now,
          closedAt: later,
        }),
      );
      await conversations.insert(
        conversation(carla.id, {
          createdAt: now,
          status: 'WAITING_ANALYST',
          handoff: { ...handoff, requestedAt: now },
          assumedAt: earlier,
        }),
      );
      await conversations.insert(
        conversation(diego.id, {
          createdAt: now,
          status: 'WITH_ANALYST',
          handoff,
          assumedAt: new Date(now.getTime() + 30_000),
        }),
      );
      expect(await conversations.statsSince(now)).toStrictEqual({
        total: 4,
        closedWithoutHandoff: 1,
        closed: 2,
        averageHandoffWaitSeconds: 75,
      });
      expect(await conversations.statsSince(later)).toStrictEqual({
        total: 0,
        closedWithoutHandoff: 0,
        closed: 0,
        averageHandoffWaitSeconds: null,
      });
    });
  });

  it('rejeita a leitura de payload inválido gravado diretamente no banco', async () => {
    const entry = conversation();
    const pending = draft(entry.id);
    await unitOfWork.run(({ conversations }) => conversations.insert(entry));
    await db.insert(ticketDrafts).values({ ...pending, payload: { kind: 'UPDATE' } });

    await expect(unitOfWork.run(({ drafts }) => drafts.findById(pending.id))).rejects.toMatchObject(
      { name: 'ZodError' },
    );
  });

  it('desfaz gravações de repositórios diferentes quando o trabalho lança', async () => {
    const entry = conversation();
    const failure = new Error('falha durante a transação');
    await expect(
      unitOfWork.run(async ({ conversations, sessions, messages }) => {
        await conversations.insert(entry);
        await messages.append({
          conversationId: entry.id,
          author: 'SYSTEM',
          content: 'Teste',
          createdAt: now,
        });
        await sessions.insert({
          tokenHash: 'rollback',
          userId: ana.id,
          createdAt: now,
          expiresAt: later,
        });
        throw failure;
      }),
    ).rejects.toBe(failure);

    await unitOfWork.run(async ({ conversations, messages, sessions }) => {
      expect(await conversations.findById(entry.id)).toBeUndefined();
      expect(await messages.listByConversation(entry.id, 10)).toStrictEqual([]);
      expect(await sessions.findValid('rollback', now)).toBeUndefined();
    });
  });
});
