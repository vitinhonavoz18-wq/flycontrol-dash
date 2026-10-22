import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Download, ExternalLink, FileWarning, X } from "lucide-react";
import { useState } from "react";
import { enderecoParaBaixar } from "@/lib/crm/midiaNavegador";

/**
 * A FOTO EM TELA CHEIA E O PDF ABERTO, sem sair do Chat.
 *
 * Antes a foto ampliava mas o PDF abria em outra aba — e no celular, "outra
 * aba" é perder a conversa de vista e ter de achar o caminho de volta. Agora
 * os dois abrem por cima da conversa, e fechar (no X, no fundo escuro ou na
 * tecla Esc) devolve a pessoa exatamente onde estava.
 *
 * O PDF usa o leitor que o próprio navegador já tem: ele já sabe virar página,
 * dar zoom e procurar palavra. Colocar uma biblioteca só para isso deixaria o
 * painel mais pesado para fazer o mesmo. No iPhone, onde o leitor embutido só
 * mostra a primeira página, ficam os botões "abrir em nova aba" e "baixar".
 */

function Botao({
  href,
  rotulo,
  children,
  baixar,
}: {
  href: string;
  rotulo: string;
  children: React.ReactNode;
  baixar?: boolean;
}) {
  return (
    <a
      href={href}
      target={baixar ? undefined : "_blank"}
      rel="noreferrer"
      className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
      aria-label={rotulo}
      title={rotulo}
    >
      {children}
    </a>
  );
}

function Moldura({
  aberto,
  onFechar,
  titulo,
  acoes,
  children,
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  acoes: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/90" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[61] flex flex-col outline-none"
          aria-describedby={undefined}
          onClick={(e) => {
            // Clicar no fundo escuro fecha — igual ao WhatsApp Web.
            if (e.target === e.currentTarget) onFechar();
          }}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2 text-white">
            <DialogPrimitive.Title className="truncate text-sm font-semibold">
              {titulo}
            </DialogPrimitive.Title>
            <div className="flex shrink-0 gap-2">
              {acoes}
              <DialogPrimitive.Close
                className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
                aria-label="Fechar"
                title="Fechar (Esc)"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function VisualizadorDeImagem({
  url,
  nome,
  aberto,
  onFechar,
}: {
  url: string;
  nome: string;
  aberto: boolean;
  onFechar: () => void;
}) {
  const [quebrou, setQuebrou] = useState(false);
  return (
    <Moldura
      aberto={aberto}
      onFechar={onFechar}
      titulo={nome}
      acoes={
        <Botao href={enderecoParaBaixar(url, nome)} rotulo="Baixar imagem" baixar>
          <Download className="h-5 w-5" aria-hidden="true" />
        </Botao>
      }
    >
      <div
        className="grid min-h-0 flex-1 place-items-center p-3"
        onClick={(e) => {
          if (e.target === e.currentTarget) onFechar();
        }}
      >
        {quebrou ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-white/80">
            <FileWarning className="h-5 w-5" aria-hidden="true" />
            Não consegui abrir esta imagem.
          </p>
        ) : (
          <img
            src={url}
            alt={nome}
            className="max-h-full max-w-full rounded-lg object-contain"
            onError={() => setQuebrou(true)}
          />
        )}
      </div>
    </Moldura>
  );
}

export function VisualizadorDePdf({
  url,
  nome,
  aberto,
  onFechar,
}: {
  url: string;
  nome: string;
  aberto: boolean;
  onFechar: () => void;
}) {
  return (
    <Moldura
      aberto={aberto}
      onFechar={onFechar}
      titulo={nome}
      acoes={
        <>
          <Botao href={url} rotulo="Abrir em nova aba">
            <ExternalLink className="h-5 w-5" aria-hidden="true" />
          </Botao>
          <Botao href={enderecoParaBaixar(url, nome)} rotulo="Baixar PDF" baixar>
            <Download className="h-5 w-5" aria-hidden="true" />
          </Botao>
        </>
      }
    >
      <div className="min-h-0 flex-1 px-2 pb-2 sm:px-6 sm:pb-6">
        <iframe src={url} title={`PDF: ${nome}`} className="h-full w-full rounded-lg bg-white" />
      </div>
    </Moldura>
  );
}
