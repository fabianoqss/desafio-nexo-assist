import { createHash } from 'node:crypto';
import { UserRole } from '@nexo/domain';
import { SEED_USERS } from '@nexo/seed-data';
import { describe, expect, it, vi } from 'vitest';
import { hashSessionToken } from '../../../src/application/auth/session-token.ts';
import { login } from '../../../src/application/use-cases/auth/login.ts';
import { FixedClock } from '../../support/fixed-clock.ts';
import { InMemoryApiStore } from '../../support/in-memory-api-store.ts';
import { RecordingMetrics } from '../../support/recording-metrics.ts';

const email = 'ana.souza@nexo.com.br';
const nonSeedUser = {
  id: 'a71f4460-2302-42ba-b0f8-2ac2767e3ff7',
  name: 'Usuário cadastrado',
  email: 'cadastrado@example.com',
  department: 'TI',
  role: UserRole.ANALYST,
};

function setup() {
  const store = new InMemoryApiStore([...SEED_USERS, nonSeedUser]);
  const clock = new FixedClock();
  const metrics = new RecordingMetrics();
  return {
    users: store.users,
    sessions: store.sessions,
    unitOfWork: store,
    clock,
    metrics,
    sessionTtlHours: 2,
  };
}

describe('login', () => {
  it('gera tokens distintos de 32 bytes e persiste somente o hash com expiração absoluta', async () => {
    const deps = setup();
    const run = vi.spyOn(deps.unitOfWork, 'run');
    const credentials = { email, password: 'uma senha não vazia' };
    const first = await login(deps, credentials);
    const second = await login(deps, credentials);

    expect(run).toHaveBeenCalledTimes(2);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(first.token, 'base64url')).toHaveLength(32);
    expect(second.token).not.toBe(first.token);
    expect(first.user.email).toBe(email);
    expect(first.expiresAt).toEqual(new Date('2026-12-09T14:00:00Z'));

    const now = deps.clock.now();
    const tokenHash = createHash('sha256').update(first.token).digest('hex');
    expect(await deps.sessions.findValid(first.token, now)).toBeUndefined();
    expect(await deps.sessions.findValid(tokenHash, now)).toEqual({
      tokenHash,
      userId: first.user.id,
      createdAt: now,
      expiresAt: first.expiresAt,
    });
    expect(deps.metrics.calls).toEqual([
      { method: 'increment', name: 'nexo_logins_total', labels: { result: 'success' } },
      { method: 'increment', name: 'nexo_logins_total', labels: { result: 'success' } },
    ]);
  });

  it('autentica um usuário cadastrado fora do seed', async () => {
    const deps = setup();

    await expect(
      login(deps, { email: nonSeedUser.email, password: 'senha' }),
    ).resolves.toMatchObject({ user: nonSeedUser });
  });

  it('consulta o usuário, revoga o token anterior, remove expirados e grava na mesma transação', async () => {
    const deps = setup();
    const credentials = { email, password: 'senha' };
    const beforeExpiry = deps.clock.now();
    const expired = await login(deps, credentials);
    deps.clock.set(new Date('2026-12-09T13:00:00Z'));
    const previous = await login(deps, credentials);
    deps.clock.set(expired.expiresAt);

    const outerLookup = vi.spyOn(deps.users, 'findByEmail');
    const run = deps.unitOfWork.run.bind(deps.unitOfWork);
    const transaction = vi.spyOn(deps.unitOfWork, 'run').mockImplementationOnce((work) =>
      run(async ({ users, sessions, ...store }) => {
        const find = vi.spyOn(users, 'findByEmail');
        const revoke = vi.spyOn(sessions, 'delete');
        const cleanup = vi.spyOn(sessions, 'deleteExpired');
        const insert = vi.spyOn(sessions, 'insert');

        const result = await work({ users, sessions, ...store });

        expect(find).toHaveBeenCalledWith(email);
        expect(revoke).toHaveBeenCalledWith(hashSessionToken(previous.token));
        expect(cleanup).toHaveBeenCalledWith(expired.expiresAt);
        expect(find).toHaveBeenCalledBefore(revoke);
        expect(revoke).toHaveBeenCalledBefore(cleanup);
        expect(cleanup).toHaveBeenCalledBefore(insert);
        return result;
      }),
    );

    const current = await login(deps, credentials, previous.token);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(outerLookup).not.toHaveBeenCalled();
    expect(
      await deps.sessions.findValid(hashSessionToken(previous.token), deps.clock.now()),
    ).toBeUndefined();
    expect(
      await deps.sessions.findValid(hashSessionToken(expired.token), beforeExpiry),
    ).toBeUndefined();
    expect(
      await deps.sessions.findValid(hashSessionToken(current.token), deps.clock.now()),
    ).toBeDefined();
  });

  it.each([
    { email: 'desconhecido@example.com', password: 'senha' },
    { email, password: '' },
  ])('registra falha e retorna o mesmo erro para credenciais inválidas', async (credentials) => {
    const deps = setup();

    await expect(login(deps, credentials)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Credenciais inválidas',
    });
    expect(deps.metrics.calls).toEqual([
      { method: 'increment', name: 'nexo_logins_total', labels: { result: 'failure' } },
    ]);
  });
});
