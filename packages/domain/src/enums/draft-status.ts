export const DraftStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
} as const;

export type DraftStatus = (typeof DraftStatus)[keyof typeof DraftStatus];
