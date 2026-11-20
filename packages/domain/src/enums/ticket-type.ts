export const TicketType = {
  INC: 'INC',
  REQ: 'REQ',
} as const;

export type TicketType = (typeof TicketType)[keyof typeof TicketType];
