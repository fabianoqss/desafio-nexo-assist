import { Category, DuplicateAction, UserRole } from '@nexo/domain';
import { describe, expect, it } from 'vitest';
import type { Actor } from '../../src/application/access/actor.ts';
import { ForbiddenError, ValidationError } from '../../src/application/errors/application-error.ts';
import { searchDuplicates } from '../../src/application/use-cases/search-duplicates.ts';
import { FixedClock } from '../support/fixed-clock.ts';
import { InMemoryTicketStore } from '../support/in-memory-ticket-store.ts';
import { buildTicket } from '../support/ticket-builder.ts';

const ana: Actor = { id: '00000000-0000-4000-8000-000000000001', role: UserRole.EMPLOYEE };
const brunoId = '00000000-0000-4000-8000-000000000002';
const analyst: Actor = { id: '00000000-0000-4000-8000-000000000101', role: UserRole.ANALYST };
const issue = { category: Category.NETWORK_VPN, summary: 'VPN não conecta' };

describe('searchDuplicates', () => {
  const anaTicket = buildTicket({
    id: 'INC-20400',
    requesterId: ana.id,
    category: issue.category,
    title: issue.summary,
  });
  const brunoTicket = buildTicket({ ...anaTicket, id: 'INC-20401', requesterId: brunoId });

  function setup() {
    return { tickets: new InMemoryTicketStore([anaTicket, brunoTicket]), clock: new FixedClock() };
  }

  it('excludes Bruno’s ticket from Ana’s search even when the titles are identical', async () => {
    const candidates = await searchDuplicates(setup(), ana, issue);

    expect(candidates).toEqual([
      {
        ticket: {
          ...anaTicket,
          dueAt: new Date('2026-12-09T16:00:00Z'),
          overdue: false,
        },
        similarity: 1,
        action: DuplicateAction.UPDATE,
      },
    ]);
  });

  it('rejects a different requester filter for an employee', async () => {
    await expect(
      searchDuplicates(setup(), ana, { ...issue, requesterId: brunoId }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('requires a requester filter for an analyst', async () => {
    await expect(searchDuplicates(setup(), analyst, issue)).rejects.toThrow(ValidationError);
  });

  it('searches the selected requester’s tickets for an analyst', async () => {
    const candidates = await searchDuplicates(setup(), analyst, { ...issue, requesterId: brunoId });

    expect(candidates.map(({ ticket }) => ticket.id)).toEqual([brunoTicket.id]);
  });

  it('considers only the requester’s 100 most recently updated tickets', async () => {
    const newerTickets = Array.from({ length: 100 }, (_, index) =>
      buildTicket({
        id: `INC-${String(20500 + index)}`,
        requesterId: ana.id,
        category: issue.category,
        title: 'Impressora sem toner',
        lastUpdateAt: new Date('2026-12-10T12:00:00Z'),
      }),
    );
    const deps = {
      tickets: new InMemoryTicketStore([anaTicket, ...newerTickets]),
      clock: new FixedClock(),
    };

    await expect(searchDuplicates(deps, ana, issue)).resolves.toEqual([]);
  });
});
