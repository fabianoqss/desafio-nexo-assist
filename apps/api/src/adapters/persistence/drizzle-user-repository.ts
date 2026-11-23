import { eq, inArray, sql } from 'drizzle-orm';
import type { UserRepository } from '../../application/ports/user-repository.ts';
import type { DatabaseExecutor } from './database.ts';
import { users } from './schema.ts';

export function createDrizzleUserRepository(db: DatabaseExecutor): UserRepository {
  return {
    async findByEmail(email) {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row;
    },
    async findById(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row;
    },
    async findManyByIds(ids) {
      return db.select().from(users).where(inArray(users.id, ids));
    },
    async upsertMany(entries) {
      if (entries.length === 0) {
        return;
      }
      await db
        .insert(users)
        .values([...entries])
        .onConflictDoUpdate({
          target: users.id,
          set: {
            name: sql`excluded.name`,
            email: sql`excluded.email`,
            department: sql`excluded.department`,
            role: sql`excluded.role`,
          },
        });
    },
  };
}
