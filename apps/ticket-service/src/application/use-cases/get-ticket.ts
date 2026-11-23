import { assertCanRead } from '../access/access-policy.ts';
import type { Actor } from '../access/actor.ts';
import type { Clock } from '../ports/clock.ts';
import type { TicketRepository } from '../ports/ticket-repository.ts';
import { toTicketView, type TicketView } from '../views/ticket-view.ts';

export async function getTicket(
  deps: { tickets: TicketRepository; clock: Clock },
  actor: Actor,
  id: string,
): Promise<TicketView> {
  const ticket = assertCanRead(actor, await deps.tickets.findById(id));

  return toTicketView(ticket, deps.clock.now());
}
