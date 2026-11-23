import { NexoMark } from '../../../shared/brand/nexo-mark.tsx';

export interface ShowcaseStats {
  averageFirstResponse: string;
  resolvedWithoutQueue: string;
  analystsOnline: number;
}

interface LoginShowcaseProps {
  stats: ShowcaseStats;
}

function ConversationPreview() {
  return (
    <figure
      aria-label="Exemplo de conversa com o assistente"
      className="flex w-full max-w-[500px] flex-col gap-2.5 rounded-2xl border border-white/8 bg-white/4 p-[18px]"
    >
      <div className="flex justify-end">
        <p className="rounded-[12px_12px_4px_12px] bg-surface px-3.5 py-[9px] text-[13.5px] text-ink">
          Meu notebook não conecta na VPN. Erro 809.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
          <span className="font-semibold text-white/80">Nexo Assist</span>
          <span className="text-white/45">consultou seus chamados · criou um chamado</span>
        </p>
        <p className="max-w-[380px] rounded-[4px_12px_12px_12px] bg-white/8 px-3.5 py-2.5 text-[13.5px] leading-normal text-white">
          Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
        </p>
        <p className="flex w-fit items-center gap-2 rounded-xl bg-surface px-3 py-[7px] text-[12.5px]">
          <span aria-hidden className="size-[7px] rounded-full bg-warning" />
          <span className="font-semibold text-ink">INC-20517</span>
          <span className="text-muted">Rede e VPN · Alta · em até 4 h</span>
        </p>
      </div>
    </figure>
  );
}

function Stat({ value, label, live = false }: { value: string; label: string; live?: boolean }) {
  return (
    <div className="flex flex-col-reverse gap-1.5 not-first:pl-6">
      <dt className="text-[13.5px] text-white/55">{label}</dt>
      <dd className="flex items-center gap-2 font-display text-[34px] leading-tight tracking-[-0.6px] text-white">
        {value}
        {live && <span aria-hidden className="size-2 rounded-full bg-success" />}
      </dd>
    </div>
  );
}

export function LoginShowcase({ stats }: LoginShowcaseProps) {
  return (
    <section className="hidden flex-col justify-between gap-12 bg-navy px-16 pt-10 pb-12 lg:flex">
      <p className="flex items-center gap-2.5 text-[17px] font-bold tracking-[-0.2px] text-white">
        <NexoMark className="size-6 text-white" />
        Nexo Assist
      </p>

      <div className="flex flex-col gap-9">
        <div className="flex flex-col gap-[18px]">
          <p className="text-[13.5px] font-medium text-white/55">Service desk de TI da Nexo</p>
          <h2 className="font-display text-[54px] leading-[1.04] tracking-[-1.2px] text-white">
            Seu problema de TI, resolvido em uma conversa.
          </h2>
          <p className="max-w-[520px] text-base leading-[1.55] text-white/65">
            Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central
            de ajuda e chama um analista quando precisa.
          </p>
        </div>
        <div className="pl-24">
          <ConversationPreview />
        </div>
      </div>

      <dl className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 pt-6">
        <Stat value={stats.averageFirstResponse} label="primeira resposta, em média" />
        <Stat value={stats.resolvedWithoutQueue} label="resolvidos sem fila" />
        <Stat value={String(stats.analystsOnline)} label="analistas online agora" live />
      </dl>
    </section>
  );
}
