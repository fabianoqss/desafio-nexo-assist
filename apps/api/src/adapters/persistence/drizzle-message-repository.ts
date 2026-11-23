import { MessageResponseSchema } from '@nexo/contracts';
import { desc, eq, inArray } from 'drizzle-orm';
import type { Message } from '../../application/model/message.ts';
import type { MessageRepository } from '../../application/ports/message-repository.ts';
import type { DatabaseExecutor } from './database.ts';
import { messages } from './schema.ts';

function toMessage({ id, authorId, ...message }: typeof messages.$inferSelect): Message {
  return {
    ...message,
    id: MessageResponseSchema.shape.id.parse(id.toString()),
    ...(authorId === null ? {} : { authorId }),
  };
}

export function createDrizzleMessageRepository(db: DatabaseExecutor): MessageRepository {
  return {
    async append(message) {
      const [row] = await db.insert(messages).values(message).returning();
      if (!row) {
        throw new Error('A inserção não retornou a mensagem');
      }
      return toMessage(row);
    },
    async listByConversation(conversationId, limit) {
      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(desc(messages.id))
        .limit(limit);
      return rows.reverse().map(toMessage);
    },
    async lastByConversations(ids) {
      const rows = await db
        .selectDistinctOn([messages.conversationId])
        .from(messages)
        .where(inArray(messages.conversationId, ids))
        .orderBy(messages.conversationId, desc(messages.id));
      return new Map(rows.map((row) => [row.conversationId, toMessage(row)]));
    },
  };
}
