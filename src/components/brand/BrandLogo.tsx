import { useId } from "react";
import simbolo from "@/assets/brand/flydelivery-simbolo.webp";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { LETREIRO_DELIVERY, LETREIRO_FLY, LETREIRO_VIEWBOX } from "./letreiro";

/**
 * O logotipo do FlyDelivery — a ÚNICA forma de colocar a marca numa tela.
 *
 * Antes, cada tela importava o arquivo da logo e escolhia o próprio tamanho;
 * eram dez telas, dez jeitos. Agora todas pedem a marca aqui, e ela sai igual
 * em todo lugar — o mesmo uniforme para a equipe inteira.
 *
 * AS PEÇAS
 *
 *  - `symbol`     só o símbolo (o laço com a cloche e a pizza);
 *  - `wordmark`   só o letreiro "FLY DELIVERY";
 *  - `horizontal` símbolo ao lado do letreiro — cabeçalhos e menus;
 *  - `stacked`    símbolo em cima, letreiro embaixo — login e telas de entrada.
 *
 * CLARO E ESCURO SEM DOIS ARQUIVOS
 *
 * O símbolo é laranja e funciona nos dois fundos. No letreiro, "FLY" é sempre
 * laranja e "DELIVERY" usa a cor do texto ao redor: escuro em fundo claro,
 * branco em fundo escuro. Para forçar um dos dois (uma faixa sempre escura,
 * por exemplo), passe `tone`.
 *
 * O tamanho é dado pela ALTURA (`className="h-10"`); a largura acompanha.
 */

type Variant = "symbol" | "wordmark" | "horizontal" | "stacked";
type Tone = "auto" | "onLight" | "onDark";

/** Proporção do símbolo (largura ÷ altura) — evita a tela "pular" ao carregar. */
const SIMBOLO_LARGURA = 640;
const SIMBOLO_ALTURA = 262;

const COR_DO_TOM: Record<Tone, string | undefined> = {
  auto: undefined,
  onLight: "#101828",
  onDark: "#FFFFFF",
};

export function BrandSymbol({
  className,
  decorative = false,
  eager = false,
}: {
  className?: string;
  /** `true` quando o nome já está escrito ao lado — o leitor de tela não repete. */
  decorative?: boolean;
  /** `true` para a logo do topo da página: carrega junto, sem esperar. */
  eager?: boolean;
}) {
  return (
    <img
      src={simbolo}
      width={SIMBOLO_LARGURA}
      height={SIMBOLO_ALTURA}
      alt={decorative ? "" : BRAND.name}
      aria-hidden={decorative || undefined}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={cn("w-auto select-none object-contain", className)}
    />
  );
}

export function BrandWordmark({
  className,
  tone = "auto",
  decorative = false,
}: {
  className?: string;
  tone?: Tone;
  decorative?: boolean;
}) {
  // Cada letreiro na tela precisa do seu próprio degradê: dois com o mesmo
  // nome, e esconder um (menu do celular fechado) apagaria a cor do outro.
  const gradiente = `fd-fly-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg
      viewBox={LETREIRO_VIEWBOX}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : BRAND.name}
      aria-hidden={decorative || undefined}
      className={cn("w-auto shrink-0", className)}
      style={{ color: COR_DO_TOM[tone] }}
    >
      <defs>
        <linearGradient id={gradiente} x1="0" y1="-70" x2="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFA41F" />
          <stop offset="1" stopColor="#FF5A1F" />
        </linearGradient>
      </defs>
      <path fill={`url(#${gradiente})`} d={LETREIRO_FLY} />
      <path fill="currentColor" d={LETREIRO_DELIVERY} />
    </svg>
  );
}

export function BrandLogo({
  variant = "horizontal",
  tone = "auto",
  className,
  eager = false,
}: {
  variant?: Variant;
  tone?: Tone;
  /** Define a ALTURA do conjunto (ex.: `h-10`). */
  className?: string;
  eager?: boolean;
}) {
  if (variant === "symbol") return <BrandSymbol className={className} eager={eager} />;
  if (variant === "wordmark") return <BrandWordmark className={className} tone={tone} />;

  if (variant === "stacked") {
    return (
      <span
        role="img"
        aria-label={BRAND.name}
        className={cn("inline-flex flex-col items-center justify-between", className)}
      >
        <BrandSymbol decorative eager={eager} className="h-[64%]" />
        <BrandWordmark decorative tone={tone} className="h-[22%]" />
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={BRAND.name}
      className={cn("inline-flex items-center gap-2", className)}
    >
      <BrandSymbol decorative eager={eager} className="h-full" />
      {/* O letreiro é mais baixo que o símbolo de propósito: na arte oficial
          ele tem pouco mais da metade da altura do laço. */}
      <BrandWordmark decorative tone={tone} className="h-[52%]" />
    </span>
  );
}

/**
 * A marca para PAPEL: uma cor só, sem degradê nem foto.
 *
 * Usada no rodapé da comanda. Impressora térmica só conhece "queimar" ou "não
 * queimar" o ponto — cor e brilho viram mancha. Aqui o símbolo é o laço em
 * traço e o letreiro inteiro sai na cor do texto (preto no papel).
 */
export function BrandPrintLogo({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label={BRAND.name}
      className={cn("flex items-center justify-center gap-1.5", className)}
    >
      <svg viewBox="0 0 64 34" aria-hidden="true" className="h-full w-auto shrink-0">
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path
            strokeWidth="6"
            d="M38.5 17c-4-6.8-7.800-10.500-12.500-10.500-5.200 0-9 4.300-9 10.500s3.800 10.500 9 10.500c4.700 0 8.500-3.700 12.500-10.500s7.800-10.500 12.500-10.500c5.200 0 9 4.300 9 10.500s-3.800 10.500-9 10.500c-4.700 0-8.500-3.700-12.500-10.500z"
          />
          <path strokeWidth="3.5" d="M4 9h6.500M2.500 17h5.500M4 25h6.500" />
        </g>
      </svg>
      <svg viewBox={LETREIRO_VIEWBOX} aria-hidden="true" className="h-[70%] w-auto shrink-0">
        <path fill="currentColor" d={LETREIRO_FLY} />
        <path fill="currentColor" d={LETREIRO_DELIVERY} />
      </svg>
    </span>
  );
}
