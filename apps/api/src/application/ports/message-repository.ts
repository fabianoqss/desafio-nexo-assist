import type { Message } from '../model/message.ts';

export type NewMessage = Omit<Message, 'id'>;

export interface MessageRepository {
  append(message: NewMessage): Promise<Message>;
  listByConversation(conversationId: string, limit: number): Promise<Message[]>;
  lastByConversations(ids: readonly string[]): Promise<Map<string, Message>>;
}
