import { createLogger } from '@nexo/server-kit';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpTicketGateway } from '../../../src/adapters/ticket-client/http-ticket-gateway.ts';
import { createResiliencePolicy } from '../../../src/adapters/ticket-client/resilience-policy.ts';
import { TicketServiceUnavailableError } from '../../../src/application/ports/ticket-gateway.ts';
import { createFakeTicketService } from '../../support/fake-ticket-service.ts';
import { RecordingMetrics } from '../../support/recording-metrics.ts';

const actor = { id: '6ba7b810-9dad-41d1-80b4-00c04fd430c8', role: 'EMPLOYEE' } as const;
const baseUrl = 'http://ticket-service.test';
const unavailable = { status: 503, body: {} };

function circuitGauge(metrics: RecordingMetrics) {
  return metrics.calls.flatMap((call) =>
    call.method === 'setGauge' && call.name === 'nexo_ticket_client_circuit_state'
      ? [call.value]
      : [],
  );
}

describe('política de resiliência do serviço de chamados', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('aplica o timeout padrão de 2000 ms a cada uma das três tentativas', async () => {
    const metrics = new RecordingMetrics();
    const policy = createResiliencePolicy(metrics, createLogger('silent'));
    const elapsed: number[] = [];
    const assertion = expect(
      policy.execute('get', (signal) => {
        const started = Date.now();
        signal.addEventListener('abort', () => elapsed.push(Date.now() - started), { once: true });
        return Promise.withResolvers<never>().promise;
      }),
    ).rejects.toBeInstanceOf(TicketServiceUnavailableError);

    await vi.advanceTimersByTimeAsync(1999);
    expect(elapsed).toEqual([]);
    await vi.runAllTimersAsync();

    await assertion;
    expect(elapsed).toEqual([2000, 2000, 2000]);
    expect(metrics.calls.filter(({ method }) => method === 'increment')).toHaveLength(2);
  });

  it('abre na quinta tentativa seguida e volta a aceitar chamadas após 10000 ms', async () => {
    const fake = createFakeTicketService();
    const metrics = new RecordingMetrics();
    const logs: string[] = [];
    const logger = pino({}, { write: (line) => logs.push(line) });
    const gateway = createHttpTicketGateway({
      baseUrl,
      apiToken: 'token-de-teste',
      metrics,
      logger,
      fetch: fake.fetch,
    });
    fake.program(
      'GET',
      '/tickets',
      unavailable,
      unavailable,
      unavailable,
      unavailable,
      unavailable,
      { status: 200, body: [] },
    );
    const list = () => gateway.list(actor, { limit: 1 });

    const firstFailure = expect(list()).rejects.toBeInstanceOf(TicketServiceUnavailableError);
    await vi.runAllTimersAsync();
    await firstFailure;
    expect(fake.requests).toHaveLength(3);
    expect(circuitGauge(metrics)).not.toContain(2);

    const secondFailure = expect(list()).rejects.toBeInstanceOf(TicketServiceUnavailableError);
    await vi.runAllTimersAsync();
    await secondFailure;
    expect(fake.requests).toHaveLength(5);
    expect(circuitGauge(metrics).at(-1)).toBe(2);

    const started = performance.now();
    await expect(list()).rejects.toBeInstanceOf(TicketServiceUnavailableError);
    expect(performance.now() - started).toBeLessThan(50);
    expect(fake.requests).toHaveLength(5);

    await vi.advanceTimersByTimeAsync(10_000);
    await expect(list()).resolves.toEqual([]);
    expect(fake.requests).toHaveLength(6);
    expect(circuitGauge(metrics).slice(-3)).toEqual([2, 1, 0]);
    expect(logs.map((line): unknown => JSON.parse(line))).toEqual([
      expect.objectContaining({ level: 40 }),
      expect.objectContaining({ level: 40 }),
      expect.objectContaining({ level: 40 }),
    ]);
  });

  it('reinicia a contagem de falhas consecutivas quando o serviço responde', async () => {
    const fake = createFakeTicketService();
    const metrics = new RecordingMetrics();
    const gateway = createHttpTicketGateway({
      baseUrl,
      apiToken: 'token-de-teste',
      metrics,
      logger: createLogger('silent'),
      fetch: fake.fetch,
      policy: { maxRetries: 0, failureThreshold: 2 },
    });
    fake.program('GET', '/tickets', unavailable, { status: 200, body: [] }, unavailable, {
      status: 200,
      body: [],
    });
    const list = () => gateway.list(actor, { limit: 1 });

    await expect(list()).rejects.toBeInstanceOf(TicketServiceUnavailableError);
    await expect(list()).resolves.toEqual([]);
    await expect(list()).rejects.toBeInstanceOf(TicketServiceUnavailableError);
    await expect(list()).resolves.toEqual([]);
    expect(fake.requests).toHaveLength(4);
    expect(circuitGauge(metrics)).not.toContain(2);
  });
});
