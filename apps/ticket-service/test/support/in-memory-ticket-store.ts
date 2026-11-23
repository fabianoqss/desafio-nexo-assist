import type { Ticket, TicketType } from '@nexo/domain';
import {
  IdempotencyKeyTakenError,
  type IdempotencyRecord,
  type IdempotencyRepository,
} from '../../src/application/ports/idempotency-repository.ts';
import type {
  NewTicketEvent,
  TicketListFilter,
  TicketRepository,
} from '../../src/application/ports/ticket-repository.ts';
import type { TicketStore, UnitOfWork } from '../../src/application/ports/unit-of-work.ts';

interface StoreState {
  tickets: Map<string, Ticket>;
  idempotency: Map<string, IdempotencyRecord>;
  events: NewTicketEvent[];
  nextNumbers: Record<TicketType, number>;
}

export class InMemoryTicketStore implements TicketRepository, IdempotencyRepository, UnitOfWork {
  #state: StoreState;
  #pending = Promise.resolve();

  constructor(tickets: readonly Ticket[] = []) {
    this.#state = {
      tickets: new Map(tickets.map((ticket) => [ticket.id, structuredClone(ticket)])),
      idempotency: new Map(),
      events: [],
      nextNumbers: { INC: 20400, REQ: 10500 },
    };
  }

  get events(): readonly NewTicketEvent[] {
    return structuredClone(this.#state.events);
  }

  findById(id: string): Promise<Ticket | undefined> {
    return Promise.resolve(structuredClone(this.#state.tickets.get(id)));
  }

  async findByIdForUpdate(id: string, requesterId?: string): Promise<Ticket | undefined> {
    const ticket = await this.findById(id);
    return requesterId === undefined || ticket?.requesterId === requesterId ? ticket : undefined;
  }

  list({ requesterId, status, limit }: TicketListFilter): Promise<Ticket[]> {
    const tickets = [...this.#state.tickets.values()]
      .filter((ticket) => requesterId === undefined || ticket.requesterId === requesterId)
      .filter((ticket) => status === undefined || ticket.status === status)
      .sort((first, second) => second.lastUpdateAt.getTime() - first.lastUpdateAt.getTime())
      .slice(0, limit);

    return Promise.resolve(structuredClone(tickets));
  }

  nextId(type: TicketType): Promise<string> {
    return this.#enqueue(() => {
      const number = this.#state.nextNumbers[type];
      this.#state.nextNumbers[type] += 1;
      return `${type}-${String(number)}`;
    });
  }

  insert(ticket: Ticket): Promise<void> {
    return this.#enqueue(() => {
      if (this.#state.tickets.has(ticket.id)) {
        throw new Error(`Chamado já existente: ${ticket.id}`);
      }
      this.#state.tickets.set(ticket.id, structuredClone(ticket));
    });
  }

  update(ticket: Ticket): Promise<void> {
    return this.#enqueue(() => {
      if (this.#state.tickets.has(ticket.id)) {
        this.#state.tickets.set(ticket.id, structuredClone(ticket));
      }
    });
  }

  appendEvent(event: NewTicketEvent): Promise<void> {
    return this.#enqueue(() => {
      this.#state.events.push(structuredClone(event));
    });
  }

  find(actorId: string, key: string): Promise<IdempotencyRecord | undefined> {
    const record = this.#state.idempotency.get(JSON.stringify([actorId, key]));
    return Promise.resolve(structuredClone(record));
  }

  save(record: IdempotencyRecord): Promise<void> {
    return this.#enqueue(() => {
      const key = JSON.stringify([record.actorId, record.key]);
      if (this.#state.idempotency.has(key)) {
        throw new IdempotencyKeyTakenError('Chave de idempotência já utilizada');
      }
      this.#state.idempotency.set(key, structuredClone(record));
    });
  }

  run<T>(work: (store: TicketStore) => Promise<T>): Promise<T> {
    return this.#enqueue(async () => {
      const transaction = new InMemoryTicketStore();
      transaction.#state = structuredClone(this.#state);
      const result = await work({ tickets: transaction, idempotency: transaction });
      this.#state = structuredClone(transaction.#state);
      return result;
    });
  }

  #enqueue<T>(work: () => T | Promise<T>): Promise<T> {
    const result = this.#pending.then(work);
    this.#pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
