import type { ConversationRepository } from './conversation-repository.ts';
import type { DraftRepository } from './draft-repository.ts';
import type { MessageRepository } from './message-repository.ts';
import type { SessionRepository } from './session-repository.ts';
import type { UserRepository } from './user-repository.ts';

export interface ApiStore {
  users: UserRepository;
  sessions: SessionRepository;
  conversations: ConversationRepository;
  messages: MessageRepository;
  drafts: DraftRepository;
}

export interface UnitOfWork {
  run<T>(work: (store: ApiStore) => Promise<T>): Promise<T>;
}
