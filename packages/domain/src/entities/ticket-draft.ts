import type { TicketType } from '../enums/ticket-type.ts';
import type { Category } from '../enums/category.ts';
import type { Impact } from '../enums/impact.ts';
import type { Urgency } from '../enums/urgency.ts';

export interface TicketDraft {
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  item?: string;
  impact: Impact;
  urgency: Urgency;
}
