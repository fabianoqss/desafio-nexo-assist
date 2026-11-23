import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from '../../../src/features/auth/components/login-form.tsx';

describe('LoginForm', () => {
  it('envia o e-mail sem espaços, a senha e a opção de manter conectado', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('E-mail corporativo'), '  ana.souza@nexo.com.br ');
    await user.type(screen.getByLabelText('Senha'), 'qualquer-senha');
    await user.click(screen.getByLabelText('Manter conectado neste computador'));
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      email: 'ana.souza@nexo.com.br',
      password: 'qualquer-senha',
      remember: true,
    });
  });

  it('não envia com campos vazios', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('alterna a visibilidade da senha', async () => {
    const user = userEvent.setup();
    render(<LoginForm onSubmit={vi.fn()} />);
    const password = screen.getByLabelText('Senha');

    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(password).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(password).toHaveAttribute('type', 'password');
  });
});
