export const DraftKind = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  REOPEN: 'REOPEN',
} as const;

export type DraftKind = (typeof DraftKind)[keyof typeof DraftKind];
