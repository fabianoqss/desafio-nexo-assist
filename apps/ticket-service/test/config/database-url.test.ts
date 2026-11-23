import { describe, expect, it } from 'vitest';
import { readDatabaseUrl } from '../../src/config/database-url.ts';

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
