import { Category } from '@nexo/domain';
import { z } from 'zod';
import { boundedText } from '../../common/bounded-text.ts';
import { LowercaseUuidSchema } from '../../common/uuid.ts';

export const DuplicateSearchQuerySchema = z.object({
  category: z.enum(Category),
  summary: boundedText(500),
  requesterId: LowercaseUuidSchema.exactOptional(),
});

export type DuplicateSearchQuery = z.infer<typeof DuplicateSearchQuerySchema>;
