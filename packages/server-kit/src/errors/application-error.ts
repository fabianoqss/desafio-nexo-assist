import { ErrorCode } from '@nexo/contracts';

type ConflictCode =
  | typeof ErrorCode.IDEMPOTENCY_KEY_REUSED
  | typeof ErrorCode.TICKET_RESOLVED
  | typeof ErrorCode.REOPEN_NOT_ALLOWED
  | typeof ErrorCode.INVALID_STATUS_TRANSITION
  | typeof ErrorCode.MESSAGE_LIMIT_REACHED
  | typeof ErrorCode.CONVERSATION_STATE_CONFLICT
  | typeof ErrorCode.DRAFT_NOT_PENDING;

type UnauthorizedCode = typeof ErrorCode.UNAUTHORIZED | typeof ErrorCode.INVALID_CREDENTIALS;

export class ApplicationError<Code extends ErrorCode = ErrorCode> extends Error {
  readonly code: Code;

  constructor(code: Code, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message: string) {
    super(ErrorCode.NOT_FOUND, message);
  }
}

export class ForbiddenError extends ApplicationError {
  constructor(message: string) {
    super(ErrorCode.FORBIDDEN, message);
  }
}

export class ConflictError extends ApplicationError<ConflictCode> {}

export class ValidationError extends ApplicationError {
  constructor(message: string) {
    super(ErrorCode.VALIDATION_FAILED, message);
  }
}

export class UnauthorizedError extends ApplicationError<UnauthorizedCode> {
  constructor(code: UnauthorizedCode) {
    super(
      code,
      code === ErrorCode.INVALID_CREDENTIALS ? 'Credenciais inválidas' : 'Não autorizado',
    );
  }
}

export class RateLimitedError extends ApplicationError<typeof ErrorCode.RATE_LIMITED> {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(ErrorCode.RATE_LIMITED, 'Limite de requisições excedido');
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
