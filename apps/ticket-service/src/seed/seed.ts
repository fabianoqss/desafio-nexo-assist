import { TicketEventKind } from '@nexo/domain';
import type { UnitOfWork } from '../application/ports/unit-of-work.ts';
import { buildSeedTickets } from './seed-tickets.ts';

export async function seedTickets(unitOfWork: UnitOfWork, now: Date): Promise<void> {
  const entries = buildSeedTickets(now);

  await unitOfWork.run(async ({ tickets }) => {
    for (const ticket of entries) {
      if (await tickets.findById(ticket.id)) {
        await tickets.update(ticket);
        continue;
      }

      await tickets.insert(ticket);
      await tickets.appendEvent({
        ticketId: ticket.id,
        kind: TicketEventKind.CREATED,
        actorId: ticket.requesterId,
        payload: {},
        createdAt: ticket.createdAt,
      });
    }
  });
}
