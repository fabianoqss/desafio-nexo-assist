import { LoginRequestSchema } from '@nexo/contracts';
import { describe, expect, it } from 'vitest';

describe('LoginRequestSchema', () => {
  it('normaliza espaços e maiúsculas no e-mail', () => {
    expect(
      LoginRequestSchema.parse({ email: ' Ana.Souza@Nexo.com.br ', password: 'senha' }),
    ).toEqual({ email: 'ana.souza@nexo.com.br', password: 'senha' });
  });

  it.each(['', 'a'.repeat(201)])('recusa senha fora do limite %#', (password) => {
    expect(LoginRequestSchema.safeParse({ email: 'ana.souza@nexo.com.br', password }).success).toBe(
      false,
    );
  });

  it('preserva uma senha composta por espaços', () => {
    expect(
      LoginRequestSchema.parse({ email: 'ana.souza@nexo.com.br', password: '   ' }).password,
    ).toBe('   ');
  });

  it.each(['ana.souza', 'a'.repeat(243) + '@nexo.com.br'])(
    'recusa e-mail inválido ou longo demais %#',
    (email) => {
      expect(LoginRequestSchema.safeParse({ email, password: 'senha' }).success).toBe(false);
    },
  );
});
