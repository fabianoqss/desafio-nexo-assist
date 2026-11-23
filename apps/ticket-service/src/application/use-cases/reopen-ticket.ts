import { ErrorCode, type ReopenTicketRequest } from '@nexo/contracts';
import { TicketEventKind, TicketStatus, UserRole, canReopen } from '@nexo/domain';
import { ConflictError, ForbiddenError } from '@nexo/server-kit';
import { assertCanRead, lockScopeFor } from '../access/access-policy.ts';
import type { Actor } from '../access/actor.ts';
import {
  withIdempotency,
  type IdempotencyContext,
  type WriteDependencies,
  type WriteResult,
} from '../idempotency/with-idempotency.ts';

export async function reopenTicket(
  deps: WriteDependencies,
  actor: Actor,
  id: string,
  request: ReopenTicketRequest,
  context: IdempotencyContext,
): Promise<WriteResult> {
  if (actor.role !== UserRole.EMPLOYEE) {
    throw new ForbiddenError('Somente o solicitante pode reabrir o chamado');
  }

  return withIdempotency(deps, actor, `reopen-ticket:${id}`, context, async ({ tickets }) => {
    const ticket = assertCanRead(actor, await tickets.findByIdForUpdate(id, lockScopeFor(actor)));

    const { resolvedAt, ...ticketWithoutResolution } = ticket;
    const resolution = {
      status: ticket.status,
      ...(resolvedAt === undefined ? {} : { resolvedAt }),
    };
    const now = deps.clock.now();
    if (!canReopen(resolution, now)) {
      throw new ConflictError(ErrorCode.REOPEN_NOT_ALLOWED, 'O chamado não pode ser reaberto');
    }

    await tickets.update({
      ...ticketWithoutResolution,
      status: TicketStatus.OPEN,
      lastUpdateAt: now,
    });
    await tickets.appendEvent({
      ticketId: id,
      kind: TicketEventKind.REOPENED,
      actorId: actor.id,
      payload: { message: request.message },
      createdAt: now,
    });
    return id;
  });
}
