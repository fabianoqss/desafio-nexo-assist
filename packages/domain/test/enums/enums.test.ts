import { describe, expect, it } from 'vitest';

import { Category, Priority, TicketStatus } from '../../src/index.ts';

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
