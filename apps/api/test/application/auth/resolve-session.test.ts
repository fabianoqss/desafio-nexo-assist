import { createHash } from 'node:crypto';
import { UserRole } from '@nexo/domain';
import { describe, expect, it } from 'vitest';
import { logout } from '../../../src/application/use-cases/auth/logout.ts';
import { resolveSession } from '../../../src/application/use-cases/auth/resolve-session.ts';
import { FixedClock } from '../../support/fixed-clock.ts';
import { InMemoryApiStore } from '../../support/in-memory-api-store.ts';

const user = {
  id: 'a71f4460-2302-42ba-b0f8-2ac2767e3ff7',
  name: 'Ana',
  email: 'ana@example.com',
  department: 'Financeiro',
  role: UserRole.EMPLOYEE,
};
const token = Buffer.alloc(32, 5).toString('base64url');
const expiresAt = new Date('2026-12-10T00:00:00Z');

async function setup(userId = user.id) {
  const store = new InMemoryApiStore([user]);
  const clock = new FixedClock();
  await store.sessions.insert({
    tokenHash: createHash('sha256').update(token).digest('hex'),
    userId,
    createdAt: clock.now(),
    expiresAt,
  });
  return { users: store.users, sessions: store.sessions, clock };
}

describe('resolução de sessão', () => {
  it('retorna a identidade e a função atuais do usuário da sessão', async () => {
    const deps = await setup();
    await deps.users.upsertMany([{ ...user, role: UserRole.ANALYST }]);

    expect(await resolveSession(deps, token)).toEqual({
      id: user.id,
      name: user.name,
      role: UserRole.ANALYST,
    });
  });

  it.each([undefined, '', 'token-desconhecido'])('rejeita o token %j', async (invalidToken) => {
    const deps = await setup();

    await expect(resolveSession(deps, invalidToken)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejeita o token a partir do instante de expiração', async () => {
    const deps = await setup();
    deps.clock.set(expiresAt);

    await expect(resolveSession(deps, token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejeita uma sessão sem usuário correspondente', async () => {
    const deps = await setup('a9fa0c3e-a07a-4c5c-9ad9-c3a9d616075b');

    await expect(resolveSession(deps, token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('revoga uma sessão e permite repetir o logout', async () => {
    const deps = await setup();

    await logout(deps, undefined);
    await expect(resolveSession(deps, token)).resolves.toMatchObject({ id: user.id });
    await logout(deps, token);
    await logout(deps, token);

    await expect(resolveSession(deps, token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
