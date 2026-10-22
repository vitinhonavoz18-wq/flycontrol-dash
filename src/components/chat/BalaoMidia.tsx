import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  Expand,
  FileText,
  FileWarning,
  ImageOff,
  Loader2,
  Play,
  RotateCw,
  Video,
} from "lucide-react";
import { ROTULO_MIDIA, ehTipoMidia, type TipoMidia } from "@/lib/crm/midia";
import type { ResultadoMidia } from "@/lib/crm/filaDeMidia";
import { PlayerDeAudio } from "./PlayerDeAudio";
import { VisualizadorDeImagem, VisualizadorDePdf } from "./VisualizadorDeMidia";
import { enderecoParaBaixar } from "@/lib/crm/midiaNavegador";

/**
 * O ÁUDIO, A FOTO E O PDF DENTRO DO BALÃO.
 *
 * O DEFEITO QUE ISTO RESOLVE: milhares de mensagens tinham arquivo no
 * WhatsApp mas nenhum arquivo no painel. O balão dizia "Áudio" e só — não dava
 * para ouvir o que o cliente falou nem ver a foto do comprovante.
 *
 * Agora o balão BUSCA o arquivo quando precisa:
 *
 *   foto ........ busca sozinha ao aparecer na tela (é para ver de relance);
 *   áudio ....... busca quando a pessoa aperta "tocar" (e já começa a tocar);
 *   vídeo e PDF . buscam quando a pessoa pede para abrir.
 *
 * Áudio e vídeo não são buscados sozinhos de propósito: uma conversa com 30
 * áudios baixaria 30 arquivos que talvez ninguém vá ouvir.
 *
 * SE NÃO DER, O BALÃO DIZ O PORQUÊ ("o WhatsApp não tem mais este arquivo") e
 * oferece "tentar de novo" quando tentar de novo pode adiantar. Nunca um
 * quadrado quebrado sem explicação.
 *
 * O ENDEREÇO VENCE EM UMA HORA. Se o atendente deixar a conversa aberta a
 * tarde inteira e só então apertar "tocar", o balão pede um endereço novo
 * sozinho, uma vez, antes de desistir.
 */

export type MidiaDoBalao = {
  id: string;
  media_url: string | null;
  media_type: string | null;
  media_nome?: string | null;
  media_pendente?: boolean;
};

type Estado =
  | { fase: "pronto" }
  | { fase: "carregando" }
  | { fase: "erro"; motivo: string; definitivo: boolean };

function ehPdf(nome: string | null | undefined): boolean {
  return /\.pdf$/i.test(String(nome ?? ""));
}

export function BalaoMidia({
  mensagem,
  claro,
  obterMidia,
}: {
  mensagem: MidiaDoBalao;
  /** Balão de cor forte: os detalhes precisam ser claros para aparecer. */
  claro: boolean;
  /** Pede ao servidor o endereço do arquivo (buscando no WhatsApp se preciso). */
  obterMidia?: (messageId: string, forcar?: boolean) => Promise<ResultadoMidia>;
}) {
  const tipo: TipoMidia | null = ehTipoMidia(mensagem.media_type) ? mensagem.media_type : null;
  const [url, setUrl] = useState<string | null>(mensagem.media_url);
  const [nome, setNome] = useState<string>(
    mensagem.media_nome || (tipo ? ROTULO_MIDIA[tipo] : "Arquivo"),
  );
  const [estado, setEstado] = useState<Estado>({ fase: "pronto" });
  const [aberto, setAberto] = useState(false);
  const [tocarAoAbrir, setTocarAoAbrir] = useState(false);
  const [fotoCarregada, setFotoCarregada] = useState(false);
  const renovou = useRef(false);

  // A conversa foi recarregada e o servidor já mandou o endereço pronto.
  useEffect(() => {
    if (mensagem.media_url) setUrl(mensagem.media_url);
    if (mensagem.media_nome) setNome(mensagem.media_nome);
  }, [mensagem.media_url, mensagem.media_nome]);

  const buscar = useCallback(
    async (forcar = false): Promise<string | null> => {
      if (!obterMidia) return null;
      setEstado({ fase: "carregando" });
      const r = await obterMidia(mensagem.id, forcar);
      if (r.ok) {
        setUrl(r.url);
        setNome(r.nome);
        setEstado({ fase: "pronto" });
        return r.url;
      }
      setEstado({ fase: "erro", motivo: r.motivo, definitivo: r.definitivo });
      return null;
    },
    [obterMidia, mensagem.id],
  );

  // Foto pendente: busca sozinha, pela fila (no máximo três por vez).
  useEffect(() => {
    if (tipo === "image" && !url && mensagem.media_pendente) void buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, mensagem.media_pendente]);

  /** O arquivo não abriu: tenta um endereço novo UMA vez antes de desistir. */
  function aoQuebrar() {
    if (!renovou.current && obterMidia) {
      renovou.current = true;
      void buscar(true);
      return;
    }
    setEstado({
      fase: "erro",
      motivo: "Não consegui abrir este arquivo. Ele pode estar corrompido.",
      definitivo: true,
    });
  }

  const corDetalhe = claro ? "text-white/85" : "text-muted-foreground";
  const caixa = `mb-1 flex w-[240px] max-w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold sm:w-[280px] ${
    claro ? "border-white/30 text-white" : "border-border text-foreground"
  }`;

  if (!tipo) return null;

  // ------------------------------------------------------------- SEM ARQUIVO
  if (!url && !mensagem.media_pendente && estado.fase !== "erro") {
    return (
      <p className={`mb-1 flex items-center gap-1.5 text-xs font-semibold italic ${corDetalhe}`}>
        <FileWarning className="h-3.5 w-3.5" aria-hidden="true" />
        {ROTULO_MIDIA[tipo]} indisponível
      </p>
    );
  }

  // ------------------------------------------------------------------- ERRO
  if (estado.fase === "erro") {
    const Icone = tipo === "image" ? ImageOff : FileWarning;
    return (
      <div className={caixa} role="status">
        <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block">{ROTULO_MIDIA[tipo]} indisponível</span>
          <span className={`block font-medium ${corDetalhe}`}>{estado.motivo}</span>
        </span>
        {!estado.definitivo && (
          <button
            type="button"
            onClick={() => {
              renovou.current = false;
              void buscar(true);
            }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-black/10"
            aria-label="Tentar de novo"
            title="Tentar de novo"
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  const carregando = estado.fase === "carregando";

  // ------------------------------------------------------------------ ÁUDIO
  if (tipo === "audio") {
    if (url) {
      return (
        <PlayerDeAudio src={url} claro={claro} tocarAoAbrir={tocarAoAbrir} onErro={aoQuebrar} />
      );
    }
    return (
      <div className={`${caixa} border-transparent px-0`}>
        <button
          type="button"
          disabled={carregando}
          onClick={() => {
            setTocarAoAbrir(true);
            void buscar();
          }}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full shadow-sm ${
            claro ? "bg-white/20 text-white" : "bg-primary text-primary-foreground"
          }`}
          aria-label="Tocar áudio"
          title="Tocar"
        >
          {carregando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="ml-0.5 h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <span className={corDetalhe}>{carregando ? "Buscando o áudio no WhatsApp…" : "Áudio"}</span>
      </div>
    );
  }

  // ------------------------------------------------------------------ FOTO
  if (tipo === "image") {
    if (!url) {
      return (
        <div
          className={`mb-1 grid h-40 w-[220px] max-w-full place-items-center rounded-lg ${
            claro ? "bg-white/15" : "bg-muted"
          }`}
          role="status"
          aria-label="Carregando foto"
        >
          <Loader2 className={`h-5 w-5 animate-spin ${corDetalhe}`} aria-hidden="true" />
        </div>
      );
    }
    return (
      <>
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="group relative mb-1 block overflow-hidden rounded-lg"
          title="Clique para ampliar"
          aria-label="Ampliar foto"
        >
          {/* A foto fica SEMPRE no lugar (só transparente até chegar). Escondê-la
              de vez travava o carregamento: o navegador não busca foto "lazy"
              que está escondida — e o balão ficava girando para sempre. */}
          <img
            src={url}
            alt="Foto da conversa"
            loading="lazy"
            className={`block max-h-64 min-h-24 w-full min-w-40 max-w-[260px] object-cover transition-opacity ${
              fotoCarregada ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setFotoCarregada(true)}
            onError={aoQuebrar}
          />
          {!fotoCarregada && (
            <span
              className={`absolute inset-0 grid place-items-center ${claro ? "bg-white/15" : "bg-muted"}`}
              aria-hidden="true"
            >
              <Loader2 className={`h-5 w-5 animate-spin ${corDetalhe}`} />
            </span>
          )}
          <span className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Expand className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </button>
        <VisualizadorDeImagem
          url={url}
          nome={nome}
          aberto={aberto}
          onFechar={() => setAberto(false)}
        />
      </>
    );
  }

  // ------------------------------------------------------------------ VÍDEO
  if (tipo === "video") {
    if (url) {
      return (
        <video
          src={url}
          controls
          preload="metadata"
          className="mb-1 max-h-72 w-[240px] max-w-full rounded-lg"
          onError={aoQuebrar}
        >
          <track kind="captions" />
        </video>
      );
    }
    return (
      <button type="button" disabled={carregando} onClick={() => void buscar()} className={caixa}>
        {carregando ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <Video className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        {carregando ? "Buscando o vídeo…" : "Carregar vídeo"}
      </button>
    );
  }

  // -------------------------------------------------------------- DOCUMENTO
  async function abrirDocumento() {
    const endereco = url ?? (await buscar());
    if (!endereco) return;
    setAberto(true);
  }

  const pdf = ehPdf(nome);
  return (
    <>
      <div className={caixa}>
        <FileText className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate" title={nome}>
            {nome}
          </span>
          <span className={`block font-medium ${corDetalhe}`}>
            {carregando ? "Buscando no WhatsApp…" : pdf ? "PDF" : "Documento"}
          </span>
        </span>
        {url && !pdf ? (
          <a
            href={enderecoParaBaixar(url, nome)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-black/10"
            aria-label={`Baixar ${nome}`}
            title="Baixar"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : (
          <button
            type="button"
            disabled={carregando}
            onClick={() => void abrirDocumento()}
            className="shrink-0 rounded-md px-2 py-1 underline-offset-2 hover:underline"
          >
            {carregando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Abrir"}
          </button>
        )}
      </div>
      {url && pdf && (
        <VisualizadorDePdf
          url={url}
          nome={nome}
          aberto={aberto}
          onFechar={() => setAberto(false)}
        />
      )}
    </>
  );
}
