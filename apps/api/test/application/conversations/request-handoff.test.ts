import { SEED_USERS } from '@nexo/seed-data';
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryConversationEventBus } from '../../../src/adapters/events/in-memory-conversation-event-bus.ts';
import { getCurrentConversation } from '../../../src/application/use-cases/conversations/get-current-conversation.ts';
import { requestHandoff } from '../../../src/application/use-cases/conversations/request-handoff.ts';
import { FixedClock } from '../../support/fixed-clock.ts';
import { InMemoryApiStore } from '../../support/in-memory-api-store.ts';
import { RecordingMetrics } from '../../support/recording-metrics.ts';

const [ana] = SEED_USERS;

async function setup() {
  const unitOfWork = new InMemoryApiStore();
  const clock = new FixedClock(new Date('2026-11-23T11:00:00.000Z'));
  const eventBus = createInMemoryConversationEventBus();
  const metrics = new RecordingMetrics();
  const deps = { unitOfWork, clock, eventBus, metrics };
  const { id } = await getCurrentConversation(deps, ana);
  const handoff = () =>
    requestHandoff(deps, id, {
      reason: 'EMPLOYEE_REQUEST',
      summary: 'O funcionário pediu para falar com um analista.',
      priorityInput: {},
      actorId: ana.id,
    });
  return { id, unitOfWork, handoff, eventBus, metrics };
}

describe('transferência para um analista', () => {
  it('calcula três dias úteis para MEDIUM, grava a mensagem e publica o status e as métricas', async () => {
    const { id, unitOfWork, handoff, eventBus, metrics } = await setup();
    const listener = vi.fn();
    eventBus.subscribe({ conversationId: id }, listener);

    expect(await handoff()).toMatchObject({
      status: 'WAITING_ANALYST',
      handoff: {
        priority: 'MEDIUM',
        dueAt: '2026-11-25T21:00:00.000Z',
        requestedAt: '2026-11-23T11:00:00.000Z',
        reason: 'EMPLOYEE_REQUEST',
        overdue: false,
      },
      messages: [{ author: 'SYSTEM', content: 'Conversa transferida para um analista.' }],
    });
    expect(await unitOfWork.messages.listByConversation(id, 10)).toHaveLength(1);
    expect(listener.mock.calls).toEqual([
      [{ type: 'status', conversationId: id, status: 'WAITING_ANALYST' }],
    ]);
    expect(metrics.calls).toEqual([
      { method: 'increment', name: 'nexo_messages_total', labels: { author: 'SYSTEM' } },
      { method: 'increment', name: 'nexo_handoffs_total', labels: { reason: 'EMPLOYEE_REQUEST' } },
    ]);
  });

  it('rejeita outro handoff de uma conversa que já aguarda um analista', async () => {
    const { id, unitOfWork, handoff, metrics } = await setup();

    await handoff();
    await expect(handoff()).rejects.toMatchObject({ code: 'CONVERSATION_STATE_CONFLICT' });
    expect(await unitOfWork.messages.listByConversation(id, 10)).toHaveLength(1);
    expect(metrics.calls).toHaveLength(2);
  });
});
