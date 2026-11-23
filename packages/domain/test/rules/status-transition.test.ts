import { describe, expect, it } from 'vitest';

import {
  canChangeStatus,
  statusChangeEventKind,
  TicketEventKind,
  TicketStatus,
} from '../../src/index.ts';

describe('canChangeStatus', () => {
  it.each([
    { from: TicketStatus.OPEN, to: TicketStatus.IN_PROGRESS, expected: true },
    { from: TicketStatus.IN_PROGRESS, to: TicketStatus.RESOLVED, expected: true },
    { from: TicketStatus.WAITING_ANALYST, to: TicketStatus.APPROVED, expected: true },
    { from: TicketStatus.IN_PROGRESS, to: TicketStatus.IN_PROGRESS, expected: false },
    { from: TicketStatus.RESOLVED, to: TicketStatus.IN_PROGRESS, expected: false },
    { from: TicketStatus.IN_PROGRESS, to: TicketStatus.OPEN, expected: false },
  ])('$from -> $to is $expected', ({ from, to, expected }) => {
    expect(canChangeStatus(from, to)).toBe(expected);
  });
});

describe('statusChangeEventKind', () => {
  it.each([
    { to: TicketStatus.WAITING_ANALYST, expected: TicketEventKind.TRANSFERRED },
    { to: TicketStatus.IN_PROGRESS, expected: TicketEventKind.ASSUMED },
    { to: TicketStatus.APPROVED, expected: TicketEventKind.UPDATED },
    { to: TicketStatus.RESOLVED, expected: TicketEventKind.RESOLVED },
  ])('$to records $expected', ({ to, expected }) => {
    expect(statusChangeEventKind(to)).toBe(expected);
  });
});
