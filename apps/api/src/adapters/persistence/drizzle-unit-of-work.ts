import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ApiStore, UnitOfWork } from '../../application/ports/unit-of-work.ts';
import { createDrizzleConversationRepository } from './drizzle-conversation-repository.ts';
import { createDrizzleDraftRepository } from './drizzle-draft-repository.ts';
import { createDrizzleMessageRepository } from './drizzle-message-repository.ts';
import { createDrizzleSessionRepository } from './drizzle-session-repository.ts';
import { createDrizzleUserRepository } from './drizzle-user-repository.ts';

export function createDrizzleUnitOfWork(db: NodePgDatabase): UnitOfWork {
  return {
    run<T>(work: (store: ApiStore) => Promise<T>): Promise<T> {
      return db.transaction((tx) =>
        work({
          users: createDrizzleUserRepository(tx),
          sessions: createDrizzleSessionRepository(tx),
          conversations: createDrizzleConversationRepository(tx),
          messages: createDrizzleMessageRepository(tx),
          drafts: createDrizzleDraftRepository(tx),
        }),
      );
    },
  };
}
