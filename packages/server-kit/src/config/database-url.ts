import { z } from 'zod';

export const DatabaseUrlSchema = z.url().regex(/^postgres(?:ql)?:\/\//);

export function readDatabaseUrl(source: Record<string, string | undefined>): string {
  const result = DatabaseUrlSchema.safeParse(source.DATABASE_URL);
  if (!result.success) {
    throw new Error('DATABASE_URL deve ser uma URL válida do PostgreSQL');
  }
  return result.data;
}
