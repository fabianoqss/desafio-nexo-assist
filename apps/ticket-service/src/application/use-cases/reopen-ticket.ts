import { ErrorCode, type ReopenTicketRequest } from '@nexo/contracts';
import { TicketEventKind, TicketStatus, UserRole, canReopen } from '@nexo/domain';
import { assertCanRead } from '../access/access-policy.ts';
import type { Actor } from '../access/actor.ts';
import { ConflictError, ForbiddenError } from '../errors/application-error.ts';
import {
  withIdempotency,
  type IdempotencyContext,
  type WriteDependencies,
  type WriteResult,
} from '../idempotency/with-idempotency.ts';

export function reopenTicket(
  deps: WriteDependencies,
  actor: Actor,
  id: string,
  request: ReopenTicketRequest,
  context: IdempotencyContext,
): Promise<WriteResult> {
  return withIdempotency(deps, actor, 'reopen-ticket', context, async ({ tickets }) => {
    const ticket = assertCanRead(actor, await tickets.findByIdForUpdate(id));
    if (actor.role !== UserRole.EMPLOYEE) {
      throw new ForbiddenError('Somente o solicitante pode reabrir o chamado');
    }

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
