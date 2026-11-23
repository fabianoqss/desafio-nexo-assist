import {
  ACTOR_ID_HEADER,
  ACTOR_ROLE_HEADER,
  AddTicketInfoRequestSchema,
  CreateTicketRequestSchema,
  DuplicateCandidateResponseSchema,
  DuplicateSearchQuerySchema,
  IDEMPOTENCY_KEY_HEADER,
  ListTicketsQuerySchema,
  REQUEST_ID_HEADER,
  ReopenTicketRequestSchema,
  SERVICE_AUTH_HEADER,
  TicketIdSchema,
  TicketResponseSchema,
} from '@nexo/contracts';
import { tryGetContext } from 'hono/context-storage';
import type { Logger } from 'pino';
import type { ZodType } from 'zod';
import type { Metrics } from '../../application/ports/metrics.ts';
import type { TicketActor, TicketGateway } from '../../application/ports/ticket-gateway.ts';
import {
  createResiliencePolicy,
  RetryableTicketServiceError,
  type ResiliencePolicyOptions,
} from './resilience-policy.ts';
import {
  mapTicketServiceError,
  ticketServiceIntegrationError,
} from './ticket-service-error-mapper.ts';

interface HttpTicketGatewayOptions {
  baseUrl: string;
  apiToken: string;
  metrics: Metrics;
  logger: Logger;
  fetch?: typeof fetch;
  policy?: ResiliencePolicyOptions;
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

export function createHttpTicketGateway({
  baseUrl,
  apiToken,
  metrics,
  logger,
  fetch: send = globalThis.fetch,
  policy,
}: HttpTicketGatewayOptions): TicketGateway {
  const resilience = createResiliencePolicy(metrics, logger, policy);
  const serviceUrl = URL.parse(baseUrl);
  if (serviceUrl && !serviceUrl.pathname.endsWith('/')) {
    serviceUrl.pathname += '/';
  }

  function validate<T>(
    operation: keyof TicketGateway,
    schema: ZodType<T>,
    payload: unknown,
    status?: number,
  ): T {
    const result = schema.safeParse(payload);
    if (!result.success)
      throw ticketServiceIntegrationError(logger, operation, result.error, status);
    return result.data;
  }

  function urlWithQuery(path: string, query: Record<string, string | number | undefined>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    return `${path}?${params.toString()}`;
  }

  async function request<T>(
    operation: keyof TicketGateway,
    actor: TicketActor,
    path: string,
    schema: ZodType<T>,
    write?: { idempotencyKey: string; body: unknown },
  ): Promise<T> {
    if (
      !serviceUrl ||
      !['http:', 'https:'].includes(serviceUrl.protocol) ||
      serviceUrl.username ||
      serviceUrl.password
    ) {
      throw ticketServiceIntegrationError(logger, operation, new Error('URL inválida'));
    }
    const url = new URL(path, serviceUrl);

    const headerValues: Record<string, string> = {
      [SERVICE_AUTH_HEADER]: `Bearer ${apiToken}`,
      [ACTOR_ID_HEADER]: actor.id,
      [ACTOR_ROLE_HEADER]: actor.role,
    };
    const requestId = tryGetContext()?.res.headers.get(REQUEST_ID_HEADER);
    if (requestId) headerValues[REQUEST_ID_HEADER] = requestId;
    if (write) {
      headerValues[IDEMPOTENCY_KEY_HEADER] = write.idempotencyKey;
      headerValues['content-type'] = 'application/json';
    }
    let headers: Headers;
    try {
      headers = new Headers(headerValues);
    } catch {
      throw ticketServiceIntegrationError(logger, operation, new TypeError('Cabeçalho inválido'));
    }
    const init: RequestInit = {
      headers,
      redirect: 'manual',
      ...(write ? { method: 'POST', body: JSON.stringify(write.body) } : { method: 'GET' }),
    };

    const response = await resilience.execute(operation, async (signal) => {
      try {
        const response = await send(url, { ...init, signal });
        const { ok, status } = response;
        if (status !== 404 && status !== 503) {
          return { ok, status, body: await response.text() };
        }
        void response.body?.cancel().catch(() => undefined);
        if (status === 404) return { ok, status, body: undefined };
      } catch {
        throw new RetryableTicketServiceError('Falha de transporte');
      }
      throw new RetryableTicketServiceError('Serviço de chamados indisponível');
    });

    const payload = response.body === undefined ? undefined : parseJson(response.body);
    if (!response.ok) throw mapTicketServiceError(logger, operation, response.status, payload);
    return validate(operation, schema, payload, response.status);
  }

  return {
    async list(actor, query) {
      const parsed = validate('list', ListTicketsQuerySchema, query);
      return request('list', actor, urlWithQuery('tickets', parsed), TicketResponseSchema.array());
    },
    async get(actor, id) {
      const ticketId = validate('get', TicketIdSchema, id);
      return request('get', actor, `tickets/${ticketId}`, TicketResponseSchema);
    },
    async findDuplicates(actor, query) {
      const parsed = validate('findDuplicates', DuplicateSearchQuerySchema, query);
      return request(
        'findDuplicates',
        actor,
        urlWithQuery('tickets/duplicates', parsed),
        DuplicateCandidateResponseSchema.array(),
      );
    },
    async create(actor, payload, idempotencyKey) {
      return request('create', actor, 'tickets', TicketResponseSchema, {
        idempotencyKey,
        body: validate('create', CreateTicketRequestSchema, payload),
      });
    },
    async addInfo(actor, id, payload, idempotencyKey) {
      const ticketId = validate('addInfo', TicketIdSchema, id);
      return request('addInfo', actor, `tickets/${ticketId}/info`, TicketResponseSchema, {
        idempotencyKey,
        body: validate('addInfo', AddTicketInfoRequestSchema, payload),
      });
    },
    async reopen(actor, id, payload, idempotencyKey) {
      const ticketId = validate('reopen', TicketIdSchema, id);
      return request('reopen', actor, `tickets/${ticketId}/reopen`, TicketResponseSchema, {
        idempotencyKey,
        body: validate('reopen', ReopenTicketRequestSchema, payload),
      });
    },
  };
}
