import type { ConversationResponse, DraftResponse } from '@nexo/contracts';
import { isHandoffOverdue, MAX_EMPLOYEE_MESSAGES } from '@nexo/domain';
import type { Conversation } from '../model/conversation.ts';
import type { Draft } from '../model/draft.ts';
import type { Message } from '../model/message.ts';
import type { ApiStore } from '../ports/unit-of-work.ts';
import { toMessageView } from './message-view.ts';

export type ConversationView = ConversationResponse;
export const MESSAGE_HISTORY_LIMIT = 100;

export function toDraftView({
  id,
  conversationId,
  status,
  payload,
  ticketId,
  createdAt,
}: Draft): DraftResponse {
  return {
    id,
    conversationId,
    status,
    payload,
    ...(ticketId === undefined ? {} : { ticketId }),
    createdAt: createdAt.toISOString(),
  };
}

export function toConversationView(
  { id, status, employeeMessageCount, handoff }: Conversation,
  messages: readonly Message[],
  pendingDrafts: readonly Draft[],
  now: Date,
): ConversationView {
  return {
    id,
    status,
    employeeMessageCount,
    maxEmployeeMessages: MAX_EMPLOYEE_MESSAGES,
    messages: messages.map(toMessageView),
    pendingDrafts: pendingDrafts.map(toDraftView),
    ...(handoff === undefined
      ? {}
      : {
          handoff: {
            ...handoff,
            requestedAt: handoff.requestedAt.toISOString(),
            dueAt: handoff.dueAt.toISOString(),
            overdue: isHandoffOverdue({ status, handoffDueAt: handoff.dueAt }, now),
          },
        }),
  };
}

export async function readConversationView(
  { messages, drafts }: ApiStore,
  conversation: Conversation,
  now: Date,
): Promise<ConversationView> {
  const history = await messages.listByConversation(conversation.id, MESSAGE_HISTORY_LIMIT);
  const pendingDrafts = await drafts.listPending(conversation.id);
  return toConversationView(conversation, history, pendingDrafts, now);
}
