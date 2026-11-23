import { z } from 'zod';

export const AddTicketInfoRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});

export type AddTicketInfoRequest = z.infer<typeof AddTicketInfoRequestSchema>;
