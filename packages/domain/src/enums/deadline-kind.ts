export const DeadlineKind = {
  WALL_CLOCK_HOURS: 'wall-clock-hours',
  BUSINESS_HOURS: 'business-hours',
} as const;

export type DeadlineKind = (typeof DeadlineKind)[keyof typeof DeadlineKind];
