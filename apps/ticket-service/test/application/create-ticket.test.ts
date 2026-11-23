import { ErrorCode, type CreateTicketRequest } from '@nexo/contracts';
import {
  Category,
  Impact,
  Priority,
  TicketEventKind,
  TicketStatus,
  TicketType,
  Urgency,
  UserRole,
} from '@nexo/domain';
import { ForbiddenError, ValidationError } from '@nexo/server-kit';
import { describe, expect, it } from 'vitest';
import type { Actor } from '../../src/application/access/actor.ts';
import { addTicketInfo } from '../../src/application/use-cases/add-ticket-info.ts';
import { createTicket } from '../../src/application/use-cases/create-ticket.ts';
import { FixedClock } from '../support/fixed-clock.ts';
import { InMemoryTicketStore } from '../support/in-memory-ticket-store.ts';

const ana: Actor = { id: '00000000-0000-4000-8000-000000000001', role: UserRole.EMPLOYEE };
const analyst: Actor = { id: '00000000-0000-4000-8000-000000000101', role: UserRole.ANALYST };
const request = {
  type: TicketType.INC,
  title: 'VPN não conecta',
  description: 'A conexão com a VPN falha ao trabalhar remotamente.',
  category: Category.NETWORK_VPN,
  impact: Impact.SELF,
  urgency: Urgency.SAME_DAY_COMMITMENT,
} satisfies CreateTicketRequest;
const context = { key: 'create-vpn-ticket', requestHash: 'create-vpn-ticket-hash' };

function setup() {
  const store = new InMemoryTicketStore();
  const clock = new FixedClock();
  return { unitOfWork: store, tickets: store, idempotency: store, clock };
}

describe('createTicket', () => {
  it('creates Ana’s high-priority open ticket and records its creation', async () => {
    const deps = setup();
    const now = deps.clock.now();

    const result = await createTicket(deps, ana, request, context);

    expect(result).toMatchObject({
      replayed: false,
      ticket: {
        ...request,
        id: 'INC-20400',
        priority: Priority.HIGH,
        status: TicketStatus.OPEN,
        requesterId: ana.id,
        createdAt: now,
        lastUpdateAt: now,
        dueAt: new Date('2026-12-09T16:00:00Z'),
        overdue: false,
      },
    });
    expect(result.ticket).not.toHaveProperty('item');
    expect(await deps.tickets.findById('INC-20400')).toMatchObject({
      priority: Priority.HIGH,
      requesterId: ana.id,
    });
    expect(deps.tickets.events).toEqual([
      {
        ticketId: 'INC-20400',
        kind: TicketEventKind.CREATED,
        actorId: ana.id,
        payload: {},
        createdAt: now,
      },
    ]);
    expect(await deps.idempotency.find(ana.id, context.key)).toEqual({
      actorId: ana.id,
      ...context,
      operation: 'create-ticket',
      ticketId: 'INC-20400',
      createdAt: now,
    });
  });

  it('copies the item when supplied', async () => {
    const deps = setup();

    const result = await createTicket(deps, ana, { ...request, item: 'VPN cliente' }, context);

    expect(result.ticket.item).toBe('VPN cliente');
  });

  it('replays the same key and hash without creating a second ticket or event', async () => {
    const deps = setup();
    const first = await createTicket(deps, ana, request, context);

    await expect(createTicket(deps, ana, request, context)).resolves.toMatchObject({
      replayed: true,
      ticket: { id: first.ticket.id },
    });
    expect(await deps.tickets.list({ limit: 10 })).toHaveLength(1);
    expect(deps.tickets.events).toHaveLength(1);
  });

  it('rejects the same key with a different hash', async () => {
    const deps = setup();
    await createTicket(deps, ana, request, context);

    await expect(
      createTicket(
        deps,
        ana,
        { ...request, title: 'VPN cai' },
        { ...context, requestHash: 'other' },
      ),
    ).rejects.toMatchObject({ code: ErrorCode.IDEMPOTENCY_KEY_REUSED });
    expect(await deps.tickets.list({ limit: 10 })).toHaveLength(1);
  });

  it('rejects key reuse for addTicketInfo even when the hash matches', async () => {
    const deps = setup();
    const { ticket } = await createTicket(deps, ana, request, context);

    await expect(
      addTicketInfo(deps, ana, ticket.id, { message: 'Mais detalhes' }, context),
    ).rejects.toMatchObject({ code: ErrorCode.IDEMPOTENCY_KEY_REUSED });
    expect(deps.tickets.events).toHaveLength(1);
  });

  it('forbids analysts from creating a ticket', async () => {
    const deps = setup();

    await expect(createTicket(deps, analyst, request, context)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(await deps.tickets.list({ limit: 10 })).toHaveLength(0);
  });

  it('rejects an invalid draft without reserving the key', async () => {
    const deps = setup();

    await expect(
      createTicket(deps, ana, { ...request, title: ' ' }, context),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await deps.tickets.list({ limit: 10 })).toHaveLength(0);
    expect(await deps.idempotency.find(ana.id, context.key)).toBeUndefined();
  });
});
