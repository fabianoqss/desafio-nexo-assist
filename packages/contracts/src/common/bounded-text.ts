import { z } from 'zod';

export function boundedText(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .refine((value) => !value.includes('\u0000'), 'O texto não pode conter U+0000');
}
