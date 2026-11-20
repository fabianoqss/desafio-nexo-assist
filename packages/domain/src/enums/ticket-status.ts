export const TicketStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_ANALYST: 'WAITING_ANALYST',
  APPROVED: 'APPROVED',
  RESOLVED: 'RESOLVED',
} as const;

export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];
