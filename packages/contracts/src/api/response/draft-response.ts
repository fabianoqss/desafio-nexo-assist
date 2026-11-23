import { DraftStatus } from '@nexo/domain';
import { z } from 'zod';
import { TicketIdSchema } from '../../tickets/ticket-id.ts';
import { DraftPayloadSchema } from '../drafts/draft-payload.ts';

export const DraftResponseSchema = z.object({
  id: z.string().regex(/^D-\d+$/),
  conversationId: z.string(),
  status: z.enum(DraftStatus),
  payload: DraftPayloadSchema,
  ticketId: TicketIdSchema.exactOptional(),
  createdAt: z.iso.datetime(),
});

export type DraftResponse = z.infer<typeof DraftResponseSchema>;
