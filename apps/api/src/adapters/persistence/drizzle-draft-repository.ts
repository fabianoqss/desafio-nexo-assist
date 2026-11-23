import { DraftPayloadSchema } from '@nexo/contracts';
import { DraftStatus } from '@nexo/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Draft } from '../../application/model/draft.ts';
import type { DraftRepository } from '../../application/ports/draft-repository.ts';
import type { DatabaseExecutor } from './database.ts';
import { draftNumberSequenceName, ticketDrafts } from './schema.ts';

function toDraft({
  payload,
  ticketId,
  decidedAt,
  ...draft
}: typeof ticketDrafts.$inferSelect): Draft {
  return {
    ...draft,
    payload: DraftPayloadSchema.parse(payload),
    ...(ticketId === null ? {} : { ticketId }),
    ...(decidedAt === null ? {} : { decidedAt }),
  };
}

export function createDrizzleDraftRepository(db: DatabaseExecutor): DraftRepository {
  const selectById = (id: string) =>
    db.select().from(ticketDrafts).where(eq(ticketDrafts.id, id)).limit(1);

  return {
    async nextId() {
      const sequence = `public.${draftNumberSequenceName}`;
      const {
        rows: [row],
      } = await db.execute<{ draftNumber: string }>(
        sql`select nextval(${sequence}::regclass)::text as "draftNumber"`,
      );
      if (!row) {
        throw new Error('A sequência não retornou um número de rascunho');
      }
      return `D-${row.draftNumber}`;
    },
    async insert(draft) {
      await db.insert(ticketDrafts).values(draft);
    },
    async findById(id) {
      const [row] = await selectById(id);
      return row && toDraft(row);
    },
    async findByIdForUpdate(id) {
      const [row] = await selectById(id).for('update');
      return row && toDraft(row);
    },
    async update({ id, ticketId, decidedAt, ...draft }) {
      await db
        .update(ticketDrafts)
        .set({ ...draft, ticketId: ticketId ?? null, decidedAt: decidedAt ?? null })
        .where(eq(ticketDrafts.id, id));
    },
    async listPending(conversationId) {
      const rows = await db
        .select()
        .from(ticketDrafts)
        .where(
          and(
            eq(ticketDrafts.conversationId, conversationId),
            eq(ticketDrafts.status, DraftStatus.PENDING),
          ),
        )
        .orderBy(asc(ticketDrafts.createdAt), asc(ticketDrafts.id));
      return rows.map(toDraft);
    },
  };
}
