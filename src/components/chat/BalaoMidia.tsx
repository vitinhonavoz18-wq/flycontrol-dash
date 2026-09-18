import { useState } from "react";
import { FileText, Download, Expand, X } from "lucide-react";
import { ROTULO_MIDIA, ehTipoMidia } from "@/lib/crm/midia";

/**
 * O ÁUDIO E A FOTO DENTRO DO BALÃO.
 *
 * Antes aqui só aparecia a frase "arquivo recebido" com um clipe de papel. O
 * lojista via que tinha CHEGADO alguma coisa e não tinha como ver o quê — é o
 * recado que o atendente anotou e deixou na gaveta: existe, e não serve para
 * nada.
 *
 * FOTO CLICA E AMPLIA. Uma foto de comprovante espremida em 200 pixels não dá
 * para ler o valor. Clicando, ela abre em tela cheia — que era exatamente o
 * pedido: "não tem possibilidade de ampliar para ficar maior".
 *
 * O ENDEREÇO DO ARQUIVO VENCE em uma hora. Quando vencer, a foto não abre e no
 * lugar dela fica o rótulo ("Foto", "Áudio") — nunca um quadrado quebrado sem
 * explicação. Basta recarregar a conversa para o endereço ser assinado de novo.
 */

export function BalaoMidia({
  url,
  tipo,
  claro,
}: {
  url: string;
  tipo: string | null;
  /** Balão de cor forte: os detalhes precisam ser claros para aparecer. */
  claro: boolean;
}) {
  const [ampliada, setAmpliada] = useState(false);
  const [quebrou, setQuebrou] = useState(false);

  const t = ehTipoMidia(tipo) ? tipo : null;
  const rotulo = t ? ROTULO_MIDIA[t] : "Arquivo";
  const corDetalhe = claro ? "text-white/85" : "text-muted-foreground";

  if (quebrou || !t) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={`mb-1 flex items-center gap-1.5 text-xs font-semibold underline ${corDetalhe}`}
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        {rotulo}
      </a>
    );
  }

  if (t === "audio") {
    return (
      <audio
        src={url}
        controls
        preload="none"
        className="mb-1 w-[230px] max-w-full sm:w-[260px]"
        onError={() => setQuebrou(true)}
      >
        <track kind="captions" />
      </audio>
    );
  }

  if (t === "video") {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        className="mb-1 max-h-72 w-[240px] max-w-full rounded-lg"
        onError={() => setQuebrou(true)}
      >
        <track kind="captions" />
      </video>
    );
  }

  if (t === "document") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={`mb-1 flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold ${
          claro ? "border-white/30 text-white" : "border-border text-foreground"
        }`}
      >
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
        Abrir arquivo
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAmpliada(true)}
        className="group relative mb-1 block overflow-hidden rounded-lg"
        title="Clique para ampliar"
      >
        <img
          src={url}
          alt="Imagem da conversa"
          loading="lazy"
          className="max-h-64 w-full max-w-[260px] object-cover"
          onError={() => setQuebrou(true)}
        />
        <span className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Expand className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </button>

      {ampliada && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Imagem ampliada"
          onClick={() => setAmpliada(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter") setAmpliada(false);
          }}
          tabIndex={-1}
        >
          <img
            src={url}
            alt="Imagem ampliada"
            className="max-h-[92vh] max-w-[95vw] rounded-lg object-contain"
          />
          <div className="absolute right-3 top-3 flex gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
              aria-label="Baixar imagem"
            >
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
