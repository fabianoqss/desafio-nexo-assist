import type { TicketType } from '../enums/ticket-type.ts';
import type { Category } from '../enums/category.ts';
import type { Impact } from '../enums/impact.ts';
import type { Urgency } from '../enums/urgency.ts';
import type { Priority } from '../enums/priority.ts';
import type { TicketStatus } from '../enums/ticket-status.ts';

export interface Ticket {
  id: string;
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  item?: string;
  impact: Impact;
  urgency: Urgency;
  priority: Priority;
  status: TicketStatus;
  requesterId: string;
  createdAt: Date;
  lastUpdateAt: Date;
  resolvedAt?: Date;
}
