import type { ConversationStatus, HandoffReason, Priority } from '@nexo/domain';

export interface Conversation {
  id: string;
  employeeId: string;
  status: ConversationStatus;
  assignedAnalystId?: string;
  handoff?: {
    reason: HandoffReason;
    summary: string;
    priority: Priority;
    requestedAt: Date;
    dueAt: Date;
  };
  assumedAt?: Date;
  closedAt?: Date;
  employeeMessageCount: number;
  createdAt: Date;
  lastMessageAt: Date;
}
