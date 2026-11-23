export const ConversationStatus = {
  WITH_AGENT: 'WITH_AGENT',
  WAITING_ANALYST: 'WAITING_ANALYST',
  WITH_ANALYST: 'WITH_ANALYST',
  CLOSED: 'CLOSED',
} as const;

export type ConversationStatus = (typeof ConversationStatus)[keyof typeof ConversationStatus];
