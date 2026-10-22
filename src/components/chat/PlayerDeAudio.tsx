import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { duracaoLegivel } from "@/lib/crm/midiaNavegador";

/**
 * O TOCADOR DE ÁUDIO, do jeitinho do WhatsApp.
 *
 * O tocador padrão do navegador muda de cara em cada aparelho, é minúsculo no
 * celular e não tem velocidade. Este tem:
 *
 *   - botão grande de tocar/pausar (dá para acertar com o dedão);
 *   - barra que mostra onde está e deixa pular para qualquer ponto;
 *   - "0:12 / 1:05", para saber quanto falta;
 *   - velocidade 1x → 1,5x → 2x, para o cliente que manda áudio de 3 minutos;
 *   - pausar e voltar continua de onde parou; no fim, o botão vira "ouvir de
 *     novo".
 *
 * O MESMO TOCADOR serve para o áudio que chegou e para a prévia do áudio que
 * o lojista acabou de gravar, antes de mandar.
 */

const VELOCIDADES = [1, 1.5, 2];

export function PlayerDeAudio({
  src,
  claro = false,
  tocarAoAbrir = false,
  onErro,
}: {
  src: string;
  /**
   * Começa a tocar sozinho assim que abrir. Usado quando a pessoa apertou
   * "tocar" num áudio que ainda estava sendo trazido do WhatsApp — ela já
   * pediu para ouvir, não precisa apertar duas vezes.
   */
  tocarAoAbrir?: boolean;
  /** Balão de cor forte: os detalhes precisam ser claros para aparecer. */
  claro?: boolean;
  /** O endereço não abriu (venceu, sumiu, formato estranho). */
  onErro?: () => void;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState(false);
  const [terminou, setTerminou] = useState(false);
  const [posicao, setPosicao] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [velocidade, setVelocidade] = useState(1);
  const consertandoDuracao = useRef(false);

  // Trocar de áudio (ex.: endereço renovado) volta tudo para o começo.
  useEffect(() => {
    setTocando(false);
    setTerminou(false);
    setPosicao(0);
    setDuracao(0);
  }, [src]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = velocidade;
  }, [velocidade]);

  useEffect(() => {
    if (!tocarAoAbrir) return;
    // O navegador pode recusar tocar sem um clique recente. Tudo bem: o botão
    // de tocar está ali, e recusar aqui não é erro do arquivo.
    audio.current?.play().catch(() => undefined);
  }, [tocarAoAbrir, src]);

  function aoCarregar() {
    const a = audio.current;
    if (!a) return;
    // O áudio gravado pelo Chrome (webm) nasce SEM duração ("infinito") até
    // ser lido até o fim. O truque conhecido: pular para o fim, o navegador
    // descobre a duração, e voltamos para o começo.
    if (!Number.isFinite(a.duration)) {
      consertandoDuracao.current = true;
      a.currentTime = 1e101;
      return;
    }
    setDuracao(a.duration);
  }

  function aoAndar() {
    const a = audio.current;
    if (!a) return;
    if (consertandoDuracao.current) {
      consertandoDuracao.current = false;
      if (Number.isFinite(a.duration)) setDuracao(a.duration);
      a.currentTime = 0;
      return;
    }
    setPosicao(a.currentTime);
    if (Number.isFinite(a.duration) && a.duration !== duracao) setDuracao(a.duration);
  }

  async function alternar() {
    const a = audio.current;
    if (!a) return;
    if (tocando) {
      a.pause();
      return;
    }
    if (terminou) {
      a.currentTime = 0;
      setTerminou(false);
    }
    try {
      await a.play();
    } catch {
      onErro?.();
    }
  }

  function pular(valor: number) {
    const a = audio.current;
    if (!a || !Number.isFinite(valor)) return;
    a.currentTime = valor;
    setPosicao(valor);
    setTerminou(false);
  }

  const corTexto = claro ? "text-white/90" : "text-muted-foreground";
  const corBotao = claro
    ? "bg-white/20 text-white hover:bg-white/30"
    : "bg-primary text-primary-foreground hover:bg-primary/90";
  const total = duracao > 0 ? duracao : 0;

  return (
    <div
      className="mb-1 flex w-[240px] max-w-full items-center gap-2 sm:w-[280px]"
      data-testid="player-audio"
    >
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={aoCarregar}
        onTimeUpdate={aoAndar}
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => {
          setTocando(false);
          setTerminou(true);
        }}
        onError={() => onErro?.()}
        className="hidden"
      >
        <track kind="captions" />
      </audio>

      <button
        type="button"
        onClick={() => void alternar()}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full shadow-sm transition-colors ${corBotao}`}
        aria-label={tocando ? "Pausar áudio" : terminou ? "Ouvir de novo" : "Tocar áudio"}
        title={tocando ? "Pausar" : terminou ? "Ouvir de novo" : "Tocar"}
      >
        {tocando ? (
          <Pause className="h-4 w-4" aria-hidden="true" />
        ) : terminou ? (
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Play className="ml-0.5 h-4 w-4" aria-hidden="true" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={total || 1}
          step={0.1}
          value={Math.min(posicao, total || 1)}
          onChange={(e) => pular(Number(e.target.value))}
          disabled={!total}
          aria-label="Posição do áudio"
          className={`h-1.5 w-full cursor-pointer ${claro ? "accent-white" : "accent-primary"}`}
        />
        <div
          className={`mt-0.5 flex items-center justify-between text-[11px] font-semibold tabular-nums ${corTexto}`}
        >
          <span>
            {duracaoLegivel(posicao)}
            {total ? ` / ${duracaoLegivel(total)}` : ""}
          </span>
          <button
            type="button"
            onClick={() =>
              setVelocidade((v) => VELOCIDADES[(VELOCIDADES.indexOf(v) + 1) % VELOCIDADES.length])
            }
            className="rounded px-1 font-bold hover:underline"
            aria-label={`Velocidade ${velocidade}x. Clique para mudar.`}
            title="Velocidade"
          >
            {String(velocidade).replace(".", ",")}x
          </button>
        </div>
      </div>
    </div>
  );
}
