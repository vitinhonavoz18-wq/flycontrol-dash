import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { HelpCircle, X } from "lucide-react";
import { POSES } from "./personagem";

/**
 * O botão "Precisa de ajuda?" que fica no painel depois do guia.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ISTO NÃO É UM ATENDENTE AUTOMÁTICO, E NÃO FINGE SER
 * ═══════════════════════════════════════════════════════════════════════
 *
 * É uma lista de atalhos com o mesmo personagem do guia. Cada item leva à
 * tela onde a coisa é feita — nada de campo de digitar pergunta, porque um
 * campo de pergunta promete resposta, e o que existe hoje são atalhos.
 *
 * É a placa "banheiro →" no corredor: não conversa, mas resolve.
 *
 * A BASE PARA DEPOIS
 *
 * Quando existir atendimento de verdade, ele entra AQUI: o botão, a gaveta e
 * o personagem já estão de pé, e as perguntas viram conversa em vez de link.
 * O resto do painel não precisa saber da diferença.
 */

type Atalho = { pergunta: string; para: string; busca?: Record<string, string> };

/**
 * As perguntas que um lojista novo realmente faz na primeira semana. Cada uma
 * aponta para a tela — e para a ABA — onde a resposta está.
 */
const ATALHOS: readonly Atalho[] = [
  { pergunta: "Como adicionar um produto?", para: "/menu", busca: { aba: "products" } },
  { pergunta: "Como criar adicionais?", para: "/menu", busca: { aba: "extras" } },
  { pergunta: "Como alterar meu horário?", para: "/my-store", busca: { aba: "service" } },
  { pergunta: "Como configurar entrega?", para: "/my-store", busca: { aba: "delivery" } },
  { pergunta: "Como publicar meu cardápio?", para: "/my-store", busca: { aba: "identity" } },
  { pergunta: "Como alterar meu plano?", para: "/billing" },
];

export function CentralDeAjuda() {
  const [aberta, setAberta] = useState(false);
  const pose = POSES["boas-vindas"];

  return (
    <>
      {/* O botão fica acima da barra de baixo no celular, como o resto dos
          botões flutuantes do painel. */}
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        aria-label="Precisa de ajuda?"
        className="fixed right-4 z-[var(--z-dropdown)] flex min-h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground shadow-xl transition-transform hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-95"
        style={{ bottom: "calc(var(--bottom-nav-offset) + 0.75rem)" }}
      >
        {aberta ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <HelpCircle className="h-5 w-5" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">Precisa de ajuda?</span>
      </button>

      {aberta && (
        <div
          className="fixed right-4 z-[var(--z-dropdown)] w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-primary/25 bg-card p-4 shadow-2xl duration-200 animate-in fade-in slide-in-from-bottom-2"
          style={{ bottom: "calc(var(--bottom-nav-offset) + 4.5rem)" }}
          role="dialog"
          aria-label="Central de ajuda"
        >
          <div className="flex items-center gap-2">
            <img src={pose.src} alt="" aria-hidden="true" className="h-10 w-auto object-contain" />
            <p className="text-sm font-bold">Em que posso ajudar?</p>
          </div>

          <ul className="mt-3 space-y-1">
            {ATALHOS.map((a) => (
              <li key={a.pergunta}>
                <Link
                  to={a.para}
                  search={a.busca}
                  onClick={() => setAberta(false)}
                  className="flex min-h-11 items-center rounded-xl px-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {a.pergunta}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
