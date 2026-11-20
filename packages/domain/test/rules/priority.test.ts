import { describe, expect, it } from 'vitest';

import {
  computePriority,
  Impact,
  Priority,
  resolveHandoffPriority,
  Urgency,
} from '../../src/index.ts';

describe('computePriority', () => {
  it.each([
    { impact: Impact.SELF, urgency: Urgency.BLOCKED, expected: Priority.HIGH },
    { impact: Impact.SELF, urgency: Urgency.SAME_DAY_COMMITMENT, expected: Priority.HIGH },
    { impact: Impact.SELF, urgency: Urgency.HAS_WORKAROUND, expected: Priority.MEDIUM },
    { impact: Impact.SELF, urgency: Urgency.NO_URGENCY, expected: Priority.LOW },
    { impact: Impact.TEAM, urgency: Urgency.BLOCKED, expected: Priority.CRITICAL },
    { impact: Impact.TEAM, urgency: Urgency.SAME_DAY_COMMITMENT, expected: Priority.HIGH },
    { impact: Impact.TEAM, urgency: Urgency.HAS_WORKAROUND, expected: Priority.MEDIUM },
    { impact: Impact.TEAM, urgency: Urgency.NO_URGENCY, expected: Priority.LOW },
    { impact: Impact.COMPANY, urgency: Urgency.BLOCKED, expected: Priority.CRITICAL },
    { impact: Impact.COMPANY, urgency: Urgency.SAME_DAY_COMMITMENT, expected: Priority.HIGH },
    { impact: Impact.COMPANY, urgency: Urgency.HAS_WORKAROUND, expected: Priority.MEDIUM },
    { impact: Impact.COMPANY, urgency: Urgency.NO_URGENCY, expected: Priority.LOW },
  ])('$impact + $urgency -> $expected', ({ impact, urgency, expected }) => {
    expect(computePriority(impact, urgency)).toBe(expected);
  });
});

describe('resolveHandoffPriority', () => {
  it('keeps the existing ticket priority even when impact and urgency point higher', () => {
    expect(
      resolveHandoffPriority({
        ticketPriority: Priority.LOW,
        impact: Impact.COMPANY,
        urgency: Urgency.BLOCKED,
      }),
    ).toBe(Priority.LOW);
  });

  it('computes the priority from impact and urgency when there is no ticket', () => {
    expect(resolveHandoffPriority({ impact: Impact.SELF, urgency: Urgency.BLOCKED })).toBe(
      Priority.HIGH,
    );
  });

  it('falls back to MEDIUM when urgency is missing', () => {
    expect(resolveHandoffPriority({ impact: Impact.SELF })).toBe(Priority.MEDIUM);
  });

  it('falls back to MEDIUM when nothing is known', () => {
    expect(resolveHandoffPriority({})).toBe(Priority.MEDIUM);
  });
});
