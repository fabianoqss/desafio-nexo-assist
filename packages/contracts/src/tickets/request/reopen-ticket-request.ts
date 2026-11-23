import { z } from 'zod';
import { boundedText } from '../../common/bounded-text.ts';

export const ReopenTicketRequestSchema = z.object({
  message: boundedText(4000),
});

export type ReopenTicketRequest = z.infer<typeof ReopenTicketRequestSchema>;
