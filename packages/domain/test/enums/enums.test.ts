import { describe, expect, it } from 'vitest';

import {
  Category,
  ConversationAction,
  ConversationStatus,
  DraftKind,
  DraftStatus,
  HandoffReason,
  MessageAuthor,
  Priority,
  TicketEventKind,
  TicketStatus,
  UserRole,
} from '../../src/index.ts';

describe('Category', () => {
  it('has exactly the six Annex A categories', () => {
    expect(Object.values(Category)).toEqual([
      'ACCESS',
      'NETWORK_VPN',
      'HARDWARE',
      'SOFTWARE',
      'EMAIL',
      'OTHER',
    ]);
  });
});

describe('ConversationAction', () => {
  it('has exactly the four actions', () => {
    expect(ConversationAction).toEqual({
      HANDOFF: 'HANDOFF',
      ASSUME: 'ASSUME',
      RETURN_TO_AGENT: 'RETURN_TO_AGENT',
      CLOSE: 'CLOSE',
    });
  });
});

describe('ConversationStatus', () => {
  it('has exactly the four statuses', () => {
    expect(ConversationStatus).toEqual({
      WITH_AGENT: 'WITH_AGENT',
      WAITING_ANALYST: 'WAITING_ANALYST',
      WITH_ANALYST: 'WITH_ANALYST',
      CLOSED: 'CLOSED',
    });
  });
});

describe('DraftKind', () => {
  it('has exactly the three draft kinds', () => {
    expect(DraftKind).toEqual({ CREATE: 'CREATE', UPDATE: 'UPDATE', REOPEN: 'REOPEN' });
  });
});

describe('DraftStatus', () => {
  it('has exactly the three statuses', () => {
    expect(DraftStatus).toEqual({
      PENDING: 'PENDING',
      CONFIRMED: 'CONFIRMED',
      CANCELLED: 'CANCELLED',
    });
  });
});

describe('HandoffReason', () => {
  it('has exactly the five reasons', () => {
    expect(HandoffReason).toEqual({
      EMPLOYEE_REQUEST: 'EMPLOYEE_REQUEST',
      CRITICAL_CASE: 'CRITICAL_CASE',
      OVERDUE_TICKET: 'OVERDUE_TICKET',
      LOW_CONFIDENCE: 'LOW_CONFIDENCE',
      MESSAGE_LIMIT: 'MESSAGE_LIMIT',
    });
  });
});

describe('MessageAuthor', () => {
  it('has exactly the four authors', () => {
    expect(MessageAuthor).toEqual({
      EMPLOYEE: 'EMPLOYEE',
      AGENT: 'AGENT',
      ANALYST: 'ANALYST',
      SYSTEM: 'SYSTEM',
    });
  });
});

describe('Priority', () => {
  it('has exactly the four priorities', () => {
    expect(Object.values(Priority)).toEqual(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
  });
});

describe('TicketStatus', () => {
  it('has exactly the five statuses', () => {
    expect(Object.values(TicketStatus)).toEqual([
      'OPEN',
      'IN_PROGRESS',
      'WAITING_ANALYST',
      'APPROVED',
      'RESOLVED',
    ]);
  });
});

describe('UserRole', () => {
  it('has exactly the two roles', () => {
    expect(Object.values(UserRole)).toEqual(['EMPLOYEE', 'ANALYST']);
  });
});

describe('TicketEventKind', () => {
  it('has exactly the seven event kinds', () => {
    expect(Object.values(TicketEventKind)).toEqual([
      'CREATED',
      'INFO_ADDED',
      'REOPENED',
      'TRANSFERRED',
      'ASSUMED',
      'UPDATED',
      'RESOLVED',
    ]);
  });
});
