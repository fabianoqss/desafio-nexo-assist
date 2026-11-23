import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Conversation } from '../../src/application/model/conversation.ts';
import { InMemoryApiStore } from './in-memory-api-store.ts';

const now = new Date('2026-11-23T15:00:00Z');

function conversation(employeeId: string): Conversation {
  return {
    id: randomUUID(),
    employeeId,
    status: 'WITH_AGENT',
    employeeMessageCount: 0,
    createdAt: now,
    lastMessageAt: now,
  };
}

describe('store da API em memória', () => {
  it('serializa transações que tentam abrir duas conversas do mesmo funcionário', async () => {
    const store = new InMemoryApiStore();
    const first = conversation(randomUUID());
    const second = conversation(first.employeeId);
    const closed = { ...conversation(first.employeeId), status: 'CLOSED', closedAt: now } as const;
    await store.conversations.insert(closed);

    const results = await Promise.allSettled(
      [first, second].map((entry) => store.run(({ conversations }) => conversations.insert(entry))),
    );

    expect(results).toMatchObject([
      { status: 'fulfilled' },
      { status: 'rejected', reason: { cause: { code: '23505' } } },
    ]);
    await expect(store.conversations.findOpenByEmployee(first.employeeId)).resolves.toStrictEqual(
      first,
    );
    await expect(store.conversations.findById(closed.id)).resolves.toStrictEqual(closed);
  });

  it('desfaz as gravações e mantém os números consumidos pelas sequências', async () => {
    const store = new InMemoryApiStore();
    const entry = conversation(randomUUID());
    const failure = new Error('falha durante a transação');

    await expect(
      store.run(async ({ conversations, drafts, messages }) => {
        await conversations.insert(entry);
        const id = await drafts.nextId();
        expect(id).toBe('D-400');
        await drafts.insert({
          id,
          conversationId: entry.id,
          status: 'PENDING',
          payload: { kind: 'UPDATE', ticketId: 'INC-20320', message: 'O erro persiste.' },
          createdAt: now,
        });
        await messages.append({
          conversationId: entry.id,
          author: 'SYSTEM',
          content: 'Teste',
          createdAt: now,
        });
        throw failure;
      }),
    ).rejects.toBe(failure);

    await expect(store.conversations.findById(entry.id)).resolves.toBeUndefined();
    await expect(store.drafts.findById('D-400')).resolves.toBeUndefined();
    await expect(store.messages.listByConversation(entry.id, 10)).resolves.toStrictEqual([]);
    await expect(store.drafts.nextId()).resolves.toBe('D-401');
  });
});
