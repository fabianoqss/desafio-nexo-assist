import { SEED_USERS } from '@nexo/seed-data';
import { describe, expect, it } from 'vitest';

describe('SEED_USERS', () => {
  it('atribui um endereço de e-mail único e em minúsculas a cada usuário', () => {
    const emails = SEED_USERS.map(({ email }) => email);

    expect(emails).toEqual([
      'ana.souza@nexo.com.br',
      'bruno.lima@nexo.com.br',
      'carla.mendes@nexo.com.br',
      'diego.rocha@nexo.com.br',
      'elisa.prado@nexo.com.br',
      'felipe.nunes@nexo.com.br',
      'gabriela.torres@nexo.com.br',
      'henrique.alves@nexo.com.br',
    ]);
    expect(emails).toEqual(emails.map((email) => email.toLowerCase()));
    expect(new Set(emails).size).toBe(SEED_USERS.length);
  });
});
