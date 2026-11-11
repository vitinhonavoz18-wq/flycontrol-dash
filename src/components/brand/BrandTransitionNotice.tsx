import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { BrandSymbol } from "@/components/brand/BrandLogo";
import { BRAND_TRANSITION, shouldShowBrandTransitionNotice } from "@/lib/brand";

/**
 * O aviso "O FlyControl evoluiu. Agora somos FlyDelivery."
 *
 * Quem abre o painel e encontra outro nome e outra logo pensa primeiro em
 * golpe ou em endereço errado. Esta faixa responde à pergunta antes de ela
 * virar ligação para o suporte: é o mesmo sistema, a loja e os dados estão
 * aqui.
 *
 * É a placa "mesma casa, nova fachada" na porta do restaurante depois da
 * reforma.
 *
 * COMO ELA SE COMPORTA
 *
 *  - só aparece para quem já era cliente antes da troca;
 *  - fecha no X e não volta naquele aparelho;
 *  - some sozinha depois da data final (ver `BRAND_TRANSITION` em
 *    `lib/brand.ts`, onde o período é configurado);
 *  - não trava nada: é uma faixa no topo, não uma janela por cima da tela. O
 *    pedido que chegou continua a um toque de distância.
 */
export function BrandTransitionNotice({
  userCreatedAt,
}: {
  userCreatedAt: string | null | undefined;
}) {
  // Começa escondida e só aparece depois de consultar o navegador. Assim o
  // servidor e o navegador desenham a mesma coisa na primeira passada, e a
  // faixa não "pisca" para quem já a fechou.
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    let fechado = false;
    try {
      fechado = localStorage.getItem(BRAND_TRANSITION.storageKey) === "1";
    } catch {
      // Navegador sem armazenamento (aba anônima restrita): mostra o aviso,
      // ele só não será lembrado.
    }
    setVisivel(
      shouldShowBrandTransitionNotice({ now: new Date(), userCreatedAt, dismissed: fechado }),
    );
  }, [userCreatedAt]);

  if (!visivel) return null;

  function fechar() {
    setVisivel(false);
    try {
      localStorage.setItem(BRAND_TRANSITION.storageKey, "1");
    } catch {
      // Sem armazenamento, o aviso volta na próxima visita. Não quebra nada.
    }
  }

  return (
    <div
      role="status"
      className="no-print flex items-start gap-3 border-b border-primary/20 bg-primary/10 px-4 py-3 sm:items-center"
    >
      <BrandSymbol decorative className="mt-0.5 h-6 shrink-0 sm:mt-0" />
      <p className="min-w-0 flex-1 text-sm text-foreground">
        <strong className="font-semibold">{BRAND_TRANSITION.title}</strong>{" "}
        <span className="text-muted-foreground">{BRAND_TRANSITION.message}</span>
      </p>
      <button
        type="button"
        onClick={fechar}
        aria-label="Fechar aviso sobre a nova marca"
        className="no-touch-min -m-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
