import type { ConversationAction } from '../enums/conversation-action.ts';
import { ConversationStatus } from '../enums/conversation-status.ts';

const CONVERSATION_TRANSITIONS = {
  WITH_AGENT: {
    HANDOFF: ConversationStatus.WAITING_ANALYST,
    CLOSE: ConversationStatus.CLOSED,
  },
  WAITING_ANALYST: {
    ASSUME: ConversationStatus.WITH_ANALYST,
    CLOSE: ConversationStatus.CLOSED,
  },
  WITH_ANALYST: {
    RETURN_TO_AGENT: ConversationStatus.WITH_AGENT,
    CLOSE: ConversationStatus.CLOSED,
  },
  CLOSED: {},
} as const satisfies Record<
  ConversationStatus,
  Partial<Record<ConversationAction, ConversationStatus>>
>;

export const MAX_EMPLOYEE_MESSAGES = 30;

export function nextConversationStatus(
  from: ConversationStatus,
  action: ConversationAction,
): ConversationStatus | undefined {
  const transitions: Partial<Record<ConversationAction, ConversationStatus>> =
    CONVERSATION_TRANSITIONS[from];
  return transitions[action];
}

export function shouldAgentReply(status: ConversationStatus): boolean {
  return status === ConversationStatus.WITH_AGENT;
}

export function isHandoffOverdue(
  conversation: { status: ConversationStatus; handoffDueAt?: Date },
  now: Date,
): boolean {
  const { status, handoffDueAt } = conversation;
  return (
    status === ConversationStatus.WAITING_ANALYST &&
    handoffDueAt !== undefined &&
    now > handoffDueAt
  );
}
