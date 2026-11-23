import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { TicketStore, UnitOfWork } from '../../application/ports/unit-of-work.ts';
import { createDrizzleIdempotencyRepository } from './drizzle-idempotency-repository.ts';
import { createDrizzleTicketRepository } from './drizzle-ticket-repository.ts';

export function createDrizzleUnitOfWork(db: NodePgDatabase): UnitOfWork {
  return {
    run<T>(work: (store: TicketStore) => Promise<T>): Promise<T> {
      return db.transaction((tx) =>
        work({
          tickets: createDrizzleTicketRepository(tx),
          idempotency: createDrizzleIdempotencyRepository(tx),
        }),
      );
    },
  };
}
