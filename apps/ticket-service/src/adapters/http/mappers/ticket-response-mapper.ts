import type { TicketResponse } from '@nexo/contracts';
import type { TicketView } from '../../../application/views/ticket-view.ts';

export function toTicketResponse(ticket: TicketView): TicketResponse {
  const { createdAt, lastUpdateAt, resolvedAt, dueAt, ...fields } = ticket;

  return {
    ...fields,
    createdAt: createdAt.toISOString(),
    lastUpdateAt: lastUpdateAt.toISOString(),
    ...(resolvedAt === undefined ? {} : { resolvedAt: resolvedAt.toISOString() }),
    dueAt: dueAt.toISOString(),
  };
}
