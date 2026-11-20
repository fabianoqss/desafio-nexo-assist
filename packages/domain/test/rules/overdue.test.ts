import { describe, expect, it } from 'vitest';

import { isOverdue, Priority, TicketStatus } from '../../src/index.ts';

const mediumTicketInProgress = {
  priority: Priority.MEDIUM,
  status: TicketStatus.IN_PROGRESS,
  lastUpdateAt: new Date('2026-12-09T17:20:00Z'),
};

describe('isOverdue', () => {
  it.each([
    { scenario: 'one minute after the deadline', now: '2026-12-14T17:21:00Z', expected: true },
    { scenario: 'one minute before the deadline', now: '2026-12-14T17:19:00Z', expected: false },
    { scenario: 'exactly at the deadline', now: '2026-12-14T17:20:00Z', expected: false },
  ])('$scenario -> $expected', ({ now, expected }) => {
    expect(isOverdue(mediumTicketInProgress, new Date(now))).toBe(expected);
  });

  it('never flags a resolved ticket, however late it is', () => {
    const resolvedTicket = { ...mediumTicketInProgress, status: TicketStatus.RESOLVED };

    expect(isOverdue(resolvedTicket, new Date('2026-12-20T00:00:00Z'))).toBe(false);
  });
});
