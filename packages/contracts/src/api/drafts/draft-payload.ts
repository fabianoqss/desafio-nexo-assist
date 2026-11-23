import { DraftKind } from '@nexo/domain';
import { z } from 'zod';
import { boundedText } from '../../common/bounded-text.ts';
import { CreateTicketRequestSchema } from '../../tickets/request/create-ticket-request.ts';
import { TicketIdSchema } from '../../tickets/ticket-id.ts';

const draftTicketMessageFields = {
  ticketId: TicketIdSchema,
  message: boundedText(4000),
};

export const DraftPayloadSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal(DraftKind.CREATE),
    ticket: CreateTicketRequestSchema,
  }),
  z.object({
    kind: z.literal(DraftKind.UPDATE),
    ...draftTicketMessageFields,
  }),
  z.object({
    kind: z.literal(DraftKind.REOPEN),
    ...draftTicketMessageFields,
  }),
]);

export type DraftPayload = z.infer<typeof DraftPayloadSchema>;
