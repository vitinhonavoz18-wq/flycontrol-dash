import { useCallback, useEffect, useRef, useState } from "react";

/**
 * O "maestro" dos vídeos da vitrine.
 *
 * O que ele garante, e por quê:
 *
 * 1. NADA é baixado antes da hora. O vídeo só recebe o endereço quando o card
 *    chega perto da tela. Antes disso, só a foto de capa (poster, ~50 KB).
 *    Doze vídeos baixando juntos na abertura seriam ~25 MB — no 4G, a página
 *    principal ficaria esperando a vitrine.
 *
 * 2. UM vídeo tocando por vez: o mais visível. Decodificar vários vídeos ao
 *    mesmo tempo é o que fazia a apresentação antiga travar em celular
 *    simples — como uma cozinha com uma boca de fogão tentando cozinhar doze
 *    pratos ao mesmo tempo.
 *
 * 3. Saiu da tela ou trocou de aba: pausa. Card desmontado: o vídeo devolve
 *    a memória ao navegador.
 *
 * 4. Quem pediu "reduzir movimento" no aparelho ou ligou a economia de dados
 *    não recebe vídeo tocando sozinho: vê a foto e um botão de play.
 */

export type EstadoVideo = "parado" | "carregando" | "tocando" | "pausado" | "erro";

type Membro = { razao: number; bloqueado: boolean; tocar: () => void; pausar: () => void };
const membros = new Map<number, Membro>();
let proximoId = 1;
let suspenso = false;

/** Com a demonstração ampliada aberta, os cards param — dois vídeos ao mesmo tempo, nunca. */
export function suspenderVitrine(valor: boolean) {
  suspenso = valor;
  decidir();
}

function decidir() {
  const escondido =
    suspenso || (typeof document !== "undefined" && document.visibilityState === "hidden");
  let melhor: Membro | null = null;
  for (const m of membros.values()) {
    if (m.bloqueado || m.razao < 0.55 || escondido) continue;
    if (!melhor || m.razao > melhor.razao) melhor = m;
  }
  for (const m of membros.values()) (m === melhor ? m.tocar : m.pausar)();
}

if (typeof document !== "undefined") document.addEventListener("visibilitychange", decidir);

function preferePoucoMovimento(): boolean {
  if (typeof window === "undefined") return true;
  const reduzir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const economia = Boolean(
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
  );
  return reduzir || economia;
}

export function useVideoNaTela(fontes: { mp4: string; webm: string | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const caixaRef = useRef<HTMLDivElement | null>(null);
  const [estado, setEstado] = useState<EstadoVideo>("parado");
  // WebM (menor) quando o navegador toca; senão MP4, que toca em todos.
  const fonteRef = useRef(fontes.mp4);
  const [autoplay, setAutoplay] = useState(true);
  const [id] = useState(() => proximoId++);

  const tocar = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.paused) return;
    if (!v.getAttribute("src")) v.src = fonteRef.current;
    v.muted = true;
    v.play().catch(() => setEstado((e) => (e === "erro" ? e : "pausado")));
  }, []);
  const pausar = useCallback(() => {
    const v = videoRef.current;
    if (v && !v.paused) v.pause();
  }, []);

  // inscrição no maestro
  useEffect(() => {
    const teste = document.createElement("video");
    fonteRef.current =
      fontes.webm && teste.canPlayType('video/webm; codecs="vp9"') ? fontes.webm : fontes.mp4;
    const auto = !preferePoucoMovimento();
    setAutoplay(auto);
    membros.set(id, { razao: 0, bloqueado: !auto, tocar, pausar });
    return () => {
      membros.delete(id);
      decidir();
    };
  }, [id, tocar, pausar, fontes.webm, fontes.mp4]);

  // quanto do card está visível
  useEffect(() => {
    const el = caixaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const perto = new IntersectionObserver(
      (e) => {
        const v = videoRef.current;
        if (e.some((x) => x.isIntersecting) && v) {
          // perto da tela: só os metadados (poucos KB); o vídeo baixa ao tocar
          if (!v.getAttribute("src")) {
            v.preload = "metadata";
            v.src = fonteRef.current;
          }
          perto.disconnect();
        }
      },
      { rootMargin: "250px" },
    );
    const visivel = new IntersectionObserver(
      (e) => {
        const m = membros.get(id);
        if (!m) return;
        // No celular o card (9:16) pode ser mais alto que a tela: nunca
        // chegaria a "55% visível". Por isso vale também quanto da TELA ele
        // ocupa — o que estiver mais presente para quem olha, toca.
        const e0 = e[e.length - 1];
        const alturaTela = e0.rootBounds?.height || window.innerHeight || 1;
        m.razao = Math.max(e0.intersectionRatio, e0.intersectionRect.height / alturaTela);
        decidir();
      },
      { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] },
    );
    perto.observe(el);
    visivel.observe(el);
    return () => {
      perto.disconnect();
      visivel.disconnect();
    };
  }, [id]);

  // eventos do vídeo + liberação de memória
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const on: [string, () => void][] = [
      ["playing", () => setEstado("tocando")],
      ["waiting", () => setEstado("carregando")],
      ["pause", () => setEstado((e) => (e === "erro" ? e : "pausado"))],
      ["error", () => setEstado("erro")],
    ];
    on.forEach(([n, f]) => v.addEventListener(n, f));
    return () => {
      on.forEach(([n, f]) => v.removeEventListener(n, f));
      v.pause();
      v.removeAttribute("src");
      try {
        v.load();
      } catch {
        /* navegador sem suporte: nada a liberar */
      }
    };
  }, [fontes.mp4]);

  /** Play/pause pela pessoa — respeitado até ela mudar de ideia. */
  const alternar = useCallback(() => {
    const m = membros.get(id);
    const v = videoRef.current;
    if (!m || !v) return;
    if (v.paused) {
      m.bloqueado = false;
      for (const outro of membros.values()) if (outro !== m) outro.pausar();
      tocar();
    } else {
      m.bloqueado = true;
      pausar();
    }
  }, [id, tocar, pausar]);

  return { videoRef, caixaRef, estado, autoplay, alternar };
}
