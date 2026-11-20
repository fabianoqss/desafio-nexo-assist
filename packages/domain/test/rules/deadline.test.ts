import { describe, expect, it } from 'vitest';

import { computeDueAt, DEADLINES, DeadlineKind, Priority } from '../../src/index.ts';

describe('DEADLINES', () => {
  it('follows the Annex A service levels', () => {
    expect(DEADLINES).toEqual({
      CRITICAL: { kind: DeadlineKind.WALL_CLOCK_HOURS, amount: 1 },
      HIGH: { kind: DeadlineKind.BUSINESS_HOURS, amount: 4 },
      MEDIUM: { kind: DeadlineKind.BUSINESS_HOURS, amount: 30 },
      LOW: { kind: DeadlineKind.BUSINESS_HOURS, amount: 50 },
    });
  });
});

describe('computeDueAt', () => {
  it.each([
    {
      scenario: 'critical counts wall-clock hours, even on a Saturday night',
      priority: Priority.CRITICAL,
      from: '2026-12-12T06:00:00Z',
      expected: '2026-12-12T07:00:00Z',
    },
    {
      scenario: 'high counts 4 business hours across the weekend',
      priority: Priority.HIGH,
      from: '2026-12-11T20:00:00Z',
      expected: '2026-12-14T14:00:00Z',
    },
    {
      scenario: 'medium counts 3 business days',
      priority: Priority.MEDIUM,
      from: '2026-12-09T17:20:00Z',
      expected: '2026-12-14T17:20:00Z',
    },
    {
      scenario: 'low counts 5 business days',
      priority: Priority.LOW,
      from: '2026-12-09T17:20:00Z',
      expected: '2026-12-16T17:20:00Z',
    },
  ])('$scenario', ({ priority, from, expected }) => {
    expect(computeDueAt(priority, new Date(from)).toISOString()).toBe(
      new Date(expected).toISOString(),
    );
  });
});
