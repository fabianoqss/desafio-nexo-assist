import {
  AddTicketInfoRequestSchema,
  ChangeTicketStatusRequestSchema,
  CreateTicketRequestSchema,
  DuplicateSearchQuerySchema,
  ErrorCode,
  IDEMPOTENT_REPLAYED_HEADER,
  ListTicketsQuerySchema,
  ReopenTicketRequestSchema,
  TicketIdSchema,
  type DuplicateCandidateResponse,
} from '@nexo/contracts';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  ApplicationError,
  ValidationError,
} from '../../../application/errors/application-error.ts';
import type {
  WriteDependencies,
  WriteResult,
} from '../../../application/idempotency/with-idempotency.ts';
import { addTicketInfo } from '../../../application/use-cases/add-ticket-info.ts';
import { changeTicketStatus } from '../../../application/use-cases/change-ticket-status.ts';
import { createTicket } from '../../../application/use-cases/create-ticket.ts';
import { getTicket } from '../../../application/use-cases/get-ticket.ts';
import { listTickets } from '../../../application/use-cases/list-tickets.ts';
import { reopenTicket } from '../../../application/use-cases/reopen-ticket.ts';
import { searchDuplicates } from '../../../application/use-cases/search-duplicates.ts';
import { toTicketResponse } from '../mappers/ticket-response-mapper.ts';
import { actorContext, type ActorVariables } from '../middleware/actor-context.ts';
import {
  idempotencyContext,
  type IdempotencyVariables,
} from '../middleware/idempotency-context.ts';
import { serviceAuth } from '../middleware/service-auth.ts';

interface TicketRouteEnv {
  Variables: ActorVariables & IdempotencyVariables;
}

interface TicketRouteDependencies extends WriteDependencies {
  apiToken: string;
}

const jsonDecoder = new TextDecoder('utf-8', { fatal: true });

function parseJsonBody(context: Context<TicketRouteEnv>): unknown {
  try {
    return JSON.parse(jsonDecoder.decode(context.get('rawBody'))) as unknown;
  } catch {
    throw new ValidationError('Dados inválidos');
  }
}

function writeResponse(context: Context<TicketRouteEnv>, result: WriteResult, status: 200 | 201) {
  if (result.replayed) {
    context.header(IDEMPOTENT_REPLAYED_HEADER, 'true');
  }

  return context.json(toTicketResponse(result.ticket), status);
}

export function ticketRoutes(deps: TicketRouteDependencies) {
  const routes = new Hono<TicketRouteEnv>();
  routes.use(
    '/tickets/*',
    serviceAuth(deps.apiToken),
    actorContext,
    bodyLimit({
      maxSize: 64 * 1024,
      onError: () => {
        throw new ApplicationError(ErrorCode.PAYLOAD_TOO_LARGE, 'Corpo da requisição muito grande');
      },
    }),
  );
  routes.on('POST', '/tickets/*', idempotencyContext);

  routes.get('/tickets', async (context) => {
    const query = ListTicketsQuerySchema.parse(context.req.query());
    const tickets = await listTickets(deps, context.get('actor'), query);
    return context.json(tickets.map(toTicketResponse));
  });

  routes.get('/tickets/duplicates', async (context) => {
    const query = DuplicateSearchQuerySchema.parse(context.req.query());
    const candidates = await searchDuplicates(deps, context.get('actor'), query);
    const response: DuplicateCandidateResponse[] = candidates.map(({ ticket, ...candidate }) => ({
      ...candidate,
      ticket: toTicketResponse(ticket),
    }));
    return context.json(response);
  });

  routes.get('/tickets/:id', async (context) => {
    const id = TicketIdSchema.parse(context.req.param('id'));
    const ticket = await getTicket(deps, context.get('actor'), id);
    return context.json(toTicketResponse(ticket));
  });

  routes.post('/tickets', async (context) => {
    const request = CreateTicketRequestSchema.parse(parseJsonBody(context));
    const result = await createTicket(
      deps,
      context.get('actor'),
      request,
      context.get('idempotency'),
    );
    return writeResponse(context, result, 201);
  });

  routes.post('/tickets/:id/info', async (context) => {
    const id = TicketIdSchema.parse(context.req.param('id'));
    const request = AddTicketInfoRequestSchema.parse(parseJsonBody(context));
    const result = await addTicketInfo(
      deps,
      context.get('actor'),
      id,
      request,
      context.get('idempotency'),
    );
    return writeResponse(context, result, 200);
  });

  routes.post('/tickets/:id/reopen', async (context) => {
    const id = TicketIdSchema.parse(context.req.param('id'));
    const request = ReopenTicketRequestSchema.parse(parseJsonBody(context));
    const result = await reopenTicket(
      deps,
      context.get('actor'),
      id,
      request,
      context.get('idempotency'),
    );
    return writeResponse(context, result, 200);
  });

  routes.post('/tickets/:id/status', async (context) => {
    const id = TicketIdSchema.parse(context.req.param('id'));
    const request = ChangeTicketStatusRequestSchema.parse(parseJsonBody(context));
    const result = await changeTicketStatus(
      deps,
      context.get('actor'),
      id,
      request,
      context.get('idempotency'),
    );
    return writeResponse(context, result, 200);
  });

  return routes;
}
