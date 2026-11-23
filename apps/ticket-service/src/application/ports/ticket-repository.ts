import type { Ticket, TicketEventKind, TicketStatus, TicketType } from '@nexo/domain';

export interface TicketListFilter {
  requesterId?: string;
  status?: TicketStatus;
  limit: number;
}

export interface NewTicketEvent {
  ticketId: string;
  kind: TicketEventKind;
  actorId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface TicketRepository {
  findById(id: string): Promise<Ticket | undefined>;
  findByIdForUpdate(id: string): Promise<Ticket | undefined>;
  list(filter: TicketListFilter): Promise<Ticket[]>;
  nextId(type: TicketType): Promise<string>;
  insert(ticket: Ticket): Promise<void>;
  update(ticket: Ticket): Promise<void>;
  appendEvent(event: NewTicketEvent): Promise<void>;
}
