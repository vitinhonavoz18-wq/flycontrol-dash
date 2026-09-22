import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ETAPAS_DO_GUIA, enderecoDaEtapa } from "@/lib/onboarding/guia/etapas";
import { POSES } from "./personagem";

/**
 * "Rever tutorial" — o modo REVISÃO.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * A SEPARAÇÃO QUE IMPORTA
 * ═══════════════════════════════════════════════════════════════════════
 *
 * O guia OBRIGATÓRIO escurece o painel, tranca as rotas e só termina quando
 * cada etapa é cumprida. Ele existe uma vez, no começo.
 *
 * Isto aqui é outra coisa: uma consulta. Abre, lê, fecha. NÃO escurece nada,
 * NÃO tranca rota nenhuma e — o mais importante — NÃO mexe em um único dado
 * da loja. Um botão "rever" que zerasse a configuração seria o manual de
 * instruções que desmonta o móvel para explicar como montar.
 *
 * Cada etapa traz o link para a tela onde ela é feita, porque quem vem
 * consultar normalmente quer ir mudar alguma coisa logo depois.
 */
export function RevisaoDoTutorial() {
  const [aberto, setAberto] = useState(false);
  const router = useRouter();
  const pose = POSES.orientando;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <BookOpen className="h-4 w-4" aria-hidden="true" /> Rever tutorial
        </Button>
      </DialogTrigger>

      {/* `max-h` com rolagem por dentro: com nove etapas, num celular, o
          diálogo sem isto cresceria para fora da tela e o lojista não
          alcançaria o fim da lista nem o botão de fechar. */}
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <img
              src={pose.src}
              alt=""
              aria-hidden="true"
              className="h-14 w-auto shrink-0 object-contain"
            />
            <div className="min-w-0 text-left">
              <DialogTitle>Como deixar sua loja pronta</DialogTitle>
              <DialogDescription>
                As mesmas orientações do começo. Só para consultar — nada aqui altera sua
                configuração.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ol className="space-y-3">
          {ETAPAS_DO_GUIA.map((etapa, i) => (
            <li key={etapa.id} className="rounded-xl border border-border p-3">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-black tabular-nums text-primary">{i + 1}.</span>
                <h3 className="min-w-0 text-sm font-bold">{etapa.rotulo}</h3>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{etapa.descricao}</p>
              {/* Pelo histórico, e não por `<Link to>`: o destino sai do
                  roteiro (texto comum) e não é uma das rotas literais que o
                  roteador sabe conferir em tempo de compilação. */}
              <button
                type="button"
                onClick={() => {
                  setAberto(false);
                  router.history.push(enderecoDaEtapa(etapa));
                }}
                className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Ir para essa etapa
              </button>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
