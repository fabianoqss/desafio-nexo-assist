import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { useState, type ReactNode, type SubmitEvent } from 'react';

export interface LoginCredentials {
  email: string;
  password: string;
  remember: boolean;
}

interface LoginFormProps {
  onSubmit: (credentials: LoginCredentials) => void;
}

const fieldShell =
  'group flex h-11 items-center gap-2.5 rounded-lg border border-field bg-surface pr-2 pl-3.5 shadow-[0_1px_2px_#1b24310a] transition focus-within:border-brand focus-within:ring-[0.5px] focus-within:ring-brand';
const fieldIcon = 'size-4 shrink-0 text-muted group-focus-within:text-link';
const fieldInput =
  'h-full w-full min-w-0 bg-transparent text-[14.5px] text-ink placeholder:text-muted focus:outline-none';
const label = 'text-[13.5px] font-medium text-ink';

function readText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

function Field({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({
      email: readText(data, 'email').trim(),
      password: readText(data, 'password'),
      remember: data.get('remember') === 'on',
    });
  }

  return (
    <form className="flex w-full max-w-[380px] flex-col gap-7" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[40px] leading-[1.1] tracking-[-0.8px] text-ink">
          Entrar
        </h1>
        <p className="text-[15.5px] leading-normal text-muted">
          Use seu e-mail corporativo e a senha da rede Nexo.
        </p>
      </div>

      <div className="flex flex-col gap-[18px]">
        <Field>
          <label htmlFor="email" className={label}>
            E-mail corporativo
          </label>
          <div className={fieldShell}>
            <Mail aria-hidden className={fieldIcon} />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              placeholder="nome@nexo.com.br"
              maxLength={254}
              required
              className={fieldInput}
            />
          </div>
        </Field>

        <Field>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className={label}>
              Senha
            </label>
            <a href="tel:4000" className="text-[13.5px] font-medium text-link hover:underline">
              Esqueci minha senha
            </a>
          </div>
          <div className={fieldShell}>
            <LockKeyhole aria-hidden className={fieldIcon} />
            <input
              id="password"
              name="password"
              type={passwordVisible ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••••"
              maxLength={128}
              required
              className={`${fieldInput} ${passwordVisible ? '' : 'tracking-[2px]'}`}
            />
            <button
              type="button"
              aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
              aria-pressed={passwordVisible}
              onClick={() => {
                setPasswordVisible((visible) => !visible);
              }}
              className="flex size-[30px] shrink-0 items-center justify-center rounded-md text-muted hover:bg-subtle focus-visible:outline-2 focus-visible:outline-brand"
            >
              {passwordVisible ? (
                <EyeOff aria-hidden className="size-4" />
              ) : (
                <Eye aria-hidden className="size-4" />
              )}
            </button>
          </div>
        </Field>

        <label className="flex w-fit cursor-pointer items-center gap-[9px] pt-0.5">
          <span className="relative flex size-[18px] items-center justify-center">
            <input
              type="checkbox"
              name="remember"
              className="peer size-full cursor-pointer appearance-none rounded-md border border-field bg-surface checked:border-brand checked:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
            <Check
              aria-hidden
              strokeWidth={3}
              className="pointer-events-none absolute size-3 text-white opacity-0 peer-checked:opacity-100"
            />
          </span>
          <span className="text-[13.5px] text-ink-soft">Manter conectado neste computador</span>
        </label>
      </div>

      <button
        type="submit"
        className="flex h-11 items-center justify-center gap-2 rounded-lg bg-brand text-[15.5px] font-semibold text-white shadow-[0_1px_2px_#0062c433,0_6px_16px_#0062c426] transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Entrar
        <ArrowRight aria-hidden className="size-4" />
      </button>
    </form>
  );
}
