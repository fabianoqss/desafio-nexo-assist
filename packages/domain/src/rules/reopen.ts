import type { Ticket } from '../entities/ticket.ts';
import { TicketStatus } from '../enums/ticket-status.ts';

export const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type ReopenCheckInput = Pick<Ticket, 'status' | 'resolvedAt'>;

export function canReopen(ticket: ReopenCheckInput, now: Date): boolean {
  if (ticket.status !== TicketStatus.RESOLVED || ticket.resolvedAt === undefined) {
    return false;
  }
  return now.getTime() - ticket.resolvedAt.getTime() <= REOPEN_WINDOW_MS;
}
