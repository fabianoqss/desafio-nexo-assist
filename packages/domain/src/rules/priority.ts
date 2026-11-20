import type { Impact } from '../enums/impact.ts';
import { Priority } from '../enums/priority.ts';
import type { Urgency } from '../enums/urgency.ts';

const PRIORITY_MATRIX = {
  SELF: {
    BLOCKED: Priority.HIGH,
    SAME_DAY_COMMITMENT: Priority.HIGH,
    HAS_WORKAROUND: Priority.MEDIUM,
    NO_URGENCY: Priority.LOW,
  },
  TEAM: {
    BLOCKED: Priority.CRITICAL,
    SAME_DAY_COMMITMENT: Priority.HIGH,
    HAS_WORKAROUND: Priority.MEDIUM,
    NO_URGENCY: Priority.LOW,
  },
  COMPANY: {
    BLOCKED: Priority.CRITICAL,
    SAME_DAY_COMMITMENT: Priority.HIGH,
    HAS_WORKAROUND: Priority.MEDIUM,
    NO_URGENCY: Priority.LOW,
  },
} as const satisfies Record<Impact, Record<Urgency, Priority>>;

export const HANDOFF_FALLBACK_PRIORITY = Priority.MEDIUM;

export interface HandoffPriorityInput {
  ticketPriority?: Priority;
  impact?: Impact;
  urgency?: Urgency;
}

export function computePriority(impact: Impact, urgency: Urgency): Priority {
  return PRIORITY_MATRIX[impact][urgency];
}

export function resolveHandoffPriority({
  ticketPriority,
  impact,
  urgency,
}: HandoffPriorityInput): Priority {
  if (ticketPriority) {
    return ticketPriority;
  }
  if (impact && urgency) {
    return computePriority(impact, urgency);
  }
  return HANDOFF_FALLBACK_PRIORITY;
}
