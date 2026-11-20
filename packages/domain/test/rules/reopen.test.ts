import { describe, expect, it } from 'vitest';

import { canReopen, TicketStatus } from '../../src/index.ts';

const resolvedTicket = {
  status: TicketStatus.RESOLVED,
  resolvedAt: new Date('2026-12-09T12:00:00Z'),
};

describe('canReopen', () => {
  it.each([
    { scenario: '4 days after resolution', now: '2026-12-13T12:00:00Z', expected: true },
    { scenario: 'exactly 7 days after resolution', now: '2026-12-16T12:00:00Z', expected: true },
    { scenario: 'one second past 7 days', now: '2026-12-16T12:00:01Z', expected: false },
  ])('$scenario -> $expected', ({ now, expected }) => {
    expect(canReopen(resolvedTicket, new Date(now))).toBe(expected);
  });

  it('rejects a ticket that is not resolved', () => {
    expect(canReopen({ status: TicketStatus.IN_PROGRESS }, new Date('2026-12-13T12:00:00Z'))).toBe(
      false,
    );
  });

  it('rejects a resolved ticket without a resolution date', () => {
    expect(canReopen({ status: TicketStatus.RESOLVED }, new Date('2026-12-13T12:00:00Z'))).toBe(
      false,
    );
  });
});
