import type { CreateTicketRequest } from '@nexo/contracts';
import { TicketEventKind, TicketStatus, UserRole, validateTicketDraft } from '@nexo/domain';
import { ForbiddenError, ValidationError } from '@nexo/server-kit';
import type { Actor } from '../access/actor.ts';
import {
  withIdempotency,
  type IdempotencyContext,
  type WriteDependencies,
  type WriteResult,
} from '../idempotency/with-idempotency.ts';

export async function createTicket(
  deps: WriteDependencies,
  actor: Actor,
  request: CreateTicketRequest,
  context: IdempotencyContext,
): Promise<WriteResult> {
  if (actor.role !== UserRole.EMPLOYEE) {
    throw new ForbiddenError('Somente funcionários podem criar chamados');
  }

  return withIdempotency(deps, actor, 'create-ticket', context, async ({ tickets }) => {
    const validation = validateTicketDraft(request);
    if (!validation.ok) {
      throw new ValidationError('Dados do chamado incompletos');
    }

    const { draft, priority } = validation;
    const ticketId = await tickets.nextId(draft.type);
    const now = deps.clock.now();
    await tickets.insert({
      ...draft,
      id: ticketId,
      priority,
      status: TicketStatus.OPEN,
      requesterId: actor.id,
      createdAt: now,
      lastUpdateAt: now,
    });
    await tickets.appendEvent({
      ticketId,
      kind: TicketEventKind.CREATED,
      actorId: actor.id,
      payload: {},
      createdAt: now,
    });
    return ticketId;
  });
}
