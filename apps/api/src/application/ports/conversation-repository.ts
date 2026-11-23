import type { ConsoleConversationsQuery } from '@nexo/contracts';
import type { Conversation } from '../model/conversation.ts';

export type ConsoleFilter = ConsoleConversationsQuery['filter'];

export interface ConversationStats {
  total: number;
  closedWithoutHandoff: number;
  closed: number;
  averageHandoffWaitSeconds: number | null;
}

export interface ConversationRepository {
  findOpenByEmployee(employeeId: string): Promise<Conversation | undefined>;
  findById(id: string): Promise<Conversation | undefined>;
  findByIdForUpdate(id: string): Promise<Conversation | undefined>;
  insert(conversation: Conversation): Promise<void>;
  update(conversation: Conversation): Promise<void>;
  listForConsole(filter: ConsoleFilter, analystId: string, limit: number): Promise<Conversation[]>;
  statsSince(since: Date): Promise<ConversationStats>;
}
