import { ConversationResponseSchema } from '@nexo/contracts';
import { SEED_USERS } from '@nexo/seed-data';
import { describe, expect, it } from 'vitest';
import { getCurrentConversation } from '../../../src/application/use-cases/conversations/get-current-conversation.ts';
import { FixedClock } from '../../support/fixed-clock.ts';
import { InMemoryApiStore } from '../../support/in-memory-api-store.ts';

const [ana] = SEED_USERS;

function setup() {
  const store = new InMemoryApiStore();
  const clock = new FixedClock();
  const current = () => getCurrentConversation({ unitOfWork: store, clock }, ana);
  return { store, clock, current };
}

describe('conversa atual do funcionário', () => {
  it('cria uma conversa com o assistente na primeira visita e a devolve na segunda', async () => {
    const { current } = setup();
    const first = ConversationResponseSchema.parse(await current());

    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first).toEqual({
      id: first.id,
      status: 'WITH_AGENT',
      employeeMessageCount: 0,
      maxEmployeeMessages: 30,
      messages: [],
      pendingDrafts: [],
    });
    expect(await current()).toEqual(first);
  });

  it('reusa a conversa vencedora após duas inserções concorrentes', async () => {
    const { current, store } = setup();
    const [first, second] = await Promise.all([current(), current()]);

    expect(first.id).toBe(second.id);
    expect(await store.conversations.listForConsole('ALL', ana.id, 10)).toHaveLength(1);
  });

  it('devolve somente as últimas 100 de 120 mensagens, em ordem cronológica', async () => {
    const { store, clock, current } = setup();
    const { id } = await current();
    const contents = Array.from({ length: 120 }, (_, index) => `Mensagem ${String(index + 1)}`);
    for (const content of contents) {
      await store.messages.append({
        conversationId: id,
        author: 'SYSTEM',
        content,
        createdAt: clock.now(),
      });
    }

    expect((await current()).messages.map(({ content }) => content)).toEqual(contents.slice(20));
  });

  it('mantém o histórico ordenado, omite opcionais ausentes e calcula atraso na leitura', async () => {
    const { store, clock, current } = setup();
    const { id } = await current();
    const createdAt = clock.now();
    const dueAt = new Date('2026-12-11T12:00:00.000Z');
    await store.conversations.update({
      id,
      employeeId: ana.id,
      status: 'WAITING_ANALYST',
      employeeMessageCount: 1,
      createdAt,
      lastMessageAt: createdAt,
      handoff: {
        priority: 'MEDIUM',
        reason: 'EMPLOYEE_REQUEST',
        summary: 'Ajuda',
        requestedAt: createdAt,
        dueAt,
      },
    });
    await store.messages.append({
      conversationId: id,
      author: 'EMPLOYEE',
      authorId: ana.id,
      content: 'Ajuda',
      createdAt,
    });
    await store.messages.append({
      conversationId: id,
      author: 'SYSTEM',
      content: 'Aguarde',
      createdAt,
    });
    const draft = {
      id: 'D-400',
      conversationId: id,
      status: 'PENDING',
      payload: { kind: 'UPDATE', ticketId: 'INC-20320', message: 'O erro persiste.' },
      createdAt,
    } as const;
    await store.drafts.insert(draft);
    await store.drafts.insert({ ...draft, id: 'D-401', status: 'CANCELLED' });

    clock.set(dueAt);
    const onTime = ConversationResponseSchema.parse(await current());
    expect(onTime.messages.map(({ author }) => author)).toEqual(['EMPLOYEE', 'SYSTEM']);
    expect(onTime.messages[1]).not.toHaveProperty('authorId');
    expect(onTime.pendingDrafts).toEqual([{ ...draft, createdAt: createdAt.toISOString() }]);
    expect(onTime.handoff).toMatchObject({ dueAt: dueAt.toISOString(), overdue: false });
    clock.set(new Date(dueAt.getTime() + 1));
    expect((await current()).handoff?.overdue).toBe(true);
  });
});
