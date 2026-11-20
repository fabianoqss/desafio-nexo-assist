import { addHours } from 'date-fns';

import { addBusinessHours } from '../calendar/business-hours.ts';
import { DeadlineKind } from '../enums/deadline-kind.ts';
import type { Priority } from '../enums/priority.ts';

export interface DeadlinePolicy {
  kind: DeadlineKind;
  amount: number;
}

export const DEADLINES = {
  CRITICAL: { kind: DeadlineKind.WALL_CLOCK_HOURS, amount: 1 },
  HIGH: { kind: DeadlineKind.BUSINESS_HOURS, amount: 4 },
  MEDIUM: { kind: DeadlineKind.BUSINESS_HOURS, amount: 30 },
  LOW: { kind: DeadlineKind.BUSINESS_HOURS, amount: 50 },
} as const satisfies Record<Priority, DeadlinePolicy>;

export function computeDueAt(priority: Priority, from: Date): Date {
  const { kind, amount } = DEADLINES[priority];
  return kind === DeadlineKind.WALL_CLOCK_HOURS
    ? addHours(from, amount)
    : addBusinessHours(from, amount);
}
