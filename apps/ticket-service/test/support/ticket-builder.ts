import {
  Category,
  Impact,
  Priority,
  TicketStatus,
  TicketType,
  Urgency,
  type Ticket,
} from '@nexo/domain';

export function buildTicket(overrides: Partial<Ticket> = {}): Ticket {
  const type = overrides.type ?? TicketType.INC;
  return {
    id: type === TicketType.INC ? 'INC-20400' : 'REQ-10500',
    type,
    title: 'VPN não conecta',
    description: 'A conexão com a VPN falha ao trabalhar remotamente.',
    category: Category.NETWORK_VPN,
    impact: Impact.SELF,
    urgency: Urgency.SAME_DAY_COMMITMENT,
    priority: Priority.HIGH,
    status: TicketStatus.OPEN,
    requesterId: '00000000-0000-4000-8000-000000000001',
    createdAt: new Date('2026-12-08T12:00:00Z'),
    lastUpdateAt: new Date('2026-12-09T12:00:00Z'),
    ...overrides,
  };
}
