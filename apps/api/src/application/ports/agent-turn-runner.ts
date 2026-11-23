import type { AuthenticatedUser } from '../auth/authenticated-user.ts';
import type { Conversation } from '../model/conversation.ts';
import type { Draft } from '../model/draft.ts';
import type { Message } from '../model/message.ts';

export interface AgentTurnContext {
  conversation: Conversation;
  employee: AuthenticatedUser;
  history: Message[];
  signal: AbortSignal;
}

export type AgentTurnEvent =
  | { type: 'message'; author: 'AGENT' | 'SYSTEM'; content: string }
  | { type: 'draft'; draft: Draft };

export interface AgentTurnRunner {
  run(context: AgentTurnContext): AsyncIterable<AgentTurnEvent>;
}
