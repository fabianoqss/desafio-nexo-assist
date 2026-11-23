import { ErrorCode } from '@nexo/contracts';
import {
  computeDueAt,
  ConversationAction,
  type HandoffPriorityInput,
  type HandoffReason,
  MessageAuthor,
  nextConversationStatus,
  resolveHandoffPriority,
} from '@nexo/domain';
import { ConflictError } from '@nexo/server-kit';
import { assertConversationEmployee } from '../../access/conversation-access.ts';
import type { Clock } from '../../ports/clock.ts';
import type { ConversationEventBus } from '../../ports/conversation-event-bus.ts';
import type { Metrics } from '../../ports/metrics.ts';
import type { UnitOfWork } from '../../ports/unit-of-work.ts';
import { type ConversationView, readConversationView } from '../../views/conversation-view.ts';

interface RequestHandoffDependencies {
  unitOfWork: UnitOfWork;
  clock: Clock;
  metrics: Metrics;
  eventBus: ConversationEventBus;
}

interface RequestHandoffInput {
  reason: HandoffReason;
  summary: string;
  priorityInput: HandoffPriorityInput;
  actorId: string;
}

export async function requestHandoff(
  { unitOfWork, clock, metrics, eventBus }: RequestHandoffDependencies,
  conversationId: string,
  { reason, summary, priorityInput, actorId }: RequestHandoffInput,
): Promise<ConversationView> {
  const view = await unitOfWork.run(async (store) => {
    const conversation = assertConversationEmployee(
      actorId,
      await store.conversations.findByIdForUpdate(conversationId),
    );
    const status = nextConversationStatus(conversation.status, ConversationAction.HANDOFF);
    if (status === undefined) {
      throw new ConflictError(
        ErrorCode.CONVERSATION_STATE_CONFLICT,
        'A conversa não pode ser transferida',
      );
    }

    const now = clock.now();
    const priority = resolveHandoffPriority(priorityInput);
    const updated = {
      ...conversation,
      status,
      lastMessageAt: now,
      handoff: { reason, summary, priority, requestedAt: now, dueAt: computeDueAt(priority, now) },
    };
    await store.conversations.update(updated);
    await store.messages.append({
      conversationId,
      author: MessageAuthor.SYSTEM,
      content: 'Conversa transferida para um analista.',
      createdAt: now,
    });
    return readConversationView(store, updated, now);
  });

  eventBus.publish({ type: 'status', conversationId, status: view.status });
  metrics.increment('nexo_messages_total', { author: MessageAuthor.SYSTEM });
  metrics.increment('nexo_handoffs_total', { reason });
  return view;
}
