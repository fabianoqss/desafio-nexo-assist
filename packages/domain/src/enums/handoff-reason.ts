export const HandoffReason = {
  EMPLOYEE_REQUEST: 'EMPLOYEE_REQUEST',
  CRITICAL_CASE: 'CRITICAL_CASE',
  OVERDUE_TICKET: 'OVERDUE_TICKET',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  MESSAGE_LIMIT: 'MESSAGE_LIMIT',
} as const;

export type HandoffReason = (typeof HandoffReason)[keyof typeof HandoffReason];
