export {
  addBusinessHours,
  BUSINESS_CLOSING_HOUR,
  BUSINESS_OPENING_HOUR,
} from './calendar/business-hours.ts';
export { DOMAIN_TIMEZONE } from './calendar/timezone.ts';
export type { Ticket } from './entities/ticket.ts';
export type { TicketDraft } from './entities/ticket-draft.ts';
export { Category } from './enums/category.ts';
export { DeadlineKind } from './enums/deadline-kind.ts';
export { DuplicateAction } from './enums/duplicate-action.ts';
export { Impact } from './enums/impact.ts';
export { Priority } from './enums/priority.ts';
export { RuleCheckId } from './enums/rule-check-id.ts';
export { TicketStatus } from './enums/ticket-status.ts';
export { TicketType } from './enums/ticket-type.ts';
export { Urgency } from './enums/urgency.ts';
export {
  adjustConfidence,
  CONFIDENCE_PENALTIES,
  DEFAULT_HANDOFF_THRESHOLD,
  shouldHandoff,
} from './rules/confidence.ts';
export type { AdjustedConfidence, RuleCheck } from './rules/confidence.ts';
export { computeDueAt, DEADLINES } from './rules/deadline.ts';
export type { DeadlinePolicy } from './rules/deadline.ts';
export { REQUIRED_DRAFT_FIELDS, validateTicketDraft } from './rules/draft-validation.ts';
export type { DraftValidation, RequiredDraftField } from './rules/draft-validation.ts';
export { DUPLICATE_SIMILARITY_THRESHOLD, findDuplicateCandidates } from './rules/duplicates.ts';
export type { DuplicateCandidate, DuplicateSearchIssue } from './rules/duplicates.ts';
export { isOverdue } from './rules/overdue.ts';
export type { OverdueCheckInput } from './rules/overdue.ts';
export {
  computePriority,
  HANDOFF_FALLBACK_PRIORITY,
  resolveHandoffPriority,
} from './rules/priority.ts';
export type { HandoffPriorityInput } from './rules/priority.ts';
export { canReopen, REOPEN_WINDOW_MS } from './rules/reopen.ts';
export type { ReopenCheckInput } from './rules/reopen.ts';
export { similarity } from './rules/text-similarity.ts';
