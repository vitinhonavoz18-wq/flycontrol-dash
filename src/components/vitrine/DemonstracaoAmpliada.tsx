import { ArrowUpRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { DemonstracaoPublica } from "@/lib/vitrine/demonstracoes";

/**
 * A demonstração em tamanho grande, com os controles do próprio navegador
 * (pausar, voltar, tela cheia). Só existe enquanto está aberta: fechou, o
 * vídeo sai da página e a memória volta para o navegador.
 */
export function DemonstracaoAmpliada({
  demo,
  onFechar,
}: {
  demo: DemonstracaoPublica | null;
  onFechar: () => void;
}) {
  return (
    <Dialog open={!!demo} onOpenChange={(aberto) => !aberto && onFechar()}>
      {demo && (
        <DialogContent className="font-fly max-w-[min(92vw,440px)] gap-4 p-4 sm:p-5">
          <div>
            <DialogTitle className="text-[18px] font-semibold">{demo.nome}</DialogTitle>
            <DialogDescription className="text-[13px]">
              {[demo.categoria, demo.cidade].filter(Boolean).join(" · ")} — gravação real do
              cardápio
            </DialogDescription>
          </div>
          <video
            key={demo.slug}
            controls
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={demo.video.poster}
            className="w-full rounded-xl"
            style={{
              aspectRatio: "9 / 16",
              maxHeight: "70vh",
              background: demo.cor,
              objectFit: "contain",
            }}
          >
            {demo.video.webm && <source src={demo.video.webm} type='video/webm; codecs="vp9"' />}
            <source src={demo.video.mp4} type="video/mp4" />
          </video>
          <a
            href={demo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-full px-4 py-3 text-[15px] font-semibold"
            style={{ background: "var(--fly-primary)", color: "var(--fly-on-primary)" }}
          >
            Abrir o cardápio de verdade <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
        </DialogContent>
      )}
    </Dialog>
  );
}
