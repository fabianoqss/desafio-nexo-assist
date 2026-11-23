import { HandoffReason } from '@nexo/domain';
import { z } from 'zod';

export const HandoffRequestSchema = z.object({
  reason: z.enum([HandoffReason.EMPLOYEE_REQUEST, HandoffReason.MESSAGE_LIMIT]),
});

export type HandoffRequest = z.infer<typeof HandoffRequestSchema>;
