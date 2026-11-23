import { describeError } from '@nexo/server-kit';
import { describe, expect, it } from 'vitest';

describe('describeError', () => {
  it('classifica um valor que não é Error sem registrar seu conteúdo', () => {
    expect(describeError('valor privado')).toEqual({ errorName: 'UnknownError' });
  });

  it('usa o código da causa quando o erro tem um código não textual', () => {
    const error = Object.assign(new Error('mensagem privada', { cause: { code: '23514' } }), {
      code: 500,
    });

    expect(describeError(error)).toEqual({ errorName: 'Error', databaseErrorCode: '23514' });
  });
});
