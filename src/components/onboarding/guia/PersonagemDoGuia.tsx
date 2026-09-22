import { memo } from "react";
import type { EmocaoDoGuia } from "@/lib/onboarding/guia/etapas";
import { POSES, PROPORCAO_DO_PERSONAGEM } from "./personagem";

/** De que lado da tela o personagem fica. */
export type PosicaoDoPersonagem = "canto-inferior-direito" | "canto-inferior-esquerdo" | "centro";

/** Para onde ele "olha" — a seta do balão sai desse lado. */
export type DirecaoDoPersonagem = "cima" | "baixo" | "esquerda" | "direita" | "nenhuma";

export type PersonagemDoGuiaProps = {
  emocao: EmocaoDoGuia;
  titulo: string;
  descricao: string;
  /** O botão principal do balão. Sem ele, o balão é só informação. */
  cta?: { rotulo: string; onClick: () => void };
  /**
   * A pergunta acima dos botões, quando a etapa oferece uma escolha em vez de
   * apontar um campo. Fica logo antes deles, e não no meio do texto, porque
   * pergunta longe da resposta é a que faz a pessoa clicar sem ter lido.
   */
  pergunta?: string;
  /** O botão alternativo, do mesmo peso do principal (ex.: "Não utilizo"). */
  alternativa?: { rotulo: string; onClick: () => void };
  /** Ação discreta ao lado do CTA (normalmente "Terminar depois"). */
  acaoSecundaria?: { rotulo: string; onClick: () => void };
  posicao?: PosicaoDoPersonagem;
  aponta?: DirecaoDoPersonagem;
  /** Conteúdo extra dentro do balão — usado para a barra de progresso. */
  children?: React.ReactNode;
};

const ONDE: Record<PosicaoDoPersonagem, string> = {
  "canto-inferior-direito": "items-end sm:flex-row",
  "canto-inferior-esquerdo": "items-start sm:flex-row-reverse",
  centro: "items-center sm:flex-row",
};

/** A seta do balão, apontando para onde o personagem indica. */
const SETA: Record<DirecaoDoPersonagem, string> = {
  cima: "before:-top-2 before:left-8 before:border-b-card before:border-t-0",
  baixo: "before:-bottom-2 before:left-8 before:border-t-card before:border-b-0",
  esquerda: "before:left-[-0.5rem] before:top-8 before:border-r-card before:border-l-0",
  direita: "before:right-[-0.5rem] before:top-8 before:border-l-card before:border-r-0",
  nenhuma: "",
};

/**
 * O personagem do FlyControl e o balão que ele fala.
 *
 * POR QUE ELE EXISTE
 *
 * Um painel cheio de abas, campos e botões, aberto pela primeira vez por
 * alguém que nunca usou um sistema de pedidos, é um cardápio de 12 páginas
 * numa língua que a pessoa não lê. O personagem é o garçom que chega na mesa
 * e diz: "começa por aqui".
 *
 * A PROPORÇÃO É RESERVADA ANTES DA IMAGEM CHEGAR
 *
 * `aspect-ratio` guarda o espaço exato do desenho. Sem isso, o balão de fala
 * pula de lugar no instante em que a figura carrega — é a mesa que alguém
 * empurra enquanto a pessoa ainda está escrevendo.
 *
 * TROCAR DE POSE NÃO MEXE AQUI
 *
 * Este componente nunca viu um nome de arquivo: ele pede uma EMOÇÃO e o mapa
 * em `personagem.ts` entrega a figura. Trocar o PNG de "sucesso" por outro
 * não encosta em uma linha deste arquivo.
 */
export const PersonagemDoGuia = memo(function PersonagemDoGuia({
  emocao,
  titulo,
  descricao,
  cta,
  pergunta,
  alternativa,
  acaoSecundaria,
  posicao = "canto-inferior-direito",
  aponta = "nenhuma",
  children,
}: PersonagemDoGuiaProps) {
  const pose = POSES[emocao] ?? POSES.neutro;

  return (
    <div className={`pointer-events-auto flex w-full flex-col gap-2 ${ONDE[posicao]}`}>
      {/* A FIGURA.
          No celular ela é pequena de propósito: o balão é que precisa de
          espaço para o texto caber sem virar três linhas de duas palavras. */}
      <div
        className="w-20 shrink-0 self-end sm:w-28 md:w-36"
        style={{ aspectRatio: String(PROPORCAO_DO_PERSONAGEM) }}
      >
        <img
          // `key` força a troca de figura a reiniciar a animação: sem ela o
          // React reaproveita a mesma tag e a pose nova entra sem transição.
          key={pose.src}
          src={pose.src}
          alt={pose.descricao}
          width={384}
          height={Math.round(384 / PROPORCAO_DO_PERSONAGEM)}
          loading="eager"
          decoding="async"
          className="h-full w-full animate-in fade-in zoom-in-95 object-contain duration-300 drop-shadow-xl"
        />
      </div>

      <div
        className={`relative min-w-0 flex-1 rounded-2xl border border-primary/25 bg-card p-4 shadow-2xl before:absolute before:h-0 before:w-0 before:border-8 before:border-transparent before:content-[''] sm:p-5 ${SETA[aponta]}`}
      >
        <h2 className="text-base font-bold leading-tight text-foreground sm:text-lg">{titulo}</h2>
        <p className="mt-1 text-sm leading-snug text-muted-foreground">{descricao}</p>

        {children}

        {pergunta && (
          <p className="mt-3 text-sm font-bold text-foreground" id="pergunta-do-guia">
            {pergunta}
          </p>
        )}

        {(cta || alternativa || acaoSecundaria) && (
          <div
            className="mt-3 flex flex-wrap items-center gap-2"
            // Amarra os botões à pergunta para quem navega por leitor de tela:
            // sem isso ele lê "Não utilizo adicionais" sem saber do quê.
            role={pergunta ? "group" : undefined}
            aria-labelledby={pergunta ? "pergunta-do-guia" : undefined}
          >
            {cta && (
              <button
                type="button"
                onClick={cta.onClick}
                // 44px é o mínimo de toque: um botão menor que isso, tocado
                // com o polegar no meio do serviço, erra.
                className="min-h-11 flex-1 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-transform hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                {cta.rotulo}
              </button>
            )}
            {alternativa && (
              // Mesmo tamanho do principal, cor mais discreta: as duas são
              // respostas legítimas. Fazer a segunda parecer um link
              // escondido é empurrar o lojista para a que o sistema prefere.
              <button
                type="button"
                onClick={alternativa.onClick}
                className="min-h-11 flex-1 rounded-xl border-2 border-border px-4 text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                {alternativa.rotulo}
              </button>
            )}
            {acaoSecundaria && (
              <button
                type="button"
                onClick={acaoSecundaria.onClick}
                className="min-h-11 rounded-xl px-3 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {acaoSecundaria.rotulo}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
