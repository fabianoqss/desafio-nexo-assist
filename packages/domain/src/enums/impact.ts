export const Impact = {
  SELF: 'SELF',
  TEAM: 'TEAM',
  COMPANY: 'COMPANY',
} as const;

export type Impact = (typeof Impact)[keyof typeof Impact];
