export { ErrorCode, ErrorResponseSchema, type ErrorResponse } from './common/error-response.ts';
export {
  ACTOR_ID_HEADER,
  ACTOR_ROLE_HEADER,
  ActorHeadersSchema,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
  IdempotencyKeySchema,
  REQUEST_ID_HEADER,
  SERVICE_AUTH_HEADER,
  type ActorHeaders,
  type IdempotencyKey,
} from './common/http-headers.ts';
export {
  AddTicketInfoRequestSchema,
  type AddTicketInfoRequest,
} from './tickets/request/add-ticket-info-request.ts';
export {
  ChangeTicketStatusRequestSchema,
  type ChangeTicketStatusRequest,
} from './tickets/request/change-ticket-status-request.ts';
export {
  CreateTicketRequestSchema,
  type CreateTicketRequest,
} from './tickets/request/create-ticket-request.ts';
export {
  DuplicateSearchQuerySchema,
  type DuplicateSearchQuery,
} from './tickets/request/duplicate-search-query.ts';
export {
  ListTicketsQuerySchema,
  type ListTicketsQuery,
} from './tickets/request/list-tickets-query.ts';
export {
  ReopenTicketRequestSchema,
  type ReopenTicketRequest,
} from './tickets/request/reopen-ticket-request.ts';
export {
  DuplicateCandidateResponseSchema,
  type DuplicateCandidateResponse,
} from './tickets/response/duplicate-candidate-response.ts';
export { TicketResponseSchema, type TicketResponse } from './tickets/response/ticket-response.ts';
export { TicketIdSchema, type TicketId } from './tickets/ticket-id.ts';
