import { ErrorCode, type CreateTicketRequest } from '@nexo/contracts';
import {
  Category,
  Impact,
  TicketEventKind,
  TicketStatus,
  TicketType,
  Urgency,
  UserRole,
} from '@nexo/domain';
import { describe, expect, it, vi } from 'vitest';
import type { Actor } from '../../src/application/access/actor.ts';
import { NotFoundError } from '../../src/application/errors/application-error.ts';
import { withIdempotency } from '../../src/application/idempotency/with-idempotency.ts';
import {
  IdempotencyKeyTakenError,
  type IdempotencyRecord,
} from '../../src/application/ports/idempotency-repository.ts';
import type { TicketStore } from '../../src/application/ports/unit-of-work.ts';
import { createTicket } from '../../src/application/use-cases/create-ticket.ts';
import { FixedClock } from '../support/fixed-clock.ts';
import { InMemoryTicketStore } from '../support/in-memory-ticket-store.ts';
import { buildTicket } from '../support/ticket-builder.ts';

const ana: Actor = { id: '00000000-0000-4000-8000-000000000001', role: UserRole.EMPLOYEE };
const bruno: Actor = { id: '00000000-0000-4000-8000-000000000002', role: UserRole.EMPLOYEE };
const context = { key: 'create-ticket', requestHash: 'create-ticket-hash' };
const operation = 'create-ticket';
const clock = new FixedClock();
const winner = buildTicket({ id: 'INC-20401' });
const winnerRecord: IdempotencyRecord = {
  actorId: ana.id,
  ...context,
  operation,
  ticketId: winner.id,
  createdAt: clock.now(),
};
const request = {
  type: TicketType.INC,
  title: 'VPN não conecta',
  description: 'A conexão com a VPN falha ao trabalhar remotamente.',
  category: Category.NETWORK_VPN,
  impact: Impact.SELF,
  urgency: Urgency.SAME_DAY_COMMITMENT,
} satisfies CreateTicketRequest;

function unexpectedWork(): Promise<never> {
  return Promise.reject(new Error('Work should not run on replay'));
}

function setupRace(record?: IdempotencyRecord) {
  const store = new InMemoryTicketStore();
  const collision = new IdempotencyKeyTakenError('Chave ocupada pela requisição concorrente');
  const unitOfWork = {
    async run<T>(work: (transaction: TicketStore) => Promise<T>): Promise<T> {
      try {
        return await store.run((transaction) => {
          vi.spyOn(transaction.idempotency, 'save').mockRejectedValueOnce(collision);
          return work(transaction);
        });
      } catch (error) {
        if (error === collision && record !== undefined) {
          await store.run(async ({ tickets, idempotency }) => {
            await tickets.insert(winner);
            await tickets.appendEvent({
              ticketId: winner.id,
              kind: TicketEventKind.CREATED,
              actorId: ana.id,
              payload: {},
              createdAt: clock.now(),
            });
            await idempotency.save(record);
          });
        }
        throw error;
      }
    },
  };
  const find = vi.spyOn(store, 'find');

  return { deps: { unitOfWork, tickets: store, idempotency: store, clock }, collision, find };
}

describe('withIdempotency', () => {
  it('returns the current ticket and recalculates its view on replay', async () => {
    const ticket = buildTicket();
    const store = new InMemoryTicketStore([ticket]);
    const replayClock = new FixedClock(new Date('2026-12-11T12:00:00Z'));
    const deps = { unitOfWork: store, tickets: store, idempotency: store, clock: replayClock };
    await store.save({ ...winnerRecord, ticketId: ticket.id });
    await store.update({ ...ticket, status: TicketStatus.IN_PROGRESS });

    await expect(
      withIdempotency(deps, ana, operation, context, unexpectedWork),
    ).resolves.toMatchObject({
      replayed: true,
      ticket: { id: ticket.id, status: TicketStatus.IN_PROGRESS, overdue: true },
    });
  });

  it('checks that the actor can still read the recorded ticket', async () => {
    const store = new InMemoryTicketStore([winner]);
    const deps = { unitOfWork: store, tickets: store, idempotency: store, clock };
    await store.save({ ...winnerRecord, actorId: bruno.id });

    await expect(
      withIdempotency(deps, bruno, operation, context, unexpectedWork),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('scopes keys to the actor', async () => {
    const store = new InMemoryTicketStore([winner]);
    const deps = { unitOfWork: store, tickets: store, idempotency: store, clock };
    await store.save(winnerRecord);

    await expect(createTicket(deps, bruno, request, context)).resolves.toMatchObject({
      replayed: false,
      ticket: { id: 'INC-20400', requesterId: bruno.id },
    });
    expect(await store.list({ limit: 10 })).toHaveLength(2);
  });

  it('replays the winning request after rolling back the losing ticket and event', async () => {
    const { deps, find } = setupRace(winnerRecord);

    await expect(createTicket(deps, ana, request, context)).resolves.toMatchObject({
      replayed: true,
      ticket: { id: winner.id },
    });
    expect(find).toHaveBeenCalledExactlyOnceWith(ana.id, context.key);
    expect(await deps.tickets.list({ limit: 10 })).toEqual([winner]);
    expect(deps.tickets.events).toMatchObject([
      { ticketId: winner.id, kind: TicketEventKind.CREATED },
    ]);
  });

  it.each([
    { ...winnerRecord, operation: 'add-ticket-info' },
    { ...winnerRecord, requestHash: 'other-hash' },
  ])(
    'rejects a competing record with operation $operation and hash $requestHash',
    async (record) => {
      const { deps, find } = setupRace(record);

      await expect(createTicket(deps, ana, request, context)).rejects.toMatchObject({
        code: ErrorCode.IDEMPOTENCY_KEY_REUSED,
      });
      expect(find).toHaveBeenCalledExactlyOnceWith(ana.id, context.key);
      expect(await deps.tickets.list({ limit: 10 })).toEqual([winner]);
    },
  );

  it('rethrows the original save error when no winning record is visible', async () => {
    const { deps, collision, find } = setupRace();

    await expect(createTicket(deps, ana, request, context)).rejects.toBe(collision);
    expect(find).toHaveBeenCalledExactlyOnceWith(ana.id, context.key);
    expect(await deps.tickets.list({ limit: 10 })).toHaveLength(0);
    expect(deps.tickets.events).toHaveLength(0);
  });

  it('propagates a failure from the work when no matching record exists', async () => {
    const store = new InMemoryTicketStore();
    const failure = new Error('Falha no trabalho');
    const deps = { unitOfWork: store, tickets: store, idempotency: store, clock };

    await expect(
      withIdempotency(deps, ana, operation, context, () => Promise.reject(failure)),
    ).rejects.toBe(failure);
  });

  it('replays when the work fails because a concurrent twin request already committed', async () => {
    const store = new InMemoryTicketStore([winner]);
    const conflict = new Error('Estado já alterado pela requisição gêmea');
    const unitOfWork = {
      async run<T>(work: (transaction: TicketStore) => Promise<T>): Promise<T> {
        try {
          return await store.run(work);
        } catch (error) {
          await store.save(winnerRecord);
          throw error;
        }
      },
    };
    const deps = { unitOfWork, tickets: store, idempotency: store, clock };

    await expect(
      withIdempotency(deps, ana, operation, context, () => Promise.reject(conflict)),
    ).resolves.toMatchObject({ replayed: true, ticket: { id: winner.id } });
  });
});
