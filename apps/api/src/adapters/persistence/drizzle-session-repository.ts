import { and, eq, gt, lte } from 'drizzle-orm';
import type { SessionRepository } from '../../application/ports/session-repository.ts';
import type { DatabaseExecutor } from './database.ts';
import { sessions } from './schema.ts';

export function createDrizzleSessionRepository(db: DatabaseExecutor): SessionRepository {
  return {
    async insert(session) {
      await db.insert(sessions).values(session);
    },
    async findValid(tokenHash, now) {
      const [row] = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
        .limit(1);
      return row;
    },
    async delete(tokenHash) {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    },
    async deleteExpired(now) {
      await db.delete(sessions).where(lte(sessions.expiresAt, now));
    },
  };
}
