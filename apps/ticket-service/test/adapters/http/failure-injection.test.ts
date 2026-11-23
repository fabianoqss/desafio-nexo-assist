import {
  ACTOR_ID_HEADER,
  ACTOR_ROLE_HEADER,
  ErrorCode,
  ErrorResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
  SERVICE_AUTH_HEADER,
} from '@nexo/contracts';
import { UserRole } from '@nexo/domain';
import { createLogger } from '@nexo/server-kit';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/adapters/http/app.ts';
import type { FailureInjectionOptions } from '../../../src/adapters/http/middleware/failure-injection.ts';
import { FixedClock } from '../../support/fixed-clock.ts';
import { InMemoryTicketStore } from '../../support/in-memory-ticket-store.ts';

const apiToken = 'token-de-integracao-do-ticket-service';
const actorId = '00000000-0000-4000-8000-000000000001';
const actorHeaders = {
  [ACTOR_ID_HEADER]: actorId,
  [ACTOR_ROLE_HEADER]: UserRole.EMPLOYEE,
};
const authenticatedHeaders = { ...actorHeaders, [SERVICE_AUTH_HEADER]: `Bearer ${apiToken}` };

function setup(failureInjection: FailureInjectionOptions) {
  const store = new InMemoryTicketStore();
  const app = createApp({
    logger: createLogger('silent'),
    checkReadiness: () => Promise.resolve(true),
    apiToken,
    tickets: store,
    unitOfWork: store,
    idempotency: store,
    clock: new FixedClock(),
    failureInjection,
  });

  return { app, store };
}

describe('injeção de falhas nas rotas de chamados', () => {
  it('retorna 503 SERVICE_UNAVAILABLE quando random é 0.1 e a taxa é 0.5', async () => {
    const { app } = setup({ rate: 0.5, extraLatencyMs: 0, random: () => 0.1 });

    const response = await app.request('/tickets', { headers: authenticatedHeaders });

    expect(response.status).toBe(503);
    expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe(
      ErrorCode.SERVICE_UNAVAILABLE,
    );
  });

  it('deixa passar quando random é 0.1 e a taxa é 0.05', async () => {
    const { app } = setup({ rate: 0.05, extraLatencyMs: 0, random: () => 0.1 });

    const response = await app.request('/tickets', { headers: authenticatedHeaders });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('mantém o store vazio após uma falha injetada em POST /tickets', async () => {
    const { app, store } = setup({ rate: 1, extraLatencyMs: 0, random: () => 0.1 });
    const idempotencyKey = 'create-ticket';

    const response = await app.request('/tickets', {
      method: 'POST',
      headers: {
        ...authenticatedHeaders,
        [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'INC',
        title: 'VPN não conecta',
        description: 'VPN não conecta ao trabalhar remotamente.',
        category: 'NETWORK_VPN',
        impact: 'SELF',
        urgency: 'BLOCKED',
      }),
    });

    expect(response.status).toBe(503);
    expect(await store.list({ limit: 10 })).toEqual([]);
    expect(store.events).toEqual([]);
    expect(await store.find(actorId, idempotencyKey)).toBeUndefined();
  });

  it.each(['/health', '/ready'])('preserva %s mesmo com taxa 1 e latência ativa', async (path) => {
    const sleep = vi.fn(() => Promise.resolve());
    const random = vi.fn(() => 0.1);
    const { app } = setup({ rate: 1, extraLatencyMs: 300, random, sleep });

    const response = await app.request(path);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(sleep).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
  });

  it('aguarda sleep(300) uma vez antes de decidir se falha', async () => {
    let latencyElapsed = false;
    const sleep = vi.fn(async () => {
      await Promise.resolve();
      latencyElapsed = true;
    });
    const { app } = setup({
      rate: 0.5,
      extraLatencyMs: 300,
      random: () => (latencyElapsed ? 0.1 : 0.9),
      sleep,
    });

    const response = await app.request('/tickets', { headers: authenticatedHeaders });

    expect(sleep).toHaveBeenCalledExactlyOnceWith(300);
    expect(response.status).toBe(503);
  });

  it('retorna 401 sem token mesmo com taxa 1', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const random = vi.fn(() => 0.1);
    const { app } = setup({ rate: 1, extraLatencyMs: 300, random, sleep });

    const response = await app.request('/tickets', { headers: actorHeaders });

    expect(response.status).toBe(401);
    expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe(
      ErrorCode.UNAUTHORIZED,
    );
    expect(sleep).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
  });

  it('deixa passar sem chamar random ou sleep quando ambos os valores são zero', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const random = vi.fn(() => 0.1);
    const { app } = setup({ rate: 0, extraLatencyMs: 0, random, sleep });

    const response = await app.request('/tickets', { headers: authenticatedHeaders });

    expect(response.status).toBe(200);
    expect(sleep).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
  });
});
