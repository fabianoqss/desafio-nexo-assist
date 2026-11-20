import type { Ticket } from '../entities/ticket.ts';
import { TicketStatus } from '../enums/ticket-status.ts';
import { computeDueAt } from './deadline.ts';

export type OverdueCheckInput = Pick<Ticket, 'priority' | 'status' | 'lastUpdateAt'>;

export function isOverdue(ticket: OverdueCheckInput, now: Date): boolean {
  if (ticket.status === TicketStatus.RESOLVED) {
    return false;
  }
  return now > computeDueAt(ticket.priority, ticket.lastUpdateAt);
}
