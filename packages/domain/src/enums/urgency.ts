export const Urgency = {
  BLOCKED: 'BLOCKED',
  SAME_DAY_COMMITMENT: 'SAME_DAY_COMMITMENT',
  HAS_WORKAROUND: 'HAS_WORKAROUND',
  NO_URGENCY: 'NO_URGENCY',
} as const;

export type Urgency = (typeof Urgency)[keyof typeof Urgency];
