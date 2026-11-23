import { ErrorCode } from '@nexo/contracts';
import { ConflictError } from '@nexo/server-kit';
import { assertCanRead } from '../access/access-policy.ts';
import type { Actor } from '../access/actor.ts';
import type { Clock } from '../ports/clock.ts';
import type { IdempotencyRecord, IdempotencyRepository } from '../ports/idempotency-repository.ts';
import type { TicketRepository } from '../ports/ticket-repository.ts';
import type { TicketStore, UnitOfWork } from '../ports/unit-of-work.ts';
import { toTicketView, type TicketView } from '../views/ticket-view.ts';

export interface IdempotencyContext {
  key: string;
  requestHash: string;
}

export interface WriteResult {
  ticket: TicketView;
  replayed: boolean;
}

export interface WriteDependencies {
  unitOfWork: UnitOfWork;
  tickets: TicketRepository;
  idempotency: IdempotencyRepository;
  clock: Clock;
}

function assertSameRequest(
  record: IdempotencyRecord,
  operation: string,
  requestHash: string,
): void {
  if (record.operation !== operation || record.requestHash !== requestHash) {
    throw new ConflictError(
      ErrorCode.IDEMPOTENCY_KEY_REUSED,
      'Chave de idempotência já utilizada em outra requisição',
    );
  }
}

export async function withIdempotency(
  deps: WriteDependencies,
  actor: Actor,
  operation: string,
  context: IdempotencyContext,
  work: (store: TicketStore) => Promise<string>,
): Promise<WriteResult> {
  const { key, requestHash } = context;
  let result: { ticketId: string; replayed: boolean };

  try {
    result = await deps.unitOfWork.run(async (store) => {
      const record = await store.idempotency.find(actor.id, key);
      if (record !== undefined) {
        assertSameRequest(record, operation, requestHash);
        return { ticketId: record.ticketId, replayed: true };
      }

      const ticketId = await work(store);
      await store.idempotency.save({
        actorId: actor.id,
        key,
        operation,
        requestHash,
        ticketId,
        createdAt: deps.clock.now(),
      });
      return { ticketId, replayed: false };
    });
  } catch (error) {
    const record = await deps.idempotency.find(actor.id, key);
    if (record === undefined) {
      throw error;
    }
    assertSameRequest(record, operation, requestHash);
    result = { ticketId: record.ticketId, replayed: true };
  }

  const ticket = assertCanRead(actor, await deps.tickets.findById(result.ticketId));
  return { ticket: toTicketView(ticket, deps.clock.now()), replayed: result.replayed };
}
