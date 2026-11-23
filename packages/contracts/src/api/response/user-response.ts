import { UserRole } from '@nexo/domain';
import { z } from 'zod';
import { LowercaseUuidSchema } from '../../common/uuid.ts';

export const UserResponseSchema = z.object({
  id: LowercaseUuidSchema,
  name: z.string(),
  email: z.email(),
  department: z.string(),
  role: z.enum(UserRole),
});

export type UserResponse = z.infer<typeof UserResponseSchema>;
