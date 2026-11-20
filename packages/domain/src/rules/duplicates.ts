import type { Ticket } from '../entities/ticket.ts';
import type { Category } from '../enums/category.ts';
import { DuplicateAction } from '../enums/duplicate-action.ts';
import { TicketStatus } from '../enums/ticket-status.ts';
import { canReopen } from './reopen.ts';
import { similarity } from './text-similarity.ts';

export const DUPLICATE_SIMILARITY_THRESHOLD = 0.3;

export interface DuplicateSearchIssue {
  category: Category;
  summary: string;
}

export interface DuplicateCandidate {
  ticket: Ticket;
  similarity: number;
  action: DuplicateAction;
}

function duplicateActionFor(ticket: Ticket, now: Date): DuplicateAction | undefined {
  if (ticket.status !== TicketStatus.RESOLVED) {
    return DuplicateAction.UPDATE;
  }
  return canReopen(ticket, now) ? DuplicateAction.REOPEN : undefined;
}

export function findDuplicateCandidates(
  issue: DuplicateSearchIssue,
  tickets: readonly Ticket[],
  now: Date,
): DuplicateCandidate[] {
  return tickets
    .filter((ticket) => ticket.category === issue.category)
    .flatMap((ticket) => {
      const action = duplicateActionFor(ticket, now);
      const score = similarity(issue.summary, ticket.title);
      if (action === undefined || score < DUPLICATE_SIMILARITY_THRESHOLD) {
        return [];
      }
      return [{ ticket, similarity: score, action }];
    })
    .sort((first, second) => second.similarity - first.similarity);
}
