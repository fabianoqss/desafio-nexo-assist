import { ErrorCode, type AddTicketInfoRequest } from '@nexo/contracts';
import { TicketEventKind, TicketStatus } from '@nexo/domain';
import { ConflictError } from '@nexo/server-kit';
import { assertCanRead, lockScopeFor } from '../access/access-policy.ts';
import type { Actor } from '../access/actor.ts';
import {
  withIdempotency,
  type IdempotencyContext,
  type WriteDependencies,
  type WriteResult,
} from '../idempotency/with-idempotency.ts';

export function addTicketInfo(
  deps: WriteDependencies,
  actor: Actor,
  id: string,
  request: AddTicketInfoRequest,
  context: IdempotencyContext,
): Promise<WriteResult> {
  return withIdempotency(deps, actor, `add-ticket-info:${id}`, context, async ({ tickets }) => {
    const ticket = assertCanRead(actor, await tickets.findByIdForUpdate(id, lockScopeFor(actor)));
    if (ticket.status === TicketStatus.RESOLVED) {
      throw new ConflictError(
        ErrorCode.TICKET_RESOLVED,
        'Chamados resolvidos precisam ser reabertos para receber informações',
      );
    }

    const now = deps.clock.now();
    await tickets.update({ ...ticket, lastUpdateAt: now });
    await tickets.appendEvent({
      ticketId: id,
      kind: TicketEventKind.INFO_ADDED,
      actorId: actor.id,
      payload: { message: request.message },
      createdAt: now,
    });
    return id;
  });
}
