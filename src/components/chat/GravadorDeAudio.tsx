import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  escolherFormato,
  mimeLimpo,
  duracaoLegivel,
  type ArquivoParaEnviar,
} from "@/lib/crm/midiaNavegador";

/**
 * O BOTÃO DE FALAR, igual ao do WhatsApp.
 *
 * Aperta o microfone, fala, aperta o quadrado, e o áudio entra na caixa de
 * escrever esperando o envio. Responder por voz é muito mais rápido do que
 * digitar com a mão cheia de farinha — e era o que faltava para o lojista não
 * precisar largar o painel e pegar o celular.
 *
 * O TEMPO MÁXIMO EXISTE POR UM MOTIVO. Sem ele, um microfone esquecido ligado
 * grava vinte minutos, o arquivo estoura o limite do WhatsApp e a recusa só
 * apareceria no fim — com o lojista achando que mandou. Aos 3 minutos a
 * gravação para sozinha.
 *
 * O MICROFONE É DESLIGADO NO FIM, SEMPRE. Se a gente esquecer, a luzinha do
 * navegador fica acesa e a pessoa (com razão) acha que está sendo escutada.
 */

const LIMITE_SEGUNDOS = 180;

export function GravadorDeAudio({
  desabilitado,
  onPronto,
  onErro,
}: {
  desabilitado: boolean;
  onPronto: (arquivo: ArquivoParaEnviar) => void;
  onErro: (mensagem: string) => void;
}) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const gravador = useRef<MediaRecorder | null>(null);
  const trilha = useRef<MediaStream | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const descartar = useRef(false);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);

  function desligarTudo() {
    if (relogio.current) clearInterval(relogio.current);
    relogio.current = null;
    trilha.current?.getTracks().forEach((t) => t.stop());
    trilha.current = null;
    gravador.current = null;
    setGravando(false);
    setSegundos(0);
  }

  // Sair da tela no meio da gravação não pode deixar o microfone ligado.
  useEffect(() => desligarTudo, []);

  async function comecar() {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onErro("Este navegador não grava áudio. Use o Chrome, ou mande um arquivo pelo clipe.");
      return;
    }
    const formato = escolherFormato((m) => MediaRecorder.isTypeSupported(m));
    if (!formato) {
      onErro("Este navegador não grava áudio em formato que o WhatsApp aceite.");
      return;
    }

    let fluxo: MediaStream;
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onErro("Não consegui usar o microfone. Verifique a permissão do navegador.");
      return;
    }

    pedacos.current = [];
    descartar.current = false;
    trilha.current = fluxo;

    const rec = new MediaRecorder(fluxo, { mimeType: formato });
    gravador.current = rec;

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) pedacos.current.push(e.data);
    };

    rec.onstop = () => {
      const jogarFora = descartar.current;
      const bloco = new Blob(pedacos.current, { type: formato });
      desligarTudo();
      if (jogarFora || bloco.size === 0) return;

      const leitor = new FileReader();
      leitor.onerror = () => onErro("Não consegui salvar a gravação. Tente de novo.");
      leitor.onload = () => {
        const r = String(leitor.result ?? "");
        const base64 = r.includes(",") ? r.slice(r.indexOf(",") + 1) : r;
        if (!base64) {
          onErro("A gravação saiu vazia. Tente de novo.");
          return;
        }
        const ext = mimeLimpo(formato).split("/")[1] || "webm";
        onPronto({
          nome: `audio-${Date.now()}.${ext}`,
          mime: mimeLimpo(formato),
          base64,
          tamanho: bloco.size,
        });
      };
      leitor.readAsDataURL(bloco);
    };

    rec.start();
    setGravando(true);
    setSegundos(0);
    relogio.current = setInterval(() => {
      setSegundos((s) => {
        if (s + 1 >= LIMITE_SEGUNDOS) {
          try {
            gravador.current?.stop();
          } catch {
            /* já parou sozinho */
          }
        }
        return s + 1;
      });
    }, 1000);
  }

  function parar(jogarFora: boolean) {
    descartar.current = jogarFora;
    try {
      gravador.current?.stop();
    } catch {
      desligarTudo();
    }
  }

  if (!gravando) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => void comecar()}
        disabled={desabilitado}
        className="h-11 w-11 shrink-0 rounded-xl border-2 p-0"
        aria-label="Gravar um áudio"
        title="Gravar um áudio"
      >
        <Mic className="h-5 w-5" aria-hidden="true" />
      </Button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-destructive bg-destructive/10 px-2 py-1">
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" aria-hidden="true" />
      <span className="font-mono text-sm font-bold tabular-nums text-destructive">
        {duracaoLegivel(segundos)}
      </span>
      <Button
        type="button"
        variant="ghost"
        onClick={() => parar(true)}
        className="h-8 w-8 p-0 text-destructive"
        aria-label="Jogar a gravação fora"
        title="Jogar fora"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        onClick={() => parar(false)}
        className="h-8 w-8 p-0"
        aria-label="Terminar a gravação"
        title="Terminar"
      >
        <Square className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
