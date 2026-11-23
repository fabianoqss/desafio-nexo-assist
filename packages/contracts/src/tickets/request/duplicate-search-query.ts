import { Category } from '@nexo/domain';
import { z } from 'zod';

export const DuplicateSearchQuerySchema = z.object({
  category: z.enum(Category),
  summary: z.string().trim().min(1).max(500),
  requesterId: z.uuid().exactOptional(),
});

export type DuplicateSearchQuery = z.infer<typeof DuplicateSearchQuerySchema>;
