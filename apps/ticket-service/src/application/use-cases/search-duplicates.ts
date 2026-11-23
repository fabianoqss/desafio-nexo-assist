import type { DuplicateSearchQuery } from '@nexo/contracts';
import { findDuplicateCandidates, type DuplicateAction } from '@nexo/domain';
import { ValidationError } from '@nexo/server-kit';
import { resolveRequesterScope } from '../access/access-policy.ts';
import type { Actor } from '../access/actor.ts';
import type { Clock } from '../ports/clock.ts';
import type { TicketRepository } from '../ports/ticket-repository.ts';
import { toTicketView, type TicketView } from '../views/ticket-view.ts';

export async function searchDuplicates(
  deps: { tickets: TicketRepository; clock: Clock },
  actor: Actor,
  query: DuplicateSearchQuery,
): Promise<{ ticket: TicketView; similarity: number; action: DuplicateAction }[]> {
  const requesterId = resolveRequesterScope(actor, query.requesterId);
  if (requesterId === undefined) {
    throw new ValidationError('Informe o requesterId para buscar chamados duplicados');
  }

  const tickets = await deps.tickets.list({ requesterId, limit: 100 });
  const now = deps.clock.now();

  return findDuplicateCandidates(query, tickets, now).map((candidate) => ({
    ...candidate,
    ticket: toTicketView(candidate.ticket, now),
  }));
}
