import type { ReactNode } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, RotateCw } from "lucide-react";
import { CLASSES_DO_TOM, type Tom } from "@/lib/afiliados/situacoes";
import { cn } from "@/lib/utils";

/**
 * Peças pequenas do portal do afiliado. Mesma ideia de
 * `components/landing/primitivos.tsx`: componentes curtos e repetidos ficam
 * juntos, em vez de um arquivo para cada.
 */

/** A superfície padrão do portal: preto um tom acima do fundo, borda fina. */
export function Painel({
  children,
  className,
  destaque = false,
}: {
  children: ReactNode;
  className?: string;
  destaque?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-[18px] border bg-[#0a0a0a] p-4 sm:p-5",
        destaque
          ? "border-[#ff5a00]/35 shadow-[0_0_60px_-20px_rgba(255,90,0,0.45)]"
          : "border-white/[0.08]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function TituloDaPagina({
  titulo,
  texto,
  acao,
}: {
  titulo: string;
  texto?: string;
  acao?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-medium tracking-[-0.03em] text-white sm:text-3xl">{titulo}</h1>
        {texto ? <p className="mt-1 text-sm text-white/55">{texto}</p> : null}
      </div>
      {acao}
    </header>
  );
}

/** Um número do painel. O valor usa algarismos de largura fixa para não "dançar". */
export function CartaoNumero({
  rotulo,
  valor,
  detalhe,
  icone,
  tom = "neutro",
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  icone?: ReactNode;
  tom?: "neutro" | "laranja" | "azul" | "verde";
}) {
  const corDoIcone = {
    neutro: "bg-white/5 text-white/70",
    laranja: "bg-[#ff5a00]/12 text-[#ff8a3d]",
    azul: "bg-[#008cff]/12 text-[#5cb8ff]",
    verde: "bg-emerald-500/12 text-emerald-400",
  }[tom];
  return (
    <Painel className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">
          {rotulo}
        </span>
        {icone ? (
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", corDoIcone)}>
            {icone}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 whitespace-nowrap text-[clamp(1.2rem,5.4vw,1.75rem)] font-semibold leading-none tracking-[-0.02em] text-white tabular-nums">
        <ValorComMoeda valor={valor} />
      </div>
      {detalhe ? <div className="text-xs text-white/45">{detalhe}</div> : null}
    </Painel>
  );
}

/**
 * "R$ 22.841,33" num cartão de meia tela de celular: o "R$" menor deixa o
 * número caber inteiro numa linha. Número de dinheiro quebrado em duas
 * linhas ("22.841,3" / "3") é o tipo de coisa que faz alguém ler errado.
 */
function ValorComMoeda({ valor }: { valor: ReactNode }) {
  if (typeof valor === "string" && valor.startsWith("R$ ")) {
    return (
      <>
        <span className="text-[0.6em] font-medium text-white/60">R$</span>
        {"\u00a0"}
        {valor.slice(3)}
      </>
    );
  }
  if (typeof valor === "string" && valor.startsWith("-R$ ")) {
    return (
      <>
        <span className="text-[0.6em] font-medium text-white/60">-R$</span>
        {"\u00a0"}
        {valor.slice(4)}
      </>
    );
  }
  return <>{valor}</>;
}

export function Selo({ tom, children }: { tom: Tom; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        CLASSES_DO_TOM[tom],
      )}
    >
      {children}
    </span>
  );
}

export function Carregando({ linhas = 3, altura = "h-16" }: { linhas?: number; altura?: string }) {
  return (
    <div className="space-y-3" role="status" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className={cn("animate-pulse rounded-[14px] bg-white/[0.05]", altura)} />
      ))}
    </div>
  );
}

export function Vazio({
  titulo,
  texto,
  acao,
}: {
  titulo: string;
  texto?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-white/10 px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-white/5 text-white/50">
        <Inbox className="size-5" />
      </span>
      <p className="mt-1 font-medium text-white">{titulo}</p>
      {texto ? <p className="max-w-sm text-sm text-white/50">{texto}</p> : null}
      {acao ? <div className="mt-2">{acao}</div> : null}
    </div>
  );
}

export function Erro({ mensagem, tentarDeNovo }: { mensagem: string; tentarDeNovo?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-[18px] border border-red-500/25 bg-red-500/[0.06] px-6 py-8 text-center"
    >
      <AlertTriangle className="size-6 text-red-400" />
      <p className="text-sm text-white/80">{mensagem}</p>
      {tentarDeNovo ? (
        <button
          type="button"
          onClick={tentarDeNovo}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-medium text-white hover:bg-white/5"
        >
          <RotateCw className="size-4" /> Tentar de novo
        </button>
      ) : null}
    </div>
  );
}

export function Paginacao({
  pagina,
  total,
  porPagina,
  aoMudar,
}: {
  pagina: number;
  total: number;
  porPagina: number;
  aoMudar: (p: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (total <= porPagina) return null;
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Paginação">
      <button
        type="button"
        disabled={pagina <= 1}
        onClick={() => aoMudar(pagina - 1)}
        className="inline-flex h-11 items-center gap-1 rounded-full border border-white/10 px-4 text-sm text-white disabled:opacity-35"
      >
        <ChevronLeft className="size-4" /> Anterior
      </button>
      <span className="text-sm text-white/55 tabular-nums">
        {pagina} de {paginas}
      </span>
      <button
        type="button"
        disabled={pagina >= paginas}
        onClick={() => aoMudar(pagina + 1)}
        className="inline-flex h-11 items-center gap-1 rounded-full border border-white/10 px-4 text-sm text-white disabled:opacity-35"
      >
        Próxima <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}

/** Seletor nativo com a cara do portal. Nativo de propósito: no celular abre a roda do próprio aparelho. */
export function Seletor({
  valor,
  aoMudar,
  opcoes,
  rotulo,
  className,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  opcoes: { valor: string; rotulo: string }[];
  rotulo: string;
  className?: string;
}) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{rotulo}</span>
      <select
        aria-label={rotulo}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="h-11 w-full appearance-none rounded-full border border-white/10 bg-[#0d0d0d] pl-4 pr-9 text-sm text-white outline-none focus:border-[#ff5a00]/60"
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor} className="bg-[#0d0d0d]">
            {o.rotulo}
          </option>
        ))}
      </select>
      <ChevronRight className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-white/40" />
    </label>
  );
}

/** Botão principal: laranja da marca, alto o bastante para o polegar. */
export function BotaoPrincipal({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#ff5a00] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#ff7a2b] disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function BotaoSecundario({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 px-6 text-sm font-medium text-white transition-colors hover:bg-white/5 disabled:opacity-45",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Campo de formulário com rótulo, ajuda e erro. */
export function Campo({
  id,
  rotulo,
  erro,
  ajuda,
  children,
}: {
  id: string;
  rotulo: string;
  erro?: string | null;
  ajuda?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-white/85">
        {rotulo}
      </label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} className="text-xs text-red-400">
          {erro}
        </p>
      ) : ajuda ? (
        <p className="text-xs text-white/45">{ajuda}</p>
      ) : null}
    </div>
  );
}

export const classeDoCampo =
  "h-12 w-full rounded-[12px] border border-white/10 bg-[#0d0d0d] px-4 text-base text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#ff5a00]/60 disabled:opacity-60 sm:text-sm";
