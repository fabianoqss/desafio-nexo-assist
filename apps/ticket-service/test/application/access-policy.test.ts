import { UserRole } from '@nexo/domain';
import { describe, expect, it } from 'vitest';
import {
  assertCanRead,
  resolveRequesterScope,
} from '../../src/application/access/access-policy.ts';
import type { Actor } from '../../src/application/access/actor.ts';
import { ForbiddenError, NotFoundError } from '../../src/application/errors/application-error.ts';
import { buildTicket } from '../support/ticket-builder.ts';

const ana: Actor = { id: '00000000-0000-4000-8000-000000000001', role: UserRole.EMPLOYEE };
const brunoId = '00000000-0000-4000-8000-000000000002';
const analyst: Actor = { id: '00000000-0000-4000-8000-000000000101', role: UserRole.ANALYST };

describe('resolveRequesterScope', () => {
  it('uses the employee id when the requester filter is absent or matches', () => {
    expect(resolveRequesterScope(ana)).toBe(ana.id);
    expect(resolveRequesterScope(ana, ana.id)).toBe(ana.id);
  });

  it('rejects a different requester filter for an employee', () => {
    expect(() => resolveRequesterScope(ana, brunoId)).toThrow(ForbiddenError);
  });

  it('uses the optional requester filter for an analyst', () => {
    expect(resolveRequesterScope(analyst)).toBeUndefined();
    expect(resolveRequesterScope(analyst, brunoId)).toBe(brunoId);
  });
});

describe('assertCanRead', () => {
  it('allows an employee to read their own ticket', () => {
    const ticket = buildTicket({ requesterId: ana.id });

    expect(assertCanRead(ana, ticket)).toBe(ticket);
  });

  it('rejects an unknown ticket for an analyst', () => {
    expect(() => assertCanRead(analyst, undefined)).toThrow(NotFoundError);
  });
});
