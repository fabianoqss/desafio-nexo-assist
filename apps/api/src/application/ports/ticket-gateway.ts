import {
  ErrorCode,
  type AddTicketInfoRequest,
  type CreateTicketRequest,
  type DuplicateCandidateResponse,
  type DuplicateSearchQuery,
  type ListTicketsQuery,
  type ReopenTicketRequest,
  type TicketResponse,
} from '@nexo/contracts';
import type { UserRole } from '@nexo/domain';
import { ApplicationError } from '@nexo/server-kit';

export interface TicketActor {
  id: string;
  role: UserRole;
}

export interface TicketGateway {
  list(actor: TicketActor, query: ListTicketsQuery): Promise<TicketResponse[]>;
  get(actor: TicketActor, id: string): Promise<TicketResponse>;
  findDuplicates(
    actor: TicketActor,
    query: DuplicateSearchQuery,
  ): Promise<DuplicateCandidateResponse[]>;
  create(
    actor: TicketActor,
    request: CreateTicketRequest,
    idempotencyKey: string,
  ): Promise<TicketResponse>;
  addInfo(
    actor: TicketActor,
    id: string,
    request: AddTicketInfoRequest,
    idempotencyKey: string,
  ): Promise<TicketResponse>;
  reopen(
    actor: TicketActor,
    id: string,
    request: ReopenTicketRequest,
    idempotencyKey: string,
  ): Promise<TicketResponse>;
}

export class TicketServiceUnavailableError extends ApplicationError<
  typeof ErrorCode.TICKET_SERVICE_UNAVAILABLE
> {
  constructor() {
    super(ErrorCode.TICKET_SERVICE_UNAVAILABLE, 'Serviço de chamados indisponível');
  }
}
