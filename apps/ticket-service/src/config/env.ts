import { z } from 'zod';
import { DatabaseUrlSchema } from './database-url.ts';

const numericInput = z.string().trim().min(1).transform(Number);
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  PORT: numericInput.pipe(z.number().int().min(1).max(65535)).default(4001),
  DATABASE_URL: DatabaseUrlSchema,
  TICKET_SERVICE_API_TOKEN: z
    .string()
    .min(32)
    .regex(/^[^\s,]+$/),
  FAILURE_RATE: numericInput.pipe(z.number().min(0).max(1)).default(0),
  EXTRA_LATENCY_MS: numericInput.pipe(z.number().min(0).max(10000)).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const names = new Set(result.error.issues.map((issue) => issue.path.join('.')));
    throw new Error(`Variáveis de ambiente inválidas: ${[...names].join(', ')}`);
  }

  return result.data;
}
