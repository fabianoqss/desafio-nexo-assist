import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoginShowcase } from '../../../src/features/auth/components/login-showcase.tsx';

describe('LoginShowcase', () => {
  it('mostra as estatísticas recebidas com seus rótulos', () => {
    render(
      <LoginShowcase
        stats={{ averageFirstResponse: '12 s', resolvedWithoutQueue: '65%', analystsOnline: 3 }}
      />,
    );

    const terms = screen.getAllByRole('term').map((term) => term.textContent);
    const definitions = screen.getAllByRole('definition').map((value) => value.textContent);

    expect(terms).toEqual([
      'primeira resposta, em média',
      'resolvidos sem fila',
      'analistas online agora',
    ]);
    expect(definitions).toEqual(['12 s', '65%', '3']);
  });
});
