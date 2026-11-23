import { describe, expect, it } from 'vitest';
import { DuplicateSearchQuerySchema, ListTicketsQuerySchema } from '@nexo/contracts';

describe('ListTicketsQuerySchema', () => {
  it('aplica o limite padrão quando a consulta está vazia', () => {
    expect(ListTicketsQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it('converte o limite informado em string para número', () => {
    expect(ListTicketsQuerySchema.parse({ limit: '10' })).toEqual({ limit: 10 });
  });

  it.each(['0', '1.5', '500', true])('recusa o limite %s', (limit) => {
    expect(ListTicketsQuerySchema.safeParse({ limit }).success).toBe(false);
  });
});

describe('DuplicateSearchQuerySchema', () => {
  it('aceita uma categoria de VPN e remove espaços nas pontas do resumo', () => {
    expect(
      DuplicateSearchQuerySchema.parse({ category: 'NETWORK_VPN', summary: '  VPN não conecta  ' }),
    ).toEqual({
      category: 'NETWORK_VPN',
      summary: 'VPN não conecta',
    });
  });

  it.each([
    { category: 'HR' },
    { summary: '   ' },
    { summary: 'a'.repeat(501) },
    { requesterId: 'inválido' },
  ])('recusa filtros inválidos na busca por duplicatas %#', (fields) => {
    expect(
      DuplicateSearchQuerySchema.safeParse({
        category: 'NETWORK_VPN',
        summary: 'VPN não conecta',
        ...fields,
      }).success,
    ).toBe(false);
  });
});
