import { ErrorCode, ErrorResponseSchema } from '@nexo/contracts';
import {
  ApplicationError,
  ConflictError,
  HTTP_STATUS_BY_ERROR_CODE,
  NotFoundError,
  describeError,
} from '@nexo/server-kit';
import type { Logger } from 'pino';
import type { TicketGateway } from '../../application/ports/ticket-gateway.ts';

function isConflictCode(code: ErrorCode): code is ConstructorParameters<typeof ConflictError>[0] {
  return HTTP_STATUS_BY_ERROR_CODE[code] === 409;
}

export function ticketServiceIntegrationError(
  logger: Logger,
  operation: keyof TicketGateway,
  error: Error,
  status?: number,
): ApplicationError {
  logger.error(
    { ...describeError(error), operation, status },
    'Falha na integração com o serviço de chamados',
  );
  return new ApplicationError(ErrorCode.INTERNAL_ERROR, 'Erro interno do servidor');
}

export function mapTicketServiceError(
  logger: Logger,
  operation: keyof TicketGateway,
  status: number,
  body: unknown,
): ApplicationError {
  if (status === 404) return new NotFoundError('Chamado não encontrado');

  const parsed = ErrorResponseSchema.safeParse(body);
  if (status === 409 && parsed.success && isConflictCode(parsed.data.error.code)) {
    return new ConflictError(parsed.data.error.code, 'Conflito ao processar o chamado');
  }

  const error = parsed.success
    ? new ApplicationError(parsed.data.error.code, 'Resposta inesperada do serviço de chamados')
    : parsed.error;
  return ticketServiceIntegrationError(logger, operation, error, status);
}
