import { UserRole, type Ticket } from '@nexo/domain';
import { ForbiddenError, NotFoundError } from '../errors/application-error.ts';
import type { Actor } from './actor.ts';

export function resolveRequesterScope(
  actor: Actor,
  requestedRequesterId?: string,
): string | undefined {
  if (actor.role === UserRole.ANALYST) {
    return requestedRequesterId;
  }
  if (requestedRequesterId !== undefined && requestedRequesterId !== actor.id) {
    throw new ForbiddenError('Funcionários só podem consultar os próprios chamados');
  }
  return actor.id;
}

export function assertCanRead(actor: Actor, ticket: Ticket | undefined): Ticket {
  if (
    ticket === undefined ||
    (actor.role !== UserRole.ANALYST && ticket.requesterId !== actor.id)
  ) {
    throw new NotFoundError('Chamado não encontrado');
  }
  return ticket;
}
