import { ErrorCode } from '@nexo/contracts';
import { TicketEventKind, TicketStatus, UserRole } from '@nexo/domain';
import { describe, expect, it } from 'vitest';
import type { Actor } from '../../src/application/access/actor.ts';
import { NotFoundError } from '../../src/application/errors/application-error.ts';
import { addTicketInfo } from '../../src/application/use-cases/add-ticket-info.ts';
import { FixedClock } from '../support/fixed-clock.ts';
import { InMemoryTicketStore } from '../support/in-memory-ticket-store.ts';
import { buildTicket } from '../support/ticket-builder.ts';

const ana: Actor = { id: '00000000-0000-4000-8000-000000000001', role: UserRole.EMPLOYEE };
const bruno: Actor = { id: '00000000-0000-4000-8000-000000000002', role: UserRole.EMPLOYEE };
const analyst: Actor = { id: '00000000-0000-4000-8000-000000000101', role: UserRole.ANALYST };
const context = { key: 'add-info', requestHash: 'add-info-hash' };
const request = { message: 'A falha começou depois da atualização.' };
const clock = new FixedClock(new Date('2026-12-10T12:00:00Z'));

describe('addTicketInfo', () => {
  it.each([ana, analyst])(
    'updates an open ticket and records the message for $role',
    async (actor) => {
      const ticket = buildTicket();
      const store = new InMemoryTicketStore([ticket]);
      const deps = { unitOfWork: store, tickets: store, idempotency: store, clock };
      const now = clock.now();

      await expect(addTicketInfo(deps, actor, ticket.id, request, context)).resolves.toMatchObject({
        replayed: false,
        ticket: { id: ticket.id, status: TicketStatus.OPEN, lastUpdateAt: now },
      });
      expect(await store.findById(ticket.id)).toEqual({ ...ticket, lastUpdateAt: now });
      expect(store.events).toEqual([
        {
          ticketId: ticket.id,
          kind: TicketEventKind.INFO_ADDED,
          actorId: actor.id,
          payload: request,
          createdAt: now,
        },
      ]);
    },
  );

  it('rejects additional information on a resolved ticket', async () => {
    const ticket = buildTicket({
      status: TicketStatus.RESOLVED,
      resolvedAt: new Date('2026-12-09T12:00:00Z'),
    });
    const store = new InMemoryTicketStore([ticket]);
    const deps = { unitOfWork: store, tickets: store, idempotency: store, clock };

    await expect(addTicketInfo(deps, ana, ticket.id, request, context)).rejects.toMatchObject({
      code: ErrorCode.TICKET_RESOLVED,
    });
    expect(await store.findById(ticket.id)).toEqual(ticket);
    expect(store.events).toHaveLength(0);
  });

  it('hides Ana’s ticket when Bruno tries to add information', async () => {
    const ticket = buildTicket();
    const store = new InMemoryTicketStore([ticket]);
    const deps = { unitOfWork: store, tickets: store, idempotency: store, clock };

    await expect(addTicketInfo(deps, bruno, ticket.id, request, context)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
