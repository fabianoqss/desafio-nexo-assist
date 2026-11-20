import type { TicketDraft } from '../entities/ticket-draft.ts';
import type { Priority } from '../enums/priority.ts';
import { computePriority } from './priority.ts';

export const REQUIRED_DRAFT_FIELDS = [
  'type',
  'title',
  'description',
  'category',
  'impact',
  'urgency',
] as const satisfies readonly (keyof TicketDraft)[];

export type RequiredDraftField = (typeof REQUIRED_DRAFT_FIELDS)[number];

export type DraftValidation =
  | { ok: true; draft: TicketDraft; priority: Priority }
  | { ok: false; missing: RequiredDraftField[] };

export function validateTicketDraft(input: Partial<TicketDraft>): DraftValidation {
  const { type, category, impact, urgency } = input;
  const title = input.title?.trim();
  const description = input.description?.trim();
  const item = input.item?.trim();

  if (!type || !title || !description || !category || !impact || !urgency) {
    const provided = { type, title, description, category, impact, urgency };
    return { ok: false, missing: REQUIRED_DRAFT_FIELDS.filter((field) => !provided[field]) };
  }

  return {
    ok: true,
    draft: { type, title, description, category, impact, urgency, ...(item ? { item } : {}) },
    priority: computePriority(impact, urgency),
  };
}
