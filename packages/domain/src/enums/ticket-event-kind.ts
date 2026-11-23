export const TicketEventKind = {
  CREATED: 'CREATED',
  INFO_ADDED: 'INFO_ADDED',
  REOPENED: 'REOPENED',
  TRANSFERRED: 'TRANSFERRED',
  ASSUMED: 'ASSUMED',
  UPDATED: 'UPDATED',
  RESOLVED: 'RESOLVED',
} as const;

export type TicketEventKind = (typeof TicketEventKind)[keyof typeof TicketEventKind];
