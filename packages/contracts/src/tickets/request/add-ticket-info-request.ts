import { z } from 'zod';
import { boundedText } from '../../common/bounded-text.ts';

export const AddTicketInfoRequestSchema = z.object({
  message: boundedText(4000),
});

export type AddTicketInfoRequest = z.infer<typeof AddTicketInfoRequestSchema>;
