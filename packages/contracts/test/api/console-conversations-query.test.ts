import { ConsoleConversationsQuerySchema } from '@nexo/contracts';
import { describe, expect, it } from 'vitest';

describe('ConsoleConversationsQuerySchema', () => {
  it('usa ALL quando a consulta omite o filtro', () => {
    expect(ConsoleConversationsQuerySchema.parse({})).toEqual({ filter: 'ALL' });
  });

  it.each(['ALL', 'FOR_YOU', 'WITH_AGENT', 'MINE'])('aceita o filtro %s', (filter) => {
    expect(ConsoleConversationsQuerySchema.parse({ filter })).toEqual({ filter });
  });

  it('recusa filtro desconhecido', () => {
    expect(ConsoleConversationsQuerySchema.safeParse({ filter: 'CLOSED' }).success).toBe(false);
  });
});
