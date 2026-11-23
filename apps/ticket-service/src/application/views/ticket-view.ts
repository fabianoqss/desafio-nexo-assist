import { computeDueAt, isOverdue, type Ticket } from '@nexo/domain';

export type TicketView = Ticket & { dueAt: Date; overdue: boolean };

export function toTicketView(ticket: Ticket, now: Date): TicketView {
  return {
    ...ticket,
    dueAt: computeDueAt(ticket.priority, ticket.lastUpdateAt),
    overdue: isOverdue(ticket, now),
  };
}
