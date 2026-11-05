import { useState } from "react";
import { ImageUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { montarReenvio, reenviarTarefas } from "@/lib/midia/reenviarFotos";

/**
 * Botão "Reenviar fotos" do Cardápio.
 *
 * Passa todas as fotos que o site de pedidos já tinha para o endereço com
 * cache do Cloudflare — o que não gasta a franquia do Supabase. Pode apertar
 * quantas vezes quiser: o que já foi trocado não é reenviado.
 */
export function ReenviarFotosButton({ pizzeriaId }: { pizzeriaId: string }) {
  const [andamento, setAndamento] = useState<{ feitos: number; total: number } | null>(null);

  async function reenviar() {
    setAndamento({ feitos: 0, total: 0 });
    try {
      const { tarefas, erro } = await montarReenvio(pizzeriaId);
      if (erro) {
        toast.error(erro);
        return;
      }
      if (tarefas.length === 0) {
        toast.success("Todas as fotos do site já estão atualizadas. Nada a reenviar.");
        return;
      }
      const ok = window.confirm(
        `Vou reenviar ${tarefas.length} ${tarefas.length === 1 ? "item" : "itens"} com foto para o site de pedidos.\n\n` +
          "Nada muda no que o cliente vê — só o caminho por onde a foto chega, que fica mais rápido e mais barato.\n\nContinuar?",
      );
      if (!ok) return;

      setAndamento({ feitos: 0, total: tarefas.length });
      const r = await reenviarTarefas(tarefas, (feitos) =>
        setAndamento({ feitos, total: tarefas.length }),
      );

      if (r.falhas === 0) {
        toast.success(
          `Pronto! ${r.enviados} ${r.enviados === 1 ? "item reenviado" : "itens reenviados"}.`,
        );
      } else {
        const lista = r.itensComFalha.slice(0, 5).join(", ");
        const resto = r.itensComFalha.length > 5 ? ` e mais ${r.itensComFalha.length - 5}` : "";
        toast.error(
          `${r.enviados} foram, ${r.falhas} não foram: ${lista}${resto}. ` +
            "Pode apertar de novo — só o que faltou será reenviado.",
          { duration: 12000 },
        );
      }
    } catch (e) {
      toast.error(
        "Não consegui reenviar as fotos: " + (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setAndamento(null);
    }
  }

  const ocupado = andamento !== null;
  return (
    <Button variant="outline" onClick={reenviar} disabled={ocupado}>
      {ocupado ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <ImageUp className="mr-2 h-4 w-4" />
      )}
      {ocupado && andamento.total > 0
        ? `Reenviando ${andamento.feitos}/${andamento.total}`
        : "Reenviar fotos"}
    </Button>
  );
}
