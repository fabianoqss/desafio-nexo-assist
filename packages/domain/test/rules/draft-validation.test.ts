import { describe, expect, it } from 'vitest';

import {
  Category,
  Impact,
  Priority,
  TicketType,
  Urgency,
  validateTicketDraft,
} from '../../src/index.ts';

const completeVpnDraft = {
  type: TicketType.INC,
  title: 'VPN não conecta',
  description: 'Erro 809 ao conectar na VPN, tenho reunião com cliente às 15h',
  category: Category.NETWORK_VPN,
  impact: Impact.SELF,
  urgency: Urgency.SAME_DAY_COMMITMENT,
};

describe('validateTicketDraft', () => {
  it('accepts a complete draft and computes its priority', () => {
    expect(validateTicketDraft(completeVpnDraft)).toEqual({
      ok: true,
      draft: completeVpnDraft,
      priority: Priority.HIGH,
    });
  });

  it('lists every required field when the draft is empty', () => {
    expect(validateTicketDraft({})).toEqual({
      ok: false,
      missing: ['type', 'title', 'description', 'category', 'impact', 'urgency'],
    });
  });

  it('treats a blank title as missing', () => {
    expect(validateTicketDraft({ ...completeVpnDraft, title: '   ' })).toEqual({
      ok: false,
      missing: ['title'],
    });
  });

  it('trims the text fields, including the optional item', () => {
    const result = validateTicketDraft({
      ...completeVpnDraft,
      title: '  VPN não conecta  ',
      item: '  Notebook  ',
    });

    expect(result).toEqual({
      ok: true,
      draft: { ...completeVpnDraft, item: 'Notebook' },
      priority: Priority.HIGH,
    });
  });

  it('drops a blank optional item', () => {
    expect(validateTicketDraft({ ...completeVpnDraft, item: '   ' })).toEqual({
      ok: true,
      draft: completeVpnDraft,
      priority: Priority.HIGH,
    });
  });
});
