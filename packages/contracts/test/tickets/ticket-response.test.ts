import { describe, expect, it } from 'vitest';
import {
  DuplicateCandidateResponseSchema,
  TicketIdSchema,
  TicketResponseSchema,
} from '@nexo/contracts';

const ticket = {
  id: 'INC-20311',
  type: 'INC',
  title: 'VPN não conecta',
  description: 'A VPN desconecta ao iniciar.',
  category: 'NETWORK_VPN',
  item: 'VPN',
  impact: 'SELF',
  urgency: 'BLOCKED',
  priority: 'HIGH',
  status: 'RESOLVED',
  requesterId: '26409ee7-73de-4218-9b0e-2b71ba1e12dd',
  createdAt: '2026-12-09T12:43:00.000Z',
  lastUpdateAt: '2026-12-09T13:00:00.000Z',
  resolvedAt: '2026-12-09T13:00:00.000Z',
  dueAt: '2026-12-09T16:43:00.000Z',
  overdue: false,
};

describe('TicketIdSchema', () => {
  it.each(['INC-20311', 'REQ-10442'])('aceita %s', (id) => {
    expect(TicketIdSchema.parse(id)).toBe(id);
  });

  it.each(['inc-20311', 'INC-1', 'INC-20311; DROP'])('recusa %s', (id) => {
    expect(TicketIdSchema.safeParse(id).success).toBe(false);
  });
});

describe('TicketResponseSchema', () => {
  it('aceita um chamado completo serializado', () => {
    expect(TicketResponseSchema.parse(ticket)).toEqual(ticket);
  });

  it('recusa um prazo fora do formato ISO', () => {
    expect(TicketResponseSchema.safeParse({ ...ticket, dueAt: 'amanhã' }).success).toBe(false);
  });
});

describe('DuplicateCandidateResponseSchema', () => {
  it('aceita um chamado com pontuação de similaridade e ação', () => {
    const candidate = { ticket, similarity: 0.9, action: 'REOPEN' };
    expect(DuplicateCandidateResponseSchema.parse(candidate)).toEqual(candidate);
  });

  it('recusa uma ação ausente no domínio', () => {
    expect(
      DuplicateCandidateResponseSchema.safeParse({ ticket, similarity: 0.9, action: 'IGNORE' })
        .success,
    ).toBe(false);
  });
});
