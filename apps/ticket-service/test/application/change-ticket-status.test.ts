import { ErrorCode } from '@nexo/contracts';
import { TicketEventKind, TicketStatus, UserRole } from '@nexo/domain';
import { describe, expect, it } from 'vitest';
import type { Actor } from '../../src/application/access/actor.ts';
import { ForbiddenError, NotFoundError } from '../../src/application/errors/application-error.ts';
import { changeTicketStatus } from '../../src/application/use-cases/change-ticket-status.ts';
import { FixedClock } from '../support/fixed-clock.ts';
import { InMemoryTicketStore } from '../support/in-memory-ticket-store.ts';
import { buildTicket } from '../support/ticket-builder.ts';

const ana: Actor = { id: '00000000-0000-4000-8000-000000000001', role: UserRole.EMPLOYEE };
const analyst: Actor = { id: '00000000-0000-4000-8000-000000000101', role: UserRole.ANALYST };
const context = { key: 'change-status', requestHash: 'change-status-hash' };
const now = new Date('2026-12-10T12:00:00Z');

function setup(ticket = buildTicket()) {
  const store = new InMemoryTicketStore([ticket]);
  return { unitOfWork: store, tickets: store, idempotency: store, clock: new FixedClock(now) };
}

describe('changeTicketStatus', () => {
  it('resolves a ticket and records the resolution timestamp and transition', async () => {
    const ticket = buildTicket({ status: TicketStatus.IN_PROGRESS });
    const deps = setup(ticket);

    await expect(
      changeTicketStatus(deps, analyst, ticket.id, { status: TicketStatus.RESOLVED }, context),
    ).resolves.toMatchObject({
      replayed: false,
      ticket: { id: ticket.id, status: TicketStatus.RESOLVED, resolvedAt: now, lastUpdateAt: now },
    });
    expect(await deps.tickets.findById(ticket.id)).toEqual({
      ...ticket,
      status: TicketStatus.RESOLVED,
      resolvedAt: now,
      lastUpdateAt: now,
    });
    expect(deps.tickets.events).toEqual([
      {
        ticketId: ticket.id,
        kind: TicketEventKind.RESOLVED,
        actorId: analyst.id,
        payload: { from: TicketStatus.IN_PROGRESS, to: TicketStatus.RESOLVED },
        createdAt: now,
      },
    ]);
    expect(await deps.idempotency.find(analyst.id, context.key)).toMatchObject({
      operation: 'change-ticket-status',
    });
  });

  it('uses the transition event for a non-resolving status', async () => {
    const ticket = buildTicket();
    const deps = setup(ticket);

    const result = await changeTicketStatus(
      deps,
      analyst,
      ticket.id,
      { status: TicketStatus.WAITING_ANALYST },
      context,
    );

    expect(result.ticket.status).toBe(TicketStatus.WAITING_ANALYST);
    expect(result.ticket).not.toHaveProperty('resolvedAt');
    expect(deps.tickets.events).toEqual([
      {
        ticketId: ticket.id,
        kind: TicketEventKind.TRANSFERRED,
        actorId: analyst.id,
        payload: { from: TicketStatus.OPEN, to: TicketStatus.WAITING_ANALYST },
        createdAt: now,
      },
    ]);
  });

  it('rejects a transition to the same status', async () => {
    const ticket = buildTicket({ status: TicketStatus.IN_PROGRESS });
    const deps = setup(ticket);

    await expect(
      changeTicketStatus(deps, analyst, ticket.id, { status: TicketStatus.IN_PROGRESS }, context),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_STATUS_TRANSITION });
    expect(await deps.tickets.findById(ticket.id)).toEqual(ticket);
    expect(deps.tickets.events).toHaveLength(0);
  });

  it('forbids employees from changing status', async () => {
    const ticket = buildTicket();
    const deps = setup(ticket);

    await expect(
      changeTicketStatus(deps, ana, ticket.id, { status: TicketStatus.RESOLVED }, context),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns not found for an unknown ticket', async () => {
    const deps = setup();

    await expect(
      changeTicketStatus(deps, analyst, 'INC-99999', { status: TicketStatus.RESOLVED }, context),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
