import { TicketEventKind } from '../enums/ticket-event-kind.ts';
import { TicketStatus } from '../enums/ticket-status.ts';

export type StatusChangeTarget = Exclude<TicketStatus, 'OPEN'>;

const EVENT_KIND_BY_TARGET = {
  WAITING_ANALYST: TicketEventKind.TRANSFERRED,
  IN_PROGRESS: TicketEventKind.ASSUMED,
  APPROVED: TicketEventKind.UPDATED,
  RESOLVED: TicketEventKind.RESOLVED,
} as const satisfies Record<StatusChangeTarget, TicketEventKind>;

export function canChangeStatus(from: TicketStatus, to: TicketStatus): boolean {
  return from !== to && from !== TicketStatus.RESOLVED && to !== TicketStatus.OPEN;
}

export function statusChangeEventKind(to: StatusChangeTarget): TicketEventKind {
  return EVENT_KIND_BY_TARGET[to];
}
