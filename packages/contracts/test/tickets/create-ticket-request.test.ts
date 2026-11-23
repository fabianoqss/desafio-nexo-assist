import { describe, expect, expectTypeOf, it } from 'vitest';
import type { TicketDraft } from '@nexo/domain';
import {
  AddTicketInfoRequestSchema,
  ChangeTicketStatusRequestSchema,
  CreateTicketRequestSchema,
  ReopenTicketRequestSchema,
  type CreateTicketRequest,
} from '@nexo/contracts';

const draft = {
  type: 'INC',
  title: '  VPN não conecta  ',
  description: '  A VPN desconecta ao iniciar.  ',
  category: 'NETWORK_VPN',
  impact: 'SELF',
  urgency: 'BLOCKED',
};

describe('CreateTicketRequestSchema', () => {
  it('remove espaços nas pontas dos campos de texto de um rascunho de VPN', () => {
    expect(CreateTicketRequestSchema.parse({ ...draft, item: '  VPN  ' })).toEqual({
      ...draft,
      title: 'VPN não conecta',
      description: 'A VPN desconecta ao iniciar.',
      item: 'VPN',
    });
  });

  it('aceita a ausência de item e produz um TicketDraft', () => {
    expect(CreateTicketRequestSchema.parse(draft)).not.toHaveProperty('item');
    expectTypeOf<CreateTicketRequest>().toExtend<TicketDraft>();
  });

  it.each([
    { title: '   ' },
    { title: 'a'.repeat(121) },
    { category: 'HR' },
    { description: 'a'.repeat(4001) },
    { item: 'a'.repeat(81) },
    { item: '   ' },
  ])('recusa campos inválidos no rascunho %#', (fields) => {
    expect(CreateTicketRequestSchema.safeParse({ ...draft, ...fields }).success).toBe(false);
  });

  it.each(['title', 'description', 'item'])('recusa U+0000 no campo %s', (field) => {
    expect(
      CreateTicketRequestSchema.safeParse({ ...draft, [field]: 'VPN\u0000cliente' }).success,
    ).toBe(false);
  });
});

describe.each([
  ['AddTicketInfoRequestSchema', AddTicketInfoRequestSchema],
  ['ReopenTicketRequestSchema', ReopenTicketRequestSchema],
] as const)('%s', (_name, schema) => {
  it('remove espaços nas pontas da mensagem', () => {
    expect(schema.parse({ message: '  A VPN voltou a desconectar.  ' })).toEqual({
      message: 'A VPN voltou a desconectar.',
    });
  });

  it.each(['   ', 'a'.repeat(4001)])('recusa mensagens fora do limite %#', (message) => {
    expect(schema.safeParse({ message }).success).toBe(false);
  });

  it('recusa U+0000 na mensagem', () => {
    expect(schema.safeParse({ message: 'A VPN\u0000voltou a desconectar.' }).success).toBe(false);
  });
});

describe('ChangeTicketStatusRequestSchema', () => {
  it.each(['IN_PROGRESS', 'WAITING_ANALYST', 'APPROVED', 'RESOLVED'])(
    'aceita o status %s',
    (status) => {
      expect(ChangeTicketStatusRequestSchema.parse({ status })).toEqual({ status });
    },
  );

  it('recusa o status OPEN', () => {
    expect(ChangeTicketStatusRequestSchema.safeParse({ status: 'OPEN' }).success).toBe(false);
  });
});
