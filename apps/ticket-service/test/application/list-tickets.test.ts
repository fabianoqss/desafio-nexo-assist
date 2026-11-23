import { TicketStatus, UserRole } from '@nexo/domain';
import { describe, expect, it } from 'vitest';
import type { Actor } from '../../src/application/access/actor.ts';
import { ForbiddenError } from '../../src/application/errors/application-error.ts';
import { listTickets } from '../../src/application/use-cases/list-tickets.ts';
import { FixedClock } from '../support/fixed-clock.ts';
import { InMemoryTicketStore } from '../support/in-memory-ticket-store.ts';
import { buildTicket } from '../support/ticket-builder.ts';

const ana: Actor = { id: '00000000-0000-4000-8000-000000000001', role: UserRole.EMPLOYEE };
const brunoId = '00000000-0000-4000-8000-000000000002';
const analyst: Actor = { id: '00000000-0000-4000-8000-000000000101', role: UserRole.ANALYST };
const anaTicket = buildTicket({ id: 'INC-20400', requesterId: ana.id });
const brunoTicket = buildTicket({
  id: 'INC-20401',
  requesterId: brunoId,
  status: TicketStatus.OPEN,
  lastUpdateAt: new Date('2026-12-10T12:00:00Z'),
});

function setup() {
  return { tickets: new InMemoryTicketStore([anaTicket, brunoTicket]), clock: new FixedClock() };
}

describe('listTickets', () => {
  it('lists only tickets owned by Ana', async () => {
    const tickets = await listTickets(setup(), ana, { limit: 50 });

    expect(tickets.map(({ id }) => id)).toEqual([anaTicket.id]);
  });

  it('rejects a requester filter for Bruno when Ana lists tickets', async () => {
    await expect(listTickets(setup(), ana, { requesterId: brunoId, limit: 50 })).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('lists tickets of all requesters for an analyst without a requester filter', async () => {
    const tickets = await listTickets(setup(), analyst, { limit: 50 });

    expect(tickets.map(({ id }) => id)).toEqual([brunoTicket.id, anaTicket.id]);
  });

  it('applies the analyst requester and status filters before the limit', async () => {
    const deps = setup();
    await deps.tickets.update({
      ...anaTicket,
      lastUpdateAt: new Date('2026-12-12T12:00:00Z'),
    });
    await deps.tickets.insert(
      buildTicket({
        id: 'INC-20402',
        requesterId: brunoId,
        status: TicketStatus.IN_PROGRESS,
        lastUpdateAt: new Date('2026-12-11T12:00:00Z'),
      }),
    );
    await deps.tickets.insert(
      buildTicket({
        id: 'INC-20403',
        requesterId: brunoId,
        status: TicketStatus.OPEN,
        lastUpdateAt: new Date('2026-12-08T12:00:00Z'),
      }),
    );

    const tickets = await listTickets(deps, analyst, {
      requesterId: brunoId,
      status: TicketStatus.OPEN,
      limit: 1,
    });

    expect(tickets.map(({ id }) => id)).toEqual([brunoTicket.id]);
  });
});
