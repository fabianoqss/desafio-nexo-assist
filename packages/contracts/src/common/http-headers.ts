import { UserRole } from '@nexo/domain';
import { z } from 'zod';
import { LowercaseUuidSchema } from './uuid.ts';

export const SERVICE_AUTH_HEADER = 'authorization';
export const ACTOR_ID_HEADER = 'x-actor-id';
export const ACTOR_ROLE_HEADER = 'x-actor-role';
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IDEMPOTENT_REPLAYED_HEADER = 'idempotent-replayed';
export const REQUEST_ID_HEADER = 'x-request-id';

export const ActorHeadersSchema = z.object({
  [ACTOR_ID_HEADER]: LowercaseUuidSchema,
  [ACTOR_ROLE_HEADER]: z.enum(UserRole),
});

export type ActorHeaders = z.infer<typeof ActorHeadersSchema>;

export const IdempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;
