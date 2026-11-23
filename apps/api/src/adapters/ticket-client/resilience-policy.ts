import {
  BrokenCircuitError,
  CircuitState,
  ConsecutiveBreaker,
  ExponentialBackoff,
  TaskCancelledError,
  TimeoutStrategy,
  circuitBreaker,
  handleWhen,
  retry,
  timeout,
  wrap,
} from 'cockatiel';
import type { Logger } from 'pino';
import type { Metrics } from '../../application/ports/metrics.ts';
import {
  TicketServiceUnavailableError,
  type TicketGateway,
} from '../../application/ports/ticket-gateway.ts';

export interface ResiliencePolicyOptions {
  timeoutMs?: number;
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  failureThreshold?: number;
  halfOpenAfterMs?: number;
}

export class RetryableTicketServiceError extends Error {}

const circuitGaugeByState = {
  [CircuitState.Closed]: 0,
  [CircuitState.HalfOpen]: 1,
  [CircuitState.Open]: 2,
  [CircuitState.Isolated]: 2,
};

function isRetryable(error: unknown): boolean {
  return error instanceof RetryableTicketServiceError || error instanceof TaskCancelledError;
}

export function createResiliencePolicy(
  metrics: Metrics,
  logger: Logger,
  {
    timeoutMs = 2000,
    maxRetries = 2,
    initialDelayMs = 200,
    maxDelayMs = 2000,
    failureThreshold = 5,
    halfOpenAfterMs = 10000,
  }: ResiliencePolicyOptions = {},
) {
  const breaker = circuitBreaker(handleWhen(isRetryable), {
    breaker: new ConsecutiveBreaker(failureThreshold),
    halfOpenAfter: halfOpenAfterMs,
  });
  const attemptTimeout = timeout(timeoutMs, TimeoutStrategy.Aggressive);
  const backoff = new ExponentialBackoff({ initialDelay: initialDelayMs, maxDelay: maxDelayMs });
  const retryableWhileAvailable = handleWhen(
    (error) => isRetryable(error) && breaker.state !== CircuitState.Open,
  );

  breaker.onStateChange((state) => {
    const circuitState = circuitGaugeByState[state];
    metrics.setGauge('nexo_ticket_client_circuit_state', circuitState);
    logger.warn({ circuitState }, 'Circuito do serviço de chamados mudou de estado');
  });

  return {
    async execute<T>(operation: keyof TicketGateway, attempt: (signal: AbortSignal) => Promise<T>) {
      const retries = retry(retryableWhileAvailable, { maxAttempts: maxRetries, backoff });
      retries.onRetry(() => {
        metrics.increment('nexo_ticket_client_retries_total', { operation });
      });

      try {
        return await wrap(retries, breaker, attemptTimeout).execute(({ signal }) =>
          attempt(signal),
        );
      } catch (error) {
        if (isRetryable(error) || error instanceof BrokenCircuitError) {
          throw new TicketServiceUnavailableError();
        }
        throw error;
      }
    },
  };
}
