import type { ConversationEvent } from '@nexo/contracts';
import { SEED_USERS } from '@nexo/seed-data';
import { describe, expect, it, vi } from 'vitest';
import { unavailableAgentTurnRunner } from '../../../src/adapters/agent/unavailable-agent-turn-runner.ts';
import { createInMemoryConversationEventBus } from '../../../src/adapters/events/in-memory-conversation-event-bus.ts';
import type { AuthenticatedUser } from '../../../src/application/auth/authenticated-user.ts';
import type { Conversation } from '../../../src/application/model/conversation.ts';
import type { Draft } from '../../../src/application/model/draft.ts';
import type { AgentTurnRunner } from '../../../src/application/ports/agent-turn-runner.ts';
import { postEmployeeMessage } from '../../../src/application/use-cases/conversations/post-employee-message.ts';
import { requestHandoff } from '../../../src/application/use-cases/conversations/request-handoff.ts';
import { FixedClock } from '../../support/fixed-clock.ts';
import { InMemoryApiStore } from '../../support/in-memory-api-store.ts';
import { RecordingMetrics } from '../../support/recording-metrics.ts';

const [ana, bruno] = SEED_USERS;
const request = { content: 'Preciso de ajuda com a VPN.' };
const conversationId = '7aed5935-e243-437f-b323-a97e4d0a8882';

async function setup(
  overrides: Partial<Conversation> = {},
  agentTurnRunner: AgentTurnRunner = unavailableAgentTurnRunner,
) {
  const unitOfWork = new InMemoryApiStore();
  const clock = new FixedClock();
  const metrics = new RecordingMetrics();
  const eventBus = createInMemoryConversationEventBus();
  await unitOfWork.conversations.insert({
    id: conversationId,
    employeeId: ana.id,
    status: 'WITH_AGENT',
    employeeMessageCount: 0,
    createdAt: new Date('2026-12-08T12:00:00.000Z'),
    lastMessageAt: new Date('2026-12-08T12:00:00.000Z'),
    ...overrides,
  });
  const deps = { unitOfWork, clock, metrics, eventBus, agentTurnRunner };
  async function post(user: AuthenticatedUser = ana) {
    const events: ConversationEvent[] = [];
    for await (const event of postEmployeeMessage(deps, user, conversationId, request)) {
      events.push(event);
    }
    return events;
  }
  const history = () => unitOfWork.messages.listByConversation(conversationId, 100);
  return { ...deps, post, history };
}

describe('mensagem do funcionário', () => {
  it('persiste e publica a mensagem e a resposta do assistente indisponível antes de done', async () => {
    const { unitOfWork, clock, metrics, eventBus, post, history } = await setup();
    const listener = vi.fn();
    eventBus.subscribe({ conversationId }, listener);

    const events = await post();
    expect(events).toEqual([
      {
        type: 'message',
        message: {
          id: '1',
          author: 'EMPLOYEE',
          authorId: ana.id,
          content: request.content,
          createdAt: clock.now().toISOString(),
        },
      },
      {
        type: 'message',
        message: {
          id: '2',
          author: 'SYSTEM',
          content:
            'O assistente está indisponível no momento. Se precisar, peça para falar com um analista.',
          createdAt: clock.now().toISOString(),
        },
      },
      { type: 'done' },
    ]);
    expect(listener.mock.calls).toEqual([[events[0]], [events[1]]]);
    expect((await history()).map(({ author }) => author)).toEqual(['EMPLOYEE', 'SYSTEM']);
    expect(await unitOfWork.conversations.findById(conversationId)).toMatchObject({
      employeeMessageCount: 1,
      lastMessageAt: clock.now(),
    });
    expect(metrics.calls).toEqual([
      { method: 'increment', name: 'nexo_messages_total', labels: { author: 'EMPLOYEE' } },
      { method: 'increment', name: 'nexo_messages_total', labels: { author: 'SYSTEM' } },
    ]);
  });

  it.each(['WAITING_ANALYST', 'WITH_ANALYST'] as const)(
    'persiste e publica a mensagem em %s sem acionar o assistente',
    async (status) => {
      const run = vi.fn<AgentTurnRunner['run']>();
      const { eventBus, post, history } = await setup({ status }, { run });
      const listener = vi.fn();
      eventBus.subscribe({}, listener);

      const events = await post();
      expect(run).not.toHaveBeenCalled();
      expect(events.map(({ type }) => type)).toEqual(['message', 'done']);
      expect(listener.mock.calls).toEqual([[events[0]]]);
      expect(await history()).toHaveLength(1);
    },
  );

  it.each([
    [{ employeeMessageCount: 30 }, 'MESSAGE_LIMIT_REACHED'],
    [{ status: 'CLOSED' }, 'CONVERSATION_STATE_CONFLICT'],
  ] as const)('recusa a escrita com %s sem gravar mensagem', async (overrides, code) => {
    const { post, history, metrics } = await setup(overrides);

    await expect(post()).rejects.toMatchObject({ code });
    expect(await history()).toEqual([]);
    expect(metrics.calls).toEqual([]);
  });

  it('grava apenas a 30ª mensagem quando dois envios disputam o limite', async () => {
    const { post, history } = await setup({ status: 'WAITING_ANALYST', employeeMessageCount: 29 });
    const outcome = await Promise.allSettled([post(), post()]);

    expect(outcome).toMatchObject([
      { status: 'fulfilled' },
      { status: 'rejected', reason: { code: 'MESSAGE_LIMIT_REACHED' } },
    ]);
    expect(await history()).toHaveLength(1);
  });

  it('entrega histórico ao runner e persiste mensagem e rascunho antes de tratar uma falha', async () => {
    const draft: Draft = {
      id: 'D-500',
      conversationId,
      status: 'PENDING',
      payload: { kind: 'UPDATE', ticketId: 'INC-20320', message: 'O erro persiste.' },
      createdAt: new Date('2026-12-09T12:00:00.000Z'),
    };
    const run = vi.fn<AgentTurnRunner['run']>(async function* (context) {
      await Promise.resolve();
      expect(context.employee.id).toBe(ana.id);
      expect(context.history.map(({ content }) => content)).toEqual([
        'Mensagem anterior',
        request.content,
      ]);
      yield { type: 'message', author: 'AGENT', content: 'Vou verificar.' };
      yield { type: 'draft', draft };
      throw new Error('segredo interno do runner');
    });
    const { unitOfWork, post, history } = await setup({}, { run });
    await unitOfWork.messages.append({
      conversationId,
      author: 'SYSTEM',
      content: 'Mensagem anterior',
      createdAt: new Date('2026-12-08T12:00:00.000Z'),
    });

    const events = await post();
    expect(events.map(({ type }) => type)).toEqual([
      'message',
      'message',
      'draft',
      'error',
      'message',
      'done',
    ]);
    expect(events[2]).toEqual({
      type: 'draft',
      draft: { ...draft, createdAt: draft.createdAt.toISOString() },
    });
    expect(JSON.stringify(events)).not.toContain('segredo interno do runner');
    expect(await unitOfWork.drafts.findById(draft.id)).toEqual(draft);
    expect((await history()).map(({ author }) => author)).toEqual([
      'SYSTEM',
      'EMPLOYEE',
      'AGENT',
      'SYSTEM',
    ]);
  });

  it('dispensa o runner se a conversa for transferida após o primeiro evento', async () => {
    const run = vi.fn(unavailableAgentTurnRunner.run.bind(unavailableAgentTurnRunner));
    const deps = await setup({}, { run });
    const events = postEmployeeMessage(deps, ana, conversationId, request)[Symbol.asyncIterator]();

    expect((await events.next()).value).toMatchObject({ type: 'message' });
    await requestHandoff(deps, conversationId, {
      actorId: ana.id,
      reason: 'EMPLOYEE_REQUEST',
      priorityInput: {},
      summary: 'Preciso de um analista.',
    });

    expect((await events.next()).value).toEqual({ type: 'done' });
    expect((await events.next()).done).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });

  it('encerra um runner bloqueado no timeout e grava a falha enquanto está WITH_AGENT', async () => {
    const pending = Promise.withResolvers<IteratorResult<never>>();
    const abandoned = Promise.withResolvers<IteratorResult<never>>();
    const returnFromRunner = vi.fn(() => abandoned.promise);
    const run = vi.fn<AgentTurnRunner['run']>(() => ({
      [Symbol.asyncIterator]: () => ({ next: () => pending.promise, return: returnFromRunner }),
    }));
    const deps = await setup({}, { run });
    const listener = vi.fn();
    deps.eventBus.subscribe({ conversationId }, listener);
    const events = postEmployeeMessage(deps, ana, conversationId, request, { turnTimeoutMs: 10 })[
      Symbol.asyncIterator
    ]();

    try {
      expect((await events.next()).value).toMatchObject({
        type: 'message',
        message: { author: 'EMPLOYEE' },
      });
      const next = events.next();
      await vi.waitFor(
        () => {
          expect(returnFromRunner).toHaveBeenCalledTimes(1);
        },
        { timeout: 250 },
      );
      expect(run.mock.calls[0]?.[0].signal.aborted).toBe(true);
      expect((await next).value).toMatchObject({ type: 'error', code: 'SERVICE_UNAVAILABLE' });
      expect(listener).toHaveBeenCalledTimes(1);
      const fallback: unknown = (await events.next()).value;
      expect(fallback).toMatchObject({ type: 'message', message: { author: 'SYSTEM' } });
      expect(listener).toHaveBeenLastCalledWith(fallback);
      expect((await events.next()).value).toEqual({ type: 'done' });
      expect((await events.next()).done).toBe(true);
      expect((await deps.history()).map(({ author }) => author)).toEqual(['EMPLOYEE', 'SYSTEM']);
    } finally {
      pending.resolve({ done: true, value: undefined });
      abandoned.resolve({ done: true, value: undefined });
      await events.return?.();
    }
  });

  it.each(['WAITING_ANALYST', 'CLOSED'] as const)(
    'omite o erro e a mensagem de falha se o status mudar para %s durante o turno',
    async (status) => {
      const deps = await setup(
        {},
        {
          run() {
            const next = async () => {
              if (status === 'WAITING_ANALYST') {
                await requestHandoff(deps, conversationId, {
                  actorId: ana.id,
                  reason: 'EMPLOYEE_REQUEST',
                  priorityInput: {},
                  summary: 'Preciso de um analista.',
                });
              } else {
                const { conversations } = deps.unitOfWork;
                const conversation = await conversations.findById(conversationId);
                if (!conversation) {
                  throw new Error('Conversa ausente');
                }
                await conversations.update({ ...conversation, status, closedAt: deps.clock.now() });
              }
              throw new Error('Falha do runner');
            };
            return { [Symbol.asyncIterator]: () => ({ next }) };
          },
        },
      );

      expect((await deps.post()).map(({ type }) => type)).toEqual(['message', 'done']);
      expect((await deps.history()).map(({ content }) => content)).toEqual(
        status === 'WAITING_ANALYST'
          ? [request.content, 'Conversa transferida para um analista.']
          : [request.content],
      );
    },
  );

  it('entrega ao runner as últimas 100 mensagens em ordem, incluindo o envio atual', async () => {
    const run = vi.fn<AgentTurnRunner['run']>();
    run.mockImplementation((context) => unavailableAgentTurnRunner.run(context));
    const { unitOfWork, clock, post } = await setup({}, { run });
    const contents = Array.from({ length: 119 }, (_, index) => `Mensagem ${String(index + 1)}`);
    for (const content of contents) {
      await unitOfWork.messages.append({
        conversationId,
        author: 'SYSTEM',
        content,
        createdAt: clock.now(),
      });
    }

    await post();

    expect(run.mock.calls[0]?.[0].history.map(({ content }) => content)).toEqual([
      ...contents.slice(20),
      request.content,
    ]);
  });

  it('encerra o turno se um handoff ocorrer enquanto o runner está ativo', async () => {
    const draft: Draft = {
      id: 'D-501',
      conversationId,
      status: 'PENDING',
      payload: { kind: 'UPDATE', ticketId: 'INC-20320', message: 'O erro persiste.' },
      createdAt: new Date('2026-12-09T12:00:00.000Z'),
    };
    const deps = await setup(
      {},
      {
        async *run() {
          await requestHandoff(deps, conversationId, {
            actorId: ana.id,
            reason: 'LOW_CONFIDENCE',
            priorityInput: {},
            summary: 'Transferência do assistente.',
          });
          yield { type: 'draft', draft };
        },
      },
    );

    expect((await deps.post()).map(({ type }) => type)).toEqual(['message', 'done']);
    expect(await deps.unitOfWork.drafts.findById(draft.id)).toBeUndefined();
    expect((await deps.history()).map(({ author }) => author)).toEqual(['EMPLOYEE', 'SYSTEM']);
  });

  it('recusa o envio de outro funcionário', async () => {
    const { post, history } = await setup();

    await expect(post(bruno)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await history()).toEqual([]);
  });
});
