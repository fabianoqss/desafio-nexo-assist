import { ConversationStatus } from '@nexo/domain';
import { and, asc, desc, eq, gte, ne, sql } from 'drizzle-orm';
import type { Conversation } from '../../application/model/conversation.ts';
import type {
  ConsoleFilter,
  ConversationRepository,
} from '../../application/ports/conversation-repository.ts';
import type { DatabaseExecutor } from './database.ts';
import { conversations } from './schema.ts';

function toConversation(row: typeof conversations.$inferSelect): Conversation {
  const {
    assignedAnalystId,
    handoffReason,
    handoffSummary,
    handoffPriority,
    handoffRequestedAt,
    handoffDueAt,
    assumedAt,
    closedAt,
    ...conversation
  } = row;

  const handoff =
    handoffReason === null ||
    handoffSummary === null ||
    handoffPriority === null ||
    handoffRequestedAt === null ||
    handoffDueAt === null
      ? undefined
      : {
          reason: handoffReason,
          summary: handoffSummary,
          priority: handoffPriority,
          requestedAt: handoffRequestedAt,
          dueAt: handoffDueAt,
        };

  return {
    ...conversation,
    ...(assignedAnalystId === null ? {} : { assignedAnalystId }),
    ...(handoff === undefined ? {} : { handoff }),
    ...(assumedAt === null ? {} : { assumedAt }),
    ...(closedAt === null ? {} : { closedAt }),
  };
}

function toValues({
  handoff,
  assignedAnalystId,
  assumedAt,
  closedAt,
  ...conversation
}: Conversation) {
  return {
    ...conversation,
    assignedAnalystId: assignedAnalystId ?? null,
    handoffReason: handoff?.reason ?? null,
    handoffSummary: handoff?.summary ?? null,
    handoffPriority: handoff?.priority ?? null,
    handoffRequestedAt: handoff?.requestedAt ?? null,
    handoffDueAt: handoff?.dueAt ?? null,
    assumedAt: assumedAt ?? null,
    closedAt: closedAt ?? null,
  };
}

function consoleCondition(filter: ConsoleFilter, analystId: string) {
  switch (filter) {
    case 'ALL':
      return ne(conversations.status, ConversationStatus.CLOSED);
    case 'FOR_YOU':
      return eq(conversations.status, ConversationStatus.WAITING_ANALYST);
    case 'WITH_AGENT':
      return eq(conversations.status, ConversationStatus.WITH_AGENT);
    case 'MINE':
      return and(
        eq(conversations.status, ConversationStatus.WITH_ANALYST),
        eq(conversations.assignedAnalystId, analystId),
      );
  }
}

export function createDrizzleConversationRepository(db: DatabaseExecutor): ConversationRepository {
  const selectById = (id: string) =>
    db.select().from(conversations).where(eq(conversations.id, id)).limit(1);

  return {
    async findOpenByEmployee(employeeId) {
      const [row] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.employeeId, employeeId),
            ne(conversations.status, ConversationStatus.CLOSED),
          ),
        )
        .limit(1);
      return row && toConversation(row);
    },
    async findById(id) {
      const [row] = await selectById(id);
      return row && toConversation(row);
    },
    async findByIdForUpdate(id) {
      const [row] = await selectById(id).for('update');
      return row && toConversation(row);
    },
    async insert(conversation) {
      await db.insert(conversations).values(toValues(conversation));
    },
    async update(conversation) {
      const { id, ...values } = toValues(conversation);
      await db.update(conversations).set(values).where(eq(conversations.id, id));
    },
    async listForConsole(filter, analystId, limit) {
      const waiting = eq(conversations.status, ConversationStatus.WAITING_ANALYST);
      const rows = await db
        .select()
        .from(conversations)
        .where(consoleCondition(filter, analystId))
        .orderBy(
          desc(waiting),
          sql`case when ${waiting} then ${conversations.handoffDueAt} end asc nulls last`,
          desc(conversations.lastMessageAt),
          asc(conversations.id),
        )
        .limit(limit);
      return rows.map(toConversation);
    },
    async statsSince(since) {
      const closed = eq(conversations.status, ConversationStatus.CLOSED);
      const [row] = await db
        .select({
          total: sql<number>`count(*)`.mapWith(Number),
          closedWithoutHandoff:
            sql<number>`count(*) filter (where ${closed} and ${conversations.handoffRequestedAt} is null)`.mapWith(
              Number,
            ),
          closed: sql<number>`count(*) filter (where ${closed})`.mapWith(Number),
          averageHandoffWaitSeconds: sql<number | null>`
            avg(extract(epoch from (${conversations.assumedAt} - ${conversations.handoffRequestedAt})))
            filter (where ${conversations.assumedAt} >= ${conversations.handoffRequestedAt})
          `.mapWith(Number),
        })
        .from(conversations)
        .where(gte(conversations.createdAt, since));
      if (!row) {
        throw new Error('A consulta de estatísticas não retornou o agregado');
      }
      return row;
    },
  };
}
