import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { linkDoAfiliado, linkParaExibir } from "@/lib/afiliados/validacao";
import { cn } from "@/lib/utils";

/**
 * Copia para a área de transferência. O jeito moderno falha em página sem
 * https ou em alguns navegadores embutidos (o do Instagram, por exemplo);
 * aí entra o jeito antigo, com um campo escondido.
 */
async function copiar(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // cai no jeito antigo
  }
  try {
    const campo = document.createElement("textarea");
    campo.value = texto;
    campo.setAttribute("readonly", "");
    campo.style.position = "fixed";
    campo.style.opacity = "0";
    document.body.appendChild(campo);
    campo.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(campo);
    return ok;
  } catch {
    return false;
  }
}

export function BotaoCopiar({
  texto,
  rotulo,
  copiadoRotulo,
  className,
  variante = "principal",
}: {
  texto: string;
  rotulo: string;
  copiadoRotulo: string;
  className?: string;
  variante?: "principal" | "discreto";
}) {
  const [estado, setEstado] = useState<"parado" | "copiado" | "falhou">("parado");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function aoClicar() {
    const ok = await copiar(texto);
    setEstado(ok ? "copiado" : "falhou");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setEstado("parado"), 2200);
  }

  return (
    <button
      type="button"
      onClick={aoClicar}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors",
        variante === "principal"
          ? estado === "copiado"
            ? "bg-emerald-500 text-black"
            : "bg-[#ff5a00] text-white hover:bg-[#ff7a2b]"
          : "border border-white/15 text-white hover:bg-white/5",
        className,
      )}
    >
      {estado === "copiado" ? <Check className="size-4" /> : <Copy className="size-4" />}
      <span aria-live="polite">
        {estado === "copiado"
          ? copiadoRotulo
          : estado === "falhou"
            ? "Não deu para copiar"
            : rotulo}
      </span>
    </button>
  );
}

/**
 * O cartão mais importante do painel: é daqui que sai todo o dinheiro do
 * parceiro. O código aparece, mas não se edita — trocar o código
 * quebraria todo link que ele já espalhou.
 */
export function CartaoDoLink({ codigo }: { codigo: string }) {
  const link = linkDoAfiliado(codigo);
  return (
    <section
      aria-label="Seu link de afiliado"
      className="relative overflow-hidden rounded-[24px] border border-[#ff5a00]/35 bg-[#0a0a0a] p-5 shadow-[0_0_80px_-30px_rgba(255,90,0,0.6)] sm:p-7"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-[#ff5a00]/20 blur-3xl"
      />
      <div className="relative">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#ff8a3d]">
          <Link2 className="size-4" /> Seu link de afiliado
        </span>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <p
            className="min-w-0 break-all font-mono text-base text-white sm:text-lg"
            data-testid="link-afiliado"
          >
            {linkParaExibir(codigo)}
          </p>
          <BotaoCopiar
            texto={link}
            rotulo="Copiar link"
            copiadoRotulo="Link copiado!"
            className="w-full lg:w-auto"
          />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/[0.08] pt-4">
          <span className="text-sm text-white/55">Código de indicação</span>
          <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 font-mono text-sm font-semibold tracking-[0.12em] text-white">
            {codigo}
          </span>
          <BotaoCopiar
            texto={codigo}
            rotulo="Copiar código"
            copiadoRotulo="Código copiado!"
            variante="discreto"
            className="h-9 px-3.5 text-xs"
          />
        </div>
      </div>
    </section>
  );
}
