import type { Ticket, TicketType } from '@nexo/domain';
import { and, eq, sql } from 'drizzle-orm';
import type {
  NewTicketEvent,
  TicketListFilter,
  TicketRepository,
} from '../../application/ports/ticket-repository.ts';
import type { DatabaseExecutor } from './database.ts';
import { ticketEvents, ticketNumberSequenceNames, tickets } from './schema.ts';

function toTicket(row: typeof tickets.$inferSelect): Ticket {
  const { item, resolvedAt, ...ticket } = row;
  return {
    ...ticket,
    ...(item === null ? {} : { item }),
    ...(resolvedAt === null ? {} : { resolvedAt }),
  };
}

class DrizzleTicketRepository implements TicketRepository {
  readonly #db: DatabaseExecutor;

  constructor(db: DatabaseExecutor) {
    this.#db = db;
  }

  private selectById(id: string, requesterId?: string) {
    return this.#db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.id, id),
          requesterId === undefined ? undefined : eq(tickets.requesterId, requesterId),
        ),
      )
      .limit(1);
  }

  async findById(id: string): Promise<Ticket | undefined> {
    const [row] = await this.selectById(id);
    return row && toTicket(row);
  }

  async findByIdForUpdate(id: string, requesterId?: string): Promise<Ticket | undefined> {
    const [row] = await this.selectById(id, requesterId).for('update');
    return row && toTicket(row);
  }

  async list({ requesterId, status, limit }: TicketListFilter): Promise<Ticket[]> {
    const rows = await this.#db
      .select()
      .from(tickets)
      .where(
        and(
          requesterId === undefined ? undefined : eq(tickets.requesterId, requesterId),
          status === undefined ? undefined : eq(tickets.status, status),
        ),
      )
      .orderBy(sql`${tickets.lastUpdateAt} desc nulls last`)
      .limit(limit);
    return rows.map(toTicket);
  }

  async nextId(type: TicketType): Promise<string> {
    const sequence = `public.${ticketNumberSequenceNames[type]}`;
    const {
      rows: [row],
    } = await this.#db.execute<{ ticketNumber: string }>(
      sql`select nextval(${sequence}::regclass)::text as "ticketNumber"`,
    );
    if (!row) {
      throw new Error('A sequência não retornou um número de chamado');
    }
    return `${type}-${row.ticketNumber}`;
  }

  async insert(ticket: Ticket): Promise<void> {
    await this.#db.insert(tickets).values(ticket);
  }

  async update(ticket: Ticket): Promise<void> {
    const { id, item, resolvedAt, ...values } = ticket;
    await this.#db
      .update(tickets)
      .set({ ...values, item: item ?? null, resolvedAt: resolvedAt ?? null })
      .where(eq(tickets.id, id));
  }

  async appendEvent(event: NewTicketEvent): Promise<void> {
    await this.#db.insert(ticketEvents).values(event);
  }
}

export function createDrizzleTicketRepository(db: DatabaseExecutor): TicketRepository {
  return new DrizzleTicketRepository(db);
}
