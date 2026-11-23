import { NotFoundError } from '@nexo/server-kit';
import type { AuthenticatedUser } from '../auth/authenticated-user.ts';
import type { Conversation } from '../model/conversation.ts';

export function assertConversationEmployee(
  employeeId: string,
  conversation: Conversation | undefined,
): Conversation {
  if (conversation?.employeeId !== employeeId) {
    throw new NotFoundError('Conversa não encontrada');
  }
  return conversation;
}

export function assertOwnConversation(
  user: AuthenticatedUser,
  conversation: Conversation | undefined,
): Conversation {
  return assertConversationEmployee(user.id, conversation);
}
