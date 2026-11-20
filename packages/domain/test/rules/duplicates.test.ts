import { describe, expect, it } from 'vitest';

import {
  Category,
  DuplicateAction,
  findDuplicateCandidates,
  Impact,
  Priority,
  similarity,
  TicketStatus,
  TicketType,
  Urgency,
  type Ticket,
} from '../../src/index.ts';

const now = new Date('2026-12-12T12:00:00Z');

function buildTicket(
  fields: Pick<Ticket, 'id' | 'title' | 'category' | 'status'> & Partial<Ticket>,
): Ticket {
  return {
    type: TicketType.INC,
    description: 'Seeded ticket',
    impact: Impact.SELF,
    urgency: Urgency.BLOCKED,
    priority: Priority.HIGH,
    requesterId: 'employee-1',
    createdAt: new Date('2026-12-01T12:00:00Z'),
    lastUpdateAt: new Date('2026-12-01T12:00:00Z'),
    ...fields,
  };
}

describe('similarity', () => {
  it('ignores case and accents', () => {
    expect(similarity('VPN não conecta', 'vpn nao conecta')).toBe(1);
  });

  it('is zero when no meaningful word is shared', () => {
    expect(similarity('VPN não conecta', 'Impressora sem toner')).toBe(0);
  });

  it('is zero when both texts have no meaningful words', () => {
    expect(similarity('a b', '!!')).toBe(0);
  });
});

describe('findDuplicateCandidates', () => {
  const openVpnTicket = buildTicket({
    id: 'open-vpn',
    title: 'VPN nao conecta no notebook',
    category: Category.NETWORK_VPN,
    status: TicketStatus.IN_PROGRESS,
  });
  const recentlyResolvedVpnTicket = buildTicket({
    id: 'resolved-3-days-ago',
    title: 'Erro 809 na VPN',
    category: Category.NETWORK_VPN,
    status: TicketStatus.RESOLVED,
    resolvedAt: new Date('2026-12-09T12:00:00Z'),
  });
  const longResolvedVpnTicket = buildTicket({
    id: 'resolved-10-days-ago',
    title: 'Erro 809 na VPN',
    category: Category.NETWORK_VPN,
    status: TicketStatus.RESOLVED,
    resolvedAt: new Date('2026-12-02T12:00:00Z'),
  });
  const hardwareTicket = buildTicket({
    id: 'other-category',
    title: 'VPN não conecta',
    category: Category.HARDWARE,
    status: TicketStatus.OPEN,
  });
  const unrelatedVpnTicket = buildTicket({
    id: 'unrelated',
    title: 'Pedido de acesso ao portal',
    category: Category.NETWORK_VPN,
    status: TicketStatus.OPEN,
  });

  it('returns similar tickets of the same category that can be updated or reopened, best first', () => {
    const candidates = findDuplicateCandidates(
      { category: Category.NETWORK_VPN, summary: 'VPN não conecta, erro 809' },
      [
        openVpnTicket,
        recentlyResolvedVpnTicket,
        longResolvedVpnTicket,
        hardwareTicket,
        unrelatedVpnTicket,
      ],
      now,
    );

    expect(candidates).toEqual([
      { ticket: recentlyResolvedVpnTicket, similarity: 0.6, action: DuplicateAction.REOPEN },
      { ticket: openVpnTicket, similarity: 0.5, action: DuplicateAction.UPDATE },
    ]);
  });

  it('returns nothing when there are no tickets', () => {
    expect(
      findDuplicateCandidates({ category: Category.EMAIL, summary: 'Outlook travando' }, [], now),
    ).toEqual([]);
  });
});
