import { LoginForm } from '../components/login-form.tsx';
import { LoginShowcase, type ShowcaseStats } from '../components/login-showcase.tsx';

const previewStats: ShowcaseStats = {
  averageFirstResponse: '8 s',
  resolvedWithoutQueue: '72%',
  analystsOnline: 6,
};

export function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[5fr_4fr]">
      <LoginShowcase stats={previewStats} />
      <section className="flex flex-col justify-between px-6 py-10 sm:px-14">
        <p className="flex flex-wrap items-center justify-end gap-1.5 text-[13.5px]">
          <span className="text-muted">Problema para entrar?</span>
          <a href="tel:4000" className="font-semibold text-link hover:underline">
            Ligue no ramal 4000
          </a>
        </p>
        <div className="flex justify-center py-10">
          <LoginForm onSubmit={() => undefined} />
        </div>
        <footer className="flex flex-wrap justify-between gap-2 text-[12.5px] text-muted">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </footer>
      </section>
    </main>
  );
}
