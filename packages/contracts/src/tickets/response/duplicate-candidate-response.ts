import { DuplicateAction } from '@nexo/domain';
import { z } from 'zod';
import { TicketResponseSchema } from './ticket-response.ts';

export const DuplicateCandidateResponseSchema = z.object({
  ticket: TicketResponseSchema,
  similarity: z.number(),
  action: z.enum(DuplicateAction),
});

export type DuplicateCandidateResponse = z.infer<typeof DuplicateCandidateResponseSchema>;
