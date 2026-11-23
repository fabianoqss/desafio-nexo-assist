import { and, DrizzleQueryError, eq } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import {
  IdempotencyKeyTakenError,
  type IdempotencyRecord,
  type IdempotencyRepository,
} from '../../application/ports/idempotency-repository.ts';
import type { DatabaseExecutor } from './database.ts';
import { idempotencyKeys } from './schema.ts';

class DrizzleIdempotencyRepository implements IdempotencyRepository {
  readonly #db: DatabaseExecutor;

  constructor(db: DatabaseExecutor) {
    this.#db = db;
  }

  async find(actorId: string, key: string): Promise<IdempotencyRecord | undefined> {
    const [record] = await this.#db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.actorId, actorId), eq(idempotencyKeys.key, key)))
      .limit(1);
    return record;
  }

  async save(record: IdempotencyRecord): Promise<void> {
    try {
      await this.#db.insert(idempotencyKeys).values(record);
    } catch (error) {
      const cause: unknown = error instanceof DrizzleQueryError ? error.cause : error;
      if (cause instanceof DatabaseError && cause.code === '23505') {
        throw new IdempotencyKeyTakenError('Chave de idempotência já utilizada', { cause });
      }
      throw error;
    }
  }
}

export function createDrizzleIdempotencyRepository(db: DatabaseExecutor): IdempotencyRepository {
  return new DrizzleIdempotencyRepository(db);
}
