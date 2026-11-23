import { DatabaseUrlSchema } from '@nexo/server-kit';
import { z } from 'zod';

const numericInput = z.string().regex(/^\d+$/).transform(Number);
const httpUrl = z
  .url()
  .regex(/^https?:\/\//)
  .refine((value) => {
    const url = URL.parse(value);
    return url !== null && url.username === '' && url.password === '';
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  PORT: numericInput.pipe(z.number().int().min(1).max(65535)).default(4000),
  DATABASE_URL: DatabaseUrlSchema,
  TICKET_SERVICE_URL: httpUrl,
  TICKET_SERVICE_API_TOKEN: z.string().regex(/^[\x21-\x2b\x2d-\x7e]{32,}$/),
  WEB_ORIGIN: httpUrl.refine((value) => URL.parse(value)?.origin === value),
  SESSION_TTL_HOURS: numericInput.pipe(z.number().int().min(1).max(72)).default(12),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default(false),
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
