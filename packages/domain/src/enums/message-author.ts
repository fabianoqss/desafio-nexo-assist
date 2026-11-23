export const MessageAuthor = {
  EMPLOYEE: 'EMPLOYEE',
  AGENT: 'AGENT',
  ANALYST: 'ANALYST',
  SYSTEM: 'SYSTEM',
} as const;

export type MessageAuthor = (typeof MessageAuthor)[keyof typeof MessageAuthor];
