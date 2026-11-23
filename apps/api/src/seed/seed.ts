import { SEED_USERS } from '@nexo/seed-data';
import type { UnitOfWork } from '../application/ports/unit-of-work.ts';
import { buildSeedConversations } from './seed-conversations.ts';

export async function seedApi(unitOfWork: UnitOfWork, now: Date): Promise<void> {
  const entries = buildSeedConversations(now);

  await unitOfWork.run(async ({ users, conversations, messages }) => {
    await users.upsertMany(SEED_USERS);

    for (const entry of entries) {
      if (await conversations.findOpenByEmployee(entry.conversation.employeeId)) {
        continue;
      }

      await conversations.insert(entry.conversation);
      for (const message of entry.messages) {
        await messages.append(message);
      }
    }
  });
}
