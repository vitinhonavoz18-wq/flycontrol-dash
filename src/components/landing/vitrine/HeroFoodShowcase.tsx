import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChartColumnIncreasing, MapPin, Scooter, Store, type LucideIcon } from "lucide-react";
import { FloatingNotification } from "@/components/landing/FloatingNotification";
import { useMenosAnimacao } from "@/components/landing/useMenosAnimacao";
import {
  DURACAO_DA_TROCA_MS,
  INTERVALO_DA_VITRINE_MS,
  larguraNormalizada,
  montarSequencia,
  type ItemDaVitrine,
} from "@/lib/vitrine/vitrine";
import { useHeroProducts } from "./useHeroProducts";
import { useProductRotation, useVitrineVisivel } from "./useProductRotation";

/**
 * A VITRINE DO TOPO DO SITE.
 *
 * Um alimento de verdade, recortado, flutuando no ar e trocando a cada 3
 * segundos por outro produto dos cardápios do FlyDelivery: hambúrguer,
 * pizza, açaí, pastel... Em volta, os ícones da plataforma e os avisos de
 * pedido, cada um no seu ritmo.
 *
 * COMO É MONTADA, DE TRÁS PARA FRENTE
 *
 *   brilho laranja → metade de trás da órbita → sombra → alimento →
 *   metade da frente da órbita → faíscas → ícones → avisos
 *
 * A órbita é desenhada em duas metades justamente para passar POR TRÁS do
 * alimento em cima e NA FRENTE dele embaixo — é o que dá a sensação de
 * profundidade sem nenhum 3D pesado.
 *
 * O QUE ELA NÃO FAZ
 *
 * Não gira a foto em 360°. Uma foto é plana: girá-la de lado mostraria o
 * lanche achatado e depois espelhado, o que tira a vontade de comer. O
 * movimento é flutuar, balançar alguns graus e responder levemente ao mouse.
 *
 * CUIDADOS
 *
 *   • Só anima posição, giro e transparência — o que a placa de vídeo faz
 *     sozinha, sem pesar na rolagem.
 *   • Para quando a aba está escondida ou a vitrine saiu da tela.
 *   • Quem pediu "menos movimento" no aparelho vê o alimento parado.
 *   • Imagem que não carrega sai da roda; se nenhuma carregar, fica o
 *     hambúrguer da marca, que vem junto com o site.
 */

/** Altura ÷ largura da área da vitrine — igual à proporção da arte original. */
const PROPORCAO = 0.92;
/** Altura (em % da vitrine) onde fica o centro do alimento. */
const CENTRO_Y = 47;

type Camada = { item: ItemDaVitrine; chave: string; saindo: boolean };

function larguraDoArquivoPequeno(item: ItemDaVitrine): number {
  const maior = Math.max(item.largura, item.altura);
  return maior > 640 ? Math.round((item.largura * 640) / maior) : item.largura;
}

export function HeroFoodShowcase() {
  const raiz = useRef<HTMLDivElement>(null);
  const menosAnimacao = useMenosAnimacao();
  const visivel = useVitrineVisivel(raiz);
  const { itens } = useHeroProducts();
  const [quebrados, setQuebrados] = useState<ReadonlySet<string>>(() => new Set());

  const sequencia = useMemo(() => montarSequencia(itens, quebrados), [itens, quebrados]);
  const ativo = visivel && !menosAnimacao;
  const atual = useProductRotation(sequencia, {
    intervaloMs: INTERVALO_DA_VITRINE_MS,
    ativo,
    removidos: quebrados,
  });
  const indice = Math.max(
    0,
    sequencia.findIndex((it) => it.id === atual.id),
  );

  // ── Troca: o produto que sai continua na tela enquanto se dissolve ──────
  const [camadas, setCamadas] = useState<Camada[]>(() => [
    { item: atual, chave: `${atual.id}-0`, saindo: false },
  ]);
  const contador = useRef(0);
  useEffect(() => {
    setCamadas((antes) => {
      const visivelAgora = antes.find((c) => !c.saindo);
      if (visivelAgora?.item.id === atual.id) return antes;
      contador.current += 1;
      return [
        ...(visivelAgora ? [{ ...visivelAgora, saindo: true }] : []),
        { item: atual, chave: `${atual.id}-${contador.current}`, saindo: false },
      ];
    });
    const limpeza = window.setTimeout(
      () => setCamadas((antes) => antes.filter((c) => !c.saindo)),
      DURACAO_DA_TROCA_MS + 50,
    );
    return () => window.clearTimeout(limpeza);
  }, [atual]);

  // ── Os dois próximos já ficam baixados ──────────────────────────────────
  useEffect(() => {
    if (sequencia.length < 2) return;
    const imagens: HTMLImageElement[] = [];
    for (let passo = 1; passo <= 2; passo++) {
      const proximo = sequencia[(indice + passo) % sequencia.length];
      if (!proximo || proximo.id === atual.id) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = window.innerWidth < 768 ? proximo.imagemPequena : proximo.imagem;
      imagens.push(img);
    }
    return () => {
      for (const img of imagens) img.src = "";
    };
  }, [sequencia, indice, atual.id]);

  // ── Mouse: um leve deslocamento em profundidade (só computador) ─────────
  useEffect(() => {
    const el = raiz.current;
    if (!el || menosAnimacao) return;
    const consulta = window.matchMedia("(pointer: fine) and (min-width: 1024px)");
    if (!consulta.matches) return;
    const alvo = { x: 0, y: 0 };
    const agora = { x: 0, y: 0 };
    let quadro = 0;
    const desenhar = () => {
      agora.x += (alvo.x - agora.x) * 0.08;
      agora.y += (alvo.y - agora.y) * 0.08;
      el.style.setProperty("--px", agora.x.toFixed(4));
      el.style.setProperty("--py", agora.y.toFixed(4));
      if (Math.abs(alvo.x - agora.x) > 0.001 || Math.abs(alvo.y - agora.y) > 0.001) {
        quadro = requestAnimationFrame(desenhar);
      } else {
        quadro = 0;
      }
    };
    const pedir = () => {
      if (!quadro) quadro = requestAnimationFrame(desenhar);
    };
    // O movimento é medido na seção inteira do topo, para responder também
    // quando o mouse está perto dos botões — mas sem nunca interferir neles:
    // aqui só se lê a posição, nenhum clique é capturado.
    const secao = el.closest("section") ?? el;
    const aoMover = (e: Event) => {
      const p = e as PointerEvent;
      const caixa = el.getBoundingClientRect();
      alvo.x = Math.max(
        -1,
        Math.min(1, (p.clientX - (caixa.left + caixa.width / 2)) / caixa.width),
      );
      alvo.y = Math.max(
        -1,
        Math.min(1, (p.clientY - (caixa.top + caixa.height / 2)) / caixa.height),
      );
      pedir();
    };
    const aoSair = () => {
      alvo.x = 0;
      alvo.y = 0;
      pedir();
    };
    secao.addEventListener("pointermove", aoMover);
    secao.addEventListener("pointerleave", aoSair);
    return () => {
      cancelAnimationFrame(quadro);
      secao.removeEventListener("pointermove", aoMover);
      secao.removeEventListener("pointerleave", aoSair);
    };
  }, [menosAnimacao]);

  const larguraAtual = larguraNormalizada(atual, PROPORCAO);
  const alturaAtual = larguraAtual / (atual.largura / atual.altura) / PROPORCAO;

  return (
    <div
      ref={raiz}
      className="vitrine relative mx-auto aspect-[1/0.92] w-full max-w-[600px] select-none lg:max-w-none"
      data-pausado={ativo ? undefined : "sim"}
      data-testid="vitrine"
      data-produto={atual.id}
    >
      {/* Brilho laranja que "respira" atrás de tudo. Gradiente, não
          desfoque: desenhado uma vez, sem custo por quadro. */}
      <div aria-hidden="true" className="vitrine-brilho absolute inset-[4%]" />

      <Orbita metade="tras" />

      {/* Sombra no "chão": acompanha a flutuação (mais alto, mais suave). */}
      <div
        aria-hidden="true"
        className="vitrine-p absolute"
        style={
          {
            "--prof": 6,
            left: "50%",
            top: `${Math.min(92, CENTRO_Y + alturaAtual / 2 - 1)}%`,
            width: `${larguraAtual * 0.78}%`,
            height: "7%",
            transform: "translate(-50%, -50%)",
            transition: "top .6s ease, width .6s ease",
          } as CSSProperties
        }
      >
        <div className="vitrine-sombra h-full w-full" />
      </div>

      {/* O alimento. Camadas: profundidade (mouse) → flutuação → balanço. */}
      <div className="vitrine-p absolute inset-0" style={{ "--prof": 14 } as CSSProperties}>
        <div className="vitrine-flutua absolute inset-0">
          <div
            className="vitrine-gira absolute inset-0"
            style={{ transformOrigin: `50% ${CENTRO_Y}%` }}
          >
            {camadas.map((c) => (
              <AnimatedFoodItem
                key={c.chave}
                item={c.item}
                saindo={c.saindo}
                prioridade={c.item.id === sequencia[0]?.id}
                aoQuebrar={(id) =>
                  setQuebrados((antes) => (antes.has(id) ? antes : new Set(antes).add(id)))
                }
              />
            ))}
          </div>
        </div>
      </div>

      <Orbita metade="frente" />

      <FloatingHeroElements />
    </div>
  );
}

/**
 * Um alimento na vitrine. Fica invisível até a imagem terminar de carregar
 * (nada de meio-lanche aparecendo aos pedaços) e então entra com uma leve
 * rotação e aumento. Se a imagem falhar, avisa a vitrine e não aparece.
 */
function AnimatedFoodItem({
  item,
  saindo,
  prioridade,
  aoQuebrar,
}: {
  item: ItemDaVitrine;
  saindo: boolean;
  prioridade: boolean;
  aoQuebrar: (id: string) => void;
}) {
  const [carregou, setCarregou] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const largura = larguraNormalizada(item, PROPORCAO);
  const pequena = larguraDoArquivoPequeno(item);

  // A imagem pode já estar pronta antes do React ligar o "onLoad" (veio do
  // cache ou do próprio HTML do servidor).
  useEffect(() => {
    const el = img.current;
    if (el?.complete) {
      if (el.naturalWidth > 0) setCarregou(true);
      else aoQuebrar(item.id);
    }
  }, [item.id, aoQuebrar]);

  return (
    <div
      className="absolute"
      style={{
        left: "50%",
        top: `${CENTRO_Y}%`,
        width: `${largura}%`,
        transform: "translate(-50%, -50%)",
        transition: "width .6s ease",
      }}
    >
      <img
        ref={img}
        src={item.imagem}
        srcSet={
          item.imagemPequena !== item.imagem
            ? `${item.imagemPequena} ${pequena}w, ${item.imagem} ${item.largura}w`
            : undefined
        }
        sizes="(max-width: 1023px) 70vw, 34vw"
        width={item.largura}
        height={item.altura}
        alt={saindo ? "" : item.nome}
        aria-hidden={saindo || undefined}
        draggable={false}
        loading="eager"
        decoding="async"
        fetchPriority={prioridade ? "high" : "auto"}
        onLoad={() => setCarregou(true)}
        onError={() => aoQuebrar(item.id)}
        className={`vitrine-alimento block h-auto w-full ${
          saindo ? "vitrine-sai" : carregou ? "vitrine-entra" : "opacity-0"
        }`}
        data-testid={saindo ? undefined : "vitrine-produto"}
      />
    </div>
  );
}

/**
 * A órbita laranja em volta do alimento, em duas metades: a de trás passa
 * atrás dele, a da frente passa na frente. Um ponto de luz percorre o
 * caminho devagar.
 */
function Orbita({ metade }: { metade: "tras" | "frente" }) {
  const id = `vitrine-orbita-${metade}`;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1000 920"
      className="vitrine-p pointer-events-none absolute inset-0 h-full w-full"
      style={{ "--prof": metade === "tras" ? 8 : 20 } as CSSProperties}
    >
      <defs>
        <linearGradient id={`${id}-cor`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FF8A3D" stopOpacity=".15" />
          <stop offset=".5" stopColor="#FF6B35" stopOpacity=".9" />
          <stop offset="1" stopColor="#FFB020" stopOpacity=".35" />
        </linearGradient>
        <clipPath id={`${id}-corte`} clipPathUnits="userSpaceOnUse">
          {metade === "tras" ? (
            <rect x="-100" y="-100" width="1200" height="570" />
          ) : (
            <rect x="-100" y="470" width="1200" height="600" />
          )}
        </clipPath>
      </defs>
      <g transform="rotate(-12 500 470)">
        <g clipPath={`url(#${id}-corte)`}>
          <ellipse
            cx="500"
            cy="470"
            rx="468"
            ry="172"
            fill="none"
            stroke="#FF6B35"
            strokeOpacity=".1"
            strokeWidth="14"
          />
          <ellipse
            cx="500"
            cy="470"
            rx="468"
            ry="172"
            fill="none"
            stroke={`url(#${id}-cor)`}
            strokeWidth="3"
          />
          <ellipse
            className="vitrine-cometa"
            cx="500"
            cy="470"
            rx="468"
            ry="172"
            fill="none"
            stroke="#FFD08A"
            strokeWidth="5"
            strokeLinecap="round"
            pathLength={1000}
            strokeDasharray="60 940"
          />
        </g>
      </g>
    </svg>
  );
}

const ICONES: {
  Icone: LucideIcon;
  rotulo: string;
  x: number;
  y: number;
  giro: number;
  duracao: number;
  atraso: number;
  prof: number;
}[] = [
  { Icone: Scooter, rotulo: "Entrega", x: 9, y: 14, giro: -7, duracao: 5.6, atraso: 0, prof: 26 },
  {
    Icone: MapPin,
    rotulo: "Localização",
    x: 85,
    y: 6,
    giro: 6,
    duracao: 6.4,
    atraso: 0.8,
    prof: 30,
  },
  {
    Icone: ChartColumnIncreasing,
    rotulo: "Desempenho",
    x: 1,
    y: 50,
    giro: -5,
    duracao: 7.1,
    atraso: 1.5,
    prof: 22,
  },
  { Icone: Store, rotulo: "Loja", x: 88, y: 58, giro: 7, duracao: 5.9, atraso: 0.4, prof: 28 },
];

/** Posições das faíscas (em % da vitrine) — poucas, de propósito. */
const FAISCAS = [
  [16, 30, 0],
  [24, 72, 1.2],
  [78, 20, 2.1],
  [92, 40, 0.6],
  [70, 82, 1.7],
  [6, 78, 2.6],
  [56, 10, 0.9],
  [96, 76, 3.1],
  [36, 88, 2.3],
] as const;

/** Ícones da plataforma, faíscas e avisos de pedido em volta do alimento. */
function FloatingHeroElements() {
  return (
    <>
      {FAISCAS.map(([x, y, atraso], i) => (
        <span
          key={i}
          aria-hidden="true"
          className="vitrine-faisca absolute rounded-full"
          style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${atraso}s` }}
        />
      ))}

      {ICONES.map(({ Icone, rotulo, x, y, giro, duracao, atraso, prof }) => (
        <div
          key={rotulo}
          aria-hidden="true"
          className="vitrine-p absolute"
          style={{ left: `${x}%`, top: `${y}%`, "--prof": prof } as CSSProperties}
        >
          <div
            className="vitrine-boia"
            style={{ animationDuration: `${duracao}s`, animationDelay: `${-atraso}s` }}
          >
            <div className="vitrine-icone" style={{ transform: `rotate(${giro}deg)` }}>
              <Icone strokeWidth={2.1} />
            </div>
          </div>
        </div>
      ))}

      {/* Dois avisos, não seis: sugerem que o sistema está vivo. */}
      <FloatingNotification
        titulo="Novo pedido recebido"
        detalhe="Pedido #1842 · 3 itens"
        className="vitrine-p left-[2%] top-[2%] xl:-left-[4%]"
        profundidade={18}
        duracao={6.2}
      />
      <FloatingNotification
        titulo="Pedido confirmado"
        detalhe="Saiu para entrega"
        className="vitrine-p bottom-[6%] right-[0%] xl:-right-[3%]"
        profundidade={24}
        duracao={7.4}
        atraso={1.6}
      />
    </>
  );
}
