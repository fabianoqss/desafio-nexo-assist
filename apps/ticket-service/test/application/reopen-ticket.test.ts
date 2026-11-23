import { ErrorCode } from '@nexo/contracts';
import { TicketEventKind, TicketStatus, UserRole } from '@nexo/domain';
import { describe, expect, it } from 'vitest';
import type { Actor } from '../../src/application/access/actor.ts';
import { ForbiddenError, NotFoundError } from '../../src/application/errors/application-error.ts';
import { reopenTicket } from '../../src/application/use-cases/reopen-ticket.ts';
import { FixedClock } from '../support/fixed-clock.ts';
import { InMemoryTicketStore } from '../support/in-memory-ticket-store.ts';
import { buildTicket } from '../support/ticket-builder.ts';

const ana: Actor = { id: '00000000-0000-4000-8000-000000000001', role: UserRole.EMPLOYEE };
const bruno: Actor = { id: '00000000-0000-4000-8000-000000000002', role: UserRole.EMPLOYEE };
const analyst: Actor = { id: '00000000-0000-4000-8000-000000000101', role: UserRole.ANALYST };
const context = { key: 'reopen', requestHash: 'reopen-hash' };
const request = { message: 'O problema voltou.' };
const dayThree = new Date('2026-12-12T12:00:00Z');
const dayEight = new Date('2026-12-17T12:00:00Z');
const ticket = buildTicket({
  status: TicketStatus.RESOLVED,
  resolvedAt: new Date('2026-12-09T12:00:00Z'),
});

function setup(now: Date) {
  const store = new InMemoryTicketStore([ticket]);
  return { unitOfWork: store, tickets: store, idempotency: store, clock: new FixedClock(now) };
}

describe('reopenTicket', () => {
  it('reopens Ana’s ticket three days after resolution and clears resolvedAt', async () => {
    const deps = setup(dayThree);

    const result = await reopenTicket(deps, ana, ticket.id, request, context);

    expect(result).toMatchObject({
      replayed: false,
      ticket: { id: ticket.id, status: TicketStatus.OPEN, lastUpdateAt: dayThree },
    });
    expect(result.ticket).not.toHaveProperty('resolvedAt');
    expect(await deps.tickets.findById(ticket.id)).not.toHaveProperty('resolvedAt');
    expect(deps.tickets.events).toEqual([
      {
        ticketId: ticket.id,
        kind: TicketEventKind.REOPENED,
        actorId: ana.id,
        payload: request,
        createdAt: dayThree,
      },
    ]);
  });

  it('rejects reopening eight days after resolution', async () => {
    const deps = setup(dayEight);

    await expect(reopenTicket(deps, ana, ticket.id, request, context)).rejects.toMatchObject({
      code: ErrorCode.REOPEN_NOT_ALLOWED,
    });
    expect(await deps.tickets.findById(ticket.id)).toEqual(ticket);
    expect(deps.tickets.events).toHaveLength(0);
  });

  it('hides Ana’s ticket when Bruno tries to reopen it', async () => {
    const deps = setup(dayThree);

    await expect(reopenTicket(deps, bruno, ticket.id, request, context)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('forbids analysts from reopening a ticket', async () => {
    const deps = setup(dayThree);

    await expect(reopenTicket(deps, analyst, ticket.id, request, context)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('rejects reopening an open ticket without a resolution timestamp', async () => {
    const openTicket = buildTicket();
    const store = new InMemoryTicketStore([openTicket]);
    const deps = {
      unitOfWork: store,
      tickets: store,
      idempotency: store,
      clock: new FixedClock(dayThree),
    };

    await expect(reopenTicket(deps, ana, openTicket.id, request, context)).rejects.toMatchObject({
      code: ErrorCode.REOPEN_NOT_ALLOWED,
    });
  });
});
