import { z } from 'zod';
import { boundedText } from '../../common/bounded-text.ts';

export const PostMessageRequestSchema = z.object({
  content: boundedText(4000),
});

export type PostMessageRequest = z.infer<typeof PostMessageRequestSchema>;
