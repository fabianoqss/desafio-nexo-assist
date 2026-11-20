export const DuplicateAction = {
  UPDATE: 'UPDATE',
  REOPEN: 'REOPEN',
} as const;

export type DuplicateAction = (typeof DuplicateAction)[keyof typeof DuplicateAction];
