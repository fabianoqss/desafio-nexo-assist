import { z } from 'zod';

export const LoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(1).max(200),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
