import { describe, expect, it } from 'vitest';

import {
  isHandoffOverdue,
  MAX_EMPLOYEE_MESSAGES,
  nextConversationStatus,
  shouldAgentReply,
} from '../../src/index.ts';

describe('MAX_EMPLOYEE_MESSAGES', () => {
  it('limits employee messages to 30', () => {
    expect(MAX_EMPLOYEE_MESSAGES).toBe(30);
  });
});

describe('nextConversationStatus', () => {
  it.each([
    { from: 'WITH_AGENT', action: 'HANDOFF', expected: 'WAITING_ANALYST' },
    { from: 'WITH_AGENT', action: 'CLOSE', expected: 'CLOSED' },
    { from: 'WAITING_ANALYST', action: 'ASSUME', expected: 'WITH_ANALYST' },
    { from: 'WAITING_ANALYST', action: 'CLOSE', expected: 'CLOSED' },
    { from: 'WITH_ANALYST', action: 'RETURN_TO_AGENT', expected: 'WITH_AGENT' },
    { from: 'WITH_ANALYST', action: 'CLOSE', expected: 'CLOSED' },
    { from: 'WITH_AGENT', action: 'ASSUME', expected: undefined },
    { from: 'WAITING_ANALYST', action: 'HANDOFF', expected: undefined },
    { from: 'WITH_ANALYST', action: 'ASSUME', expected: undefined },
    { from: 'CLOSED', action: 'CLOSE', expected: undefined },
  ] as const)('$from + $action -> $expected', ({ from, action, expected }) => {
    expect(nextConversationStatus(from, action)).toBe(expected);
  });
});

describe('shouldAgentReply', () => {
  it.each([
    { status: 'WITH_AGENT', expected: true },
    { status: 'WAITING_ANALYST', expected: false },
    { status: 'WITH_ANALYST', expected: false },
    { status: 'CLOSED', expected: false },
  ] as const)('$status -> $expected', ({ status, expected }) => {
    expect(shouldAgentReply(status)).toBe(expected);
  });
});

describe('isHandoffOverdue', () => {
  const handoffDueAt = new Date('2026-11-23T17:00:00Z');
  const afterDeadline = new Date('2026-11-23T17:00:01Z');

  it('flags a waiting conversation one second after the deadline', () => {
    expect(isHandoffOverdue({ status: 'WAITING_ANALYST', handoffDueAt }, afterDeadline)).toBe(true);
  });

  it('allows a waiting conversation exactly at the deadline', () => {
    expect(isHandoffOverdue({ status: 'WAITING_ANALYST', handoffDueAt }, handoffDueAt)).toBe(false);
  });

  it('ignores an expired deadline after an analyst assumes the conversation', () => {
    expect(isHandoffOverdue({ status: 'WITH_ANALYST', handoffDueAt }, afterDeadline)).toBe(false);
  });

  it('allows a waiting conversation without a deadline', () => {
    expect(isHandoffOverdue({ status: 'WAITING_ANALYST' }, afterDeadline)).toBe(false);
  });
});
