import { describe, expect, it } from 'vitest';
import { DatabaseUrlSchema, readDatabaseUrl } from '@nexo/server-kit';

describe('readDatabaseUrl', () => {
  it.each(['postgres://user@localhost/db', 'postgresql://user@localhost/db'])(
    'aceita a URL %s',
    (url) => {
      expect(readDatabaseUrl({ DATABASE_URL: url })).toBe(url);
    },
  );

  it.each([
    undefined,
    'https://user:senha-ficticia@localhost/db',
    'postgresql://user:senha-ficticia@localhost:abc/db',
  ])('identifica DATABASE_URL inválida sem vazar credenciais %#', (url) => {
    const read = () => readDatabaseUrl({ DATABASE_URL: url });

    expect(read).toThrow(/^DATABASE_URL\b/);
    expect(read).not.toThrow(/senha-ficticia/);
  });
});

describe('DatabaseUrlSchema', () => {
  it('aceita o esquema postgresql na validação da configuração', () => {
    const url = 'postgresql://x@localhost/x';

    expect(DatabaseUrlSchema.parse(url)).toBe(url);
  });

  it('rejeita uma URL com outro protocolo', () => {
    expect(DatabaseUrlSchema.safeParse('https://user:secret@localhost/x').success).toBe(false);
  });

  it('exige a URL do banco', () => {
    expect(DatabaseUrlSchema.safeParse(undefined).success).toBe(false);
  });
});
