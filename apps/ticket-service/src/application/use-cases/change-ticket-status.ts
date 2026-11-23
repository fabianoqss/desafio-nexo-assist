import { ErrorCode, type ChangeTicketStatusRequest } from '@nexo/contracts';
import { TicketStatus, UserRole, canChangeStatus, statusChangeEventKind } from '@nexo/domain';
import { assertCanRead } from '../access/access-policy.ts';
import type { Actor } from '../access/actor.ts';
import { ConflictError, ForbiddenError } from '../errors/application-error.ts';
import {
  withIdempotency,
  type IdempotencyContext,
  type WriteDependencies,
  type WriteResult,
} from '../idempotency/with-idempotency.ts';

export async function changeTicketStatus(
  deps: WriteDependencies,
  actor: Actor,
  id: string,
  request: ChangeTicketStatusRequest,
  context: IdempotencyContext,
): Promise<WriteResult> {
  if (actor.role !== UserRole.ANALYST) {
    throw new ForbiddenError('Somente analistas podem alterar o status de chamados');
  }

  return withIdempotency(
    deps,
    actor,
    `change-ticket-status:${id}`,
    context,
    async ({ tickets }) => {
      const ticket = assertCanRead(actor, await tickets.findByIdForUpdate(id));
      const from = ticket.status;
      const to = request.status;
      if (!canChangeStatus(from, to)) {
        throw new ConflictError(
          ErrorCode.INVALID_STATUS_TRANSITION,
          'Transição de status inválida',
        );
      }

      const now = deps.clock.now();
      await tickets.update({
        ...ticket,
        status: to,
        lastUpdateAt: now,
        ...(to === TicketStatus.RESOLVED ? { resolvedAt: now } : {}),
      });
      await tickets.appendEvent({
        ticketId: id,
        kind: statusChangeEventKind(to),
        actorId: actor.id,
        payload: { from, to },
        createdAt: now,
      });
      return id;
    },
  );
}
