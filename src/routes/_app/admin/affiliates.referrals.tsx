import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SeletorAdmin } from "@/components/afiliados/admin/PecasAdmin";
import { TabelaDeIndicacoes } from "@/components/afiliados/admin/Tabelas";
import { useBuscaComPausa } from "@/components/afiliados/admin/useBuscaComPausa";
import {
  CHAVE_ADMIN,
  atribuirIndicacao,
  buscarLojasSemAfiliado,
  useAfiliadosAdmin,
} from "@/lib/afiliados/admin";
import type { SituacaoDaLoja } from "@/lib/afiliados/portal";
import { SITUACAO_DA_LOJA } from "@/lib/afiliados/situacoes";
import { mensagemDeErro } from "@/lib/afiliados/validacao";

export const Route = createFileRoute("/_app/admin/affiliates/referrals")({
  component: IndicacoesAdmin,
});

function IndicacoesAdmin() {
  const [digitado, busca, setDigitado] = useBuscaComPausa();
  const [situacao, setSituacao] = useState<SituacaoDaLoja | "">("");
  const [atribuir, setAtribuir] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por loja, afiliado ou código"
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
            className="pl-9"
          />
        </div>
        <SeletorAdmin
          rotulo="Filtrar por situação"
          valor={situacao}
          aoMudar={(v) => setSituacao(v as SituacaoDaLoja | "")}
          className="sm:w-48"
          opcoes={[
            { valor: "", rotulo: "Todas as situações" },
            ...(Object.keys(SITUACAO_DA_LOJA) as SituacaoDaLoja[]).map((s) => ({
              valor: s,
              rotulo: SITUACAO_DA_LOJA[s].rotulo,
            })),
          ]}
        />
        <Button variant="outline" onClick={() => setAtribuir(true)}>
          <UserPlus className="mr-2 h-4 w-4" /> Atribuir manualmente
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        O afiliado de uma loja nunca é trocado. As únicas operações manuais são cancelar/restaurar
        uma indicação e atribuir uma loja que ainda não tem afiliado — todas pedem motivo e ficam na
        auditoria.
      </p>

      <TabelaDeIndicacoes busca={busca} situacao={situacao} />

      <AtribuicaoManual aberto={atribuir} aoFechar={() => setAtribuir(false)} />
    </div>
  );
}

/**
 * Para o cliente que veio pelo parceiro mas se cadastrou sem o link. Só
 * lojas SEM afiliado aparecem, só afiliados ATIVOS podem receber, e a
 * comissão vale para faturas pagas dali em diante.
 */
function AtribuicaoManual({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [buscaLoja, setBuscaLoja] = useState("");
  const [lojas, setLojas] = useState<{ id: string; nome: string }[]>([]);
  const [loja, setLoja] = useState<{ id: string; nome: string } | null>(null);
  const [digitadoAfiliado, buscaAfiliado, setDigitadoAfiliado] = useBuscaComPausa();
  const afiliados = useAfiliadosAdmin({ busca: buscaAfiliado, status: "active", pagina: 1 });
  const [afiliado, setAfiliado] = useState<{ id: string; nome: string; codigo: string } | null>(
    null,
  );
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (buscaLoja.trim().length < 2) {
      setLojas([]);
      return;
    }
    let vivo = true;
    const t = window.setTimeout(() => {
      buscarLojasSemAfiliado(buscaLoja)
        .then((l) => vivo && setLojas(l))
        .catch(() => vivo && setLojas([]));
    }, 350);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [buscaLoja]);

  function fechar() {
    if (enviando) return;
    setBuscaLoja("");
    setLoja(null);
    setAfiliado(null);
    setMotivo("");
    setDigitadoAfiliado("");
    aoFechar();
  }

  async function confirmar() {
    if (!loja || !afiliado || motivo.trim().length < 10) return;
    setEnviando(true);
    try {
      await atribuirIndicacao(loja.id, afiliado.id, motivo.trim());
      toast.success("Loja atribuída ao afiliado.");
      await qc.invalidateQueries({ queryKey: CHAVE_ADMIN });
      setEnviando(false);
      fechar();
    } catch (e) {
      toast.error(mensagemDeErro(e));
      setEnviando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(abrir) => !abrir && fechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Atribuir loja a um afiliado</DialogTitle>
          <DialogDescription>
            Só para lojas que ainda não têm afiliado. Vale para faturas pagas daqui em diante — nada
            retroativo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="busca-loja">Loja (sem afiliado)</Label>
            {loja ? (
              <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                {loja.nome}
                <Button size="sm" variant="ghost" onClick={() => setLoja(null)}>
                  Trocar
                </Button>
              </div>
            ) : (
              <>
                <Input
                  id="busca-loja"
                  placeholder="Digite o nome da loja"
                  value={buscaLoja}
                  onChange={(e) => setBuscaLoja(e.target.value)}
                />
                <ul className="max-h-40 overflow-y-auto rounded-md border empty:hidden">
                  {lojas.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => setLoja(l)}
                      >
                        {l.nome}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="busca-afiliado">Afiliado (ativo)</Label>
            {afiliado ? (
              <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                {afiliado.nome} <span className="font-mono text-xs">{afiliado.codigo}</span>
                <Button size="sm" variant="ghost" onClick={() => setAfiliado(null)}>
                  Trocar
                </Button>
              </div>
            ) : (
              <>
                <Input
                  id="busca-afiliado"
                  placeholder="Nome, e-mail ou código"
                  value={digitadoAfiliado}
                  onChange={(e) => setDigitadoAfiliado(e.target.value)}
                />
                {buscaAfiliado ? (
                  <ul className="max-h-40 overflow-y-auto rounded-md border empty:hidden">
                    {(afiliados.data?.itens ?? []).map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => setAfiliado({ id: a.id, nome: a.nome, codigo: a.codigo })}
                        >
                          {a.nome}{" "}
                          <span className="font-mono text-xs text-muted-foreground">
                            {a.codigo}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="motivo-atribuicao">Motivo</Label>
            <Textarea
              id="motivo-atribuicao"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: o cliente confirmou por WhatsApp que veio pelo parceiro, mas se cadastrou sem o link."
            />
            <p className="text-xs text-muted-foreground">
              Obrigatório, mínimo de 10 letras. Fica na auditoria.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={enviando}>
            Voltar
          </Button>
          <Button
            onClick={confirmar}
            disabled={!loja || !afiliado || motivo.trim().length < 10 || enviando}
          >
            {enviando ? "Aguarde..." : "Atribuir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
