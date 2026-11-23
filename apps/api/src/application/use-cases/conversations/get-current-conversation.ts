import { randomUUID } from 'node:crypto';
import { ConversationStatus } from '@nexo/domain';
import type { AuthenticatedUser } from '../../auth/authenticated-user.ts';
import type { Conversation } from '../../model/conversation.ts';
import type { Clock } from '../../ports/clock.ts';
import { OpenConversationTakenError } from '../../ports/conversation-repository.ts';
import type { UnitOfWork } from '../../ports/unit-of-work.ts';
import {
  type ConversationView,
  readConversationView,
  toConversationView,
} from '../../views/conversation-view.ts';

interface GetCurrentConversationDependencies {
  unitOfWork: UnitOfWork;
  clock: Clock;
}

export async function getCurrentConversation(
  { unitOfWork, clock }: GetCurrentConversationDependencies,
  user: AuthenticatedUser,
): Promise<ConversationView> {
  for (;;) {
    const current = await unitOfWork.run(async (store) => {
      const open = await store.conversations.findOpenByEmployee(user.id);
      return open && readConversationView(store, open, clock.now());
    });
    if (current) {
      return current;
    }

    const now = clock.now();
    const conversation: Conversation = {
      id: randomUUID(),
      employeeId: user.id,
      status: ConversationStatus.WITH_AGENT,
      employeeMessageCount: 0,
      createdAt: now,
      lastMessageAt: now,
    };

    try {
      await unitOfWork.run(({ conversations }) => conversations.insert(conversation));
      return toConversationView(conversation, [], [], now);
    } catch (error) {
      if (!(error instanceof OpenConversationTakenError)) {
        throw error;
      }
    }
  }
}
