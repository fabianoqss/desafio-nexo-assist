import { describe, expect, it } from 'vitest';

import { addBusinessHours } from '../../src/index.ts';

describe('addBusinessHours', () => {
  it.each([
    {
      scenario: 'stays within the same day',
      from: '2026-12-09T12:43:00Z',
      expected: '2026-12-09T16:43:00Z',
    },
    {
      scenario: 'ends exactly at closing time',
      from: '2026-12-09T17:00:00Z',
      expected: '2026-12-09T21:00:00Z',
    },
    {
      scenario: 'crosses the night',
      from: '2026-12-09T19:00:00Z',
      expected: '2026-12-10T13:00:00Z',
    },
    {
      scenario: 'starts exactly at closing time',
      from: '2026-12-09T21:00:00Z',
      expected: '2026-12-10T15:00:00Z',
    },
    {
      scenario: 'starts before opening time',
      from: '2026-12-09T10:00:00Z',
      expected: '2026-12-09T15:00:00Z',
    },
    {
      scenario: 'crosses the weekend',
      from: '2026-12-11T20:00:00Z',
      expected: '2026-12-14T14:00:00Z',
    },
    {
      scenario: 'starts on a Saturday',
      from: '2026-12-12T13:00:00Z',
      expected: '2026-12-14T15:00:00Z',
    },
  ])('$scenario: 4 business hours from $from -> $expected', ({ from, expected }) => {
    expect(addBusinessHours(new Date(from), 4).toISOString()).toBe(
      new Date(expected).toISOString(),
    );
  });

  it('does not mutate the start date', () => {
    const from = new Date('2026-12-11T20:00:00Z');

    addBusinessHours(from, 4);

    expect(from.toISOString()).toBe('2026-12-11T20:00:00.000Z');
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s hours', (hours) => {
    expect(() => addBusinessHours(new Date('2026-12-09T12:00:00Z'), hours)).toThrow(RangeError);
  });
});
