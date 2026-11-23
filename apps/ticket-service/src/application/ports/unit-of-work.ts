import type { IdempotencyRepository } from './idempotency-repository.ts';
import type { TicketRepository } from './ticket-repository.ts';

export interface TicketStore {
  tickets: TicketRepository;
  idempotency: IdempotencyRepository;
}

export interface UnitOfWork {
  run<T>(work: (store: TicketStore) => Promise<T>): Promise<T>;
}
