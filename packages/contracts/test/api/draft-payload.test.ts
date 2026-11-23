import { DraftPayloadSchema } from '@nexo/contracts';
import { describe, expect, it } from 'vitest';

describe('DraftPayloadSchema', () => {
  it('aceita CREATE com um chamado válido', () => {
    const payload = {
      kind: 'CREATE',
      ticket: {
        type: 'INC',
        title: 'VPN não conecta',
        description: 'A VPN desconecta ao iniciar.',
        category: 'NETWORK_VPN',
        impact: 'SELF',
        urgency: 'BLOCKED',
      },
    };

    expect(DraftPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('aceita REOPEN para INC-20298', () => {
    expect(
      DraftPayloadSchema.parse({
        kind: 'REOPEN',
        ticketId: 'INC-20298',
        message: '  O Outlook voltou a falhar.  ',
      }),
    ).toEqual({
      kind: 'REOPEN',
      ticketId: 'INC-20298',
      message: 'O Outlook voltou a falhar.',
    });
  });

  it('recusa UPDATE sem mensagem', () => {
    expect(DraftPayloadSchema.safeParse({ kind: 'UPDATE', ticketId: 'INC-20298' }).success).toBe(
      false,
    );
  });

  it('recusa DELETE', () => {
    expect(
      DraftPayloadSchema.safeParse({
        kind: 'DELETE',
        ticketId: 'INC-20298',
        message: 'Excluir chamado.',
      }).success,
    ).toBe(false);
  });
});
