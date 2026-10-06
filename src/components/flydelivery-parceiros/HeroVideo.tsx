import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import videoMp4 from "@/assets/flydelivery-parceiros/hero-loop.mp4";
import videoWebm from "@/assets/flydelivery-parceiros/hero-loop.webm";
import posterUrl from "@/assets/flydelivery-parceiros/hero-poster.webp";

/**
 * A animação do Hero: hambúrguer → painel de pedidos → hambúrguer → app.
 *
 * O ARQUIVO
 *
 * O vídeo original (guardado intacto em docs/flydelivery-parceiros/) é uma
 * tela de site inteira: já vem com menu, título e botões desenhados dentro
 * dele. Se fosse colocado inteiro aqui, a pessoa leria o título duas vezes —
 * uma no texto da página e outra dentro do vídeo. Por isso a versão do site é
 * só o lado direito do quadro, onde a animação acontece. Nada foi redesenhado:
 * é o mesmo vídeo, enquadrado. Também saiu o áudio (o vídeo toca sempre mudo)
 * — de 3 MB para cerca de 0,8 MB.
 *
 * São duas versões do mesmo recorte: MP4, que quase todo navegador toca (e é
 * a de melhor imagem pelo mesmo peso), e WebM, de reserva, para os poucos
 * navegadores que não tocam MP4. Cada aparelho baixa UMA só — a que ele toca.
 *
 * A ORDEM DE CARREGAMENTO
 *
 * 1. A página chega com a FOTO do primeiro quadro (leve, cerca de 48 KB).
 *    É ela que aparece primeiro e conta como "a página carregou".
 * 2. Só depois que o resto da página terminou de carregar, o vídeo começa a
 *    baixar — ele não disputa a internet com o texto e os botões.
 * 3. Quando o vídeo de fato começa a tocar, ele aparece por cima da foto, num
 *    degradê. Como o primeiro quadro É a foto, ninguém percebe a troca.
 *
 * É como servir o couvert enquanto o prato principal termina: a mesa nunca
 * fica vazia, e a cozinha não atrasa os outros pedidos por causa dele.
 *
 * QUANDO O VÍDEO NÃO TOCA (e a foto fica)
 *
 * - O aparelho pediu menos movimento (acessibilidade).
 * - O aparelho está em modo de economia de dados.
 * - O navegador bloqueou (ex.: iPhone em modo de pouca bateria).
 * Em todos esses casos a foto continua lá, inteira. Não aparece botão de
 * play, tela preta nem aviso.
 *
 * O vídeo pausa sozinho quando sai da tela e volta quando a pessoa rola de
 * volta — ninguém gasta bateria com animação que não está vendo.
 */
export function HeroVideo({ className = "" }: { className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [tocando, setTocando] = useState(false);
  const [podeTocar, setPodeTocar] = useState(false);
  const [pausadoPelaPessoa, setPausadoPelaPessoa] = useState(false);
  const pausadoRef = useRef(false);

  useEffect(() => {
    const el = video.current;
    if (!el) return;

    const menosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conexao = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (menosMovimento || conexao?.saveData) return;

    // Garantia extra: o iPhone só deixa tocar sozinho se o vídeo estiver mudo
    // na propriedade E no atributo.
    el.muted = true;
    el.defaultMuted = true;
    el.setAttribute("muted", "");

    let naTela = true;
    let carregado = false;
    let cancelado = false;

    const tocar = () => {
      if (cancelado || !naTela || pausadoRef.current) return;
      el.play().catch(() => {
        // Bloqueado pelo navegador: a foto continua. Nada a fazer.
      });
    };

    const carregar = () => {
      if (cancelado || carregado) return;
      carregado = true;
      const arquivo = escolherArquivo(el);
      if (!arquivo) return; // Nenhum formato serve: a foto fica.
      el.src = arquivo;
      setPodeTocar(true);
      tocar();
    };

    const quandoOcioso = () => {
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      };
      if (w.requestIdleCallback) w.requestIdleCallback(carregar, { timeout: 1500 });
      else window.setTimeout(carregar, 300);
    };

    if (document.readyState === "complete") quandoOcioso();
    else window.addEventListener("load", quandoOcioso, { once: true });

    const aoTocar = () => setTocando(true);
    el.addEventListener("playing", aoTocar);

    const observador =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            ([e]) => {
              naTela = e.isIntersecting;
              if (!carregado) return;
              if (naTela) tocar();
              else el.pause();
            },
            { threshold: 0.1 },
          );
    observador?.observe(el);

    return () => {
      cancelado = true;
      window.removeEventListener("load", quandoOcioso);
      el.removeEventListener("playing", aoTocar);
      observador?.disconnect();
      el.pause();
    };
  }, []);

  const alternarPausa = () => {
    const el = video.current;
    if (!el) return;
    const pausar = !pausadoRef.current;
    pausadoRef.current = pausar;
    setPausadoPelaPessoa(pausar);
    if (pausar) el.pause();
    else el.play().catch(() => {});
  };

  return (
    <div className={`relative ${className}`}>
      <div
        className="fdp-video-moldura relative aspect-[744/640] w-full"
        role="img"
        aria-label="Animação: um hambúrguer se transforma no painel de pedidos do FlyDelivery Parceiros e depois no aplicativo FlyDelivery aberto no celular."
      >
        {/* A foto do primeiro quadro: aparece na hora e segura o lugar do vídeo,
          então nada na página "pula" quando o vídeo chega. */}
        <img
          src={posterUrl}
          alt=""
          width={744}
          height={640}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Sem `src` no HTML: o navegador não baixa nada até o código acima
          mandar. Sem controles, sem tela cheia, sem "transmitir para TV". */}
        <video
          ref={video}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
          style={{ opacity: tocando ? 1 : 0 }}
          muted
          loop
          playsInline
          preload="none"
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      {/* Só aparece para quem chega pelo teclado (Tab). Quem usa mouse ou
          dedo nunca vê controle sobre o vídeo. */}
      {podeTocar && (
        <button
          type="button"
          onClick={alternarPausa}
          className="fdp-pausa inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-md"
          style={{ color: "var(--fdp-texto)" }}
        >
          {pausadoPelaPessoa ? (
            <>
              <Play className="h-4 w-4" aria-hidden /> Retomar animação
            </>
          ) : (
            <>
              <Pause className="h-4 w-4" aria-hidden /> Pausar animação
            </>
          )}
        </button>
      )}
    </div>
  );
}

/** MP4 primeiro (melhor imagem pelo peso); WebM só se o MP4 não tocar. */
function escolherArquivo(el: HTMLVideoElement): string | null {
  if (el.canPlayType('video/mp4; codecs="avc1.640028"')) return videoMp4;
  if (el.canPlayType('video/webm; codecs="vp9"')) return videoWebm;
  return null;
}
