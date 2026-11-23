import { Priority, UserRole } from '@nexo/domain';
import { describe, expect, it } from 'vitest';
import type { Actor } from '../../src/application/access/actor.ts';
import { NotFoundError } from '../../src/application/errors/application-error.ts';
import { getTicket } from '../../src/application/use-cases/get-ticket.ts';
import { FixedClock } from '../support/fixed-clock.ts';
import { InMemoryTicketStore } from '../support/in-memory-ticket-store.ts';
import { buildTicket } from '../support/ticket-builder.ts';

const ana: Actor = { id: '00000000-0000-4000-8000-000000000001', role: UserRole.EMPLOYEE };
const brunoId = '00000000-0000-4000-8000-000000000002';
const analyst: Actor = { id: '00000000-0000-4000-8000-000000000101', role: UserRole.ANALYST };

describe('getTicket', () => {
  const brunoTicket = buildTicket({ requesterId: brunoId });

  it('returns indistinguishable not-found errors for Bruno’s ticket and a missing id when Ana reads', async () => {
    const deps = { tickets: new InMemoryTicketStore([brunoTicket]), clock: new FixedClock() };
    const [other, missing] = await Promise.all([
      getTicket(deps, ana, brunoTicket.id).catch((error: unknown) => error),
      getTicket(deps, ana, 'INC-99999').catch((error: unknown) => error),
    ]);

    if (!(other instanceof NotFoundError) || !(missing instanceof NotFoundError)) {
      throw new Error('Expected both lookups to fail with NotFoundError');
    }
    expect(other.constructor).toBe(missing.constructor);
    expect(other.message).toBe(missing.message);
  });

  it('returns Bruno’s ticket for an analyst', async () => {
    const deps = { tickets: new InMemoryTicketStore([brunoTicket]), clock: new FixedClock() };

    await expect(getTicket(deps, analyst, brunoTicket.id)).resolves.toMatchObject(brunoTicket);
  });

  it('returns the deadline from lastUpdateAt and marks an overdue MEDIUM ticket', async () => {
    const ticket = buildTicket({
      requesterId: ana.id,
      priority: Priority.MEDIUM,
      lastUpdateAt: new Date('2026-12-09T17:20:00Z'),
    });
    const clock = new FixedClock();
    clock.set(new Date('2026-12-14T17:21:00Z'));

    const view = await getTicket(
      { tickets: new InMemoryTicketStore([ticket]), clock },
      ana,
      ticket.id,
    );

    expect(view).toEqual({
      ...ticket,
      dueAt: new Date('2026-12-14T17:20:00Z'),
      overdue: true,
    });
  });
});
