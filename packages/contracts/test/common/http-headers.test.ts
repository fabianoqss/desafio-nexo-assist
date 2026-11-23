import { describe, expect, it } from 'vitest';
import { ActorHeadersSchema, ErrorResponseSchema, IdempotencyKeySchema } from '@nexo/contracts';

const headers = {
  'x-actor-id': '26409ee7-73de-4218-9b0e-2b71ba1e12dd',
  'x-actor-role': 'EMPLOYEE',
};

describe('ActorHeadersSchema', () => {
  it('aceita os cabeçalhos de um funcionário', () => {
    expect(ActorHeadersSchema.parse(headers)).toEqual(headers);
  });

  it('recusa um identificador que não é UUID', () => {
    expect(ActorHeadersSchema.safeParse({ ...headers, 'x-actor-id': '123' }).success).toBe(false);
  });

  it('recusa o papel ADMIN', () => {
    expect(ActorHeadersSchema.safeParse({ ...headers, 'x-actor-role': 'ADMIN' }).success).toBe(
      false,
    );
  });
});

describe('IdempotencyKeySchema', () => {
  it.each(['Abc-12_3', 'a'.repeat(128)])('aceita uma chave no limite de tamanho %#', (key) => {
    expect(IdempotencyKeySchema.parse(key)).toBe(key);
  });

  it.each(['a'.repeat(7), 'a'.repeat(129), 'inválida!'])('recusa uma chave inválida %#', (key) => {
    expect(IdempotencyKeySchema.safeParse(key).success).toBe(false);
  });
});

describe('ErrorResponseSchema', () => {
  it('aceita um código de erro do contrato', () => {
    const response = { error: { code: 'VALIDATION_FAILED', message: 'Corpo inválido' } };
    expect(ErrorResponseSchema.parse(response)).toEqual(response);
  });

  it('recusa um código de erro desconhecido', () => {
    expect(
      ErrorResponseSchema.safeParse({ error: { code: 'INVALID', message: 'Corpo inválido' } })
        .success,
    ).toBe(false);
  });
});
