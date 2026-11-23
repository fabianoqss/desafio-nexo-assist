import type { ListTicketsQuery } from '@nexo/contracts';
import { resolveRequesterScope } from '../access/access-policy.ts';
import type { Actor } from '../access/actor.ts';
import type { Clock } from '../ports/clock.ts';
import type { TicketRepository } from '../ports/ticket-repository.ts';
import { toTicketView, type TicketView } from '../views/ticket-view.ts';

export async function listTickets(
  deps: { tickets: TicketRepository; clock: Clock },
  actor: Actor,
  query: ListTicketsQuery,
): Promise<TicketView[]> {
  const { requesterId: requestedRequesterId, limit, status } = query;
  const requesterId = resolveRequesterScope(actor, requestedRequesterId);
  const tickets = await deps.tickets.list({
    limit,
    ...(requesterId === undefined ? {} : { requesterId }),
    ...(status === undefined ? {} : { status }),
  });
  const now = deps.clock.now();

  return tickets.map((ticket) => toTicketView(ticket, now));
}
