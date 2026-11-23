import { z } from 'zod';

export const ReopenTicketRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});

export type ReopenTicketRequest = z.infer<typeof ReopenTicketRequestSchema>;
