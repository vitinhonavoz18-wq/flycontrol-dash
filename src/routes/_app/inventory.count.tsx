import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ClipboardCheck, Play, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useLojaDoEstoque } from "@/lib/inventory/loja-context";
import { qtd, lerNumero, deCentavos } from "@/lib/inventory/formato";
import {
  abrirContagem,
  anotarContagem,
  contagemEmAndamento,
  fecharContagem,
  type ContagemAberta,
} from "@/lib/inventory/inventory.functions";

export const Route = createFileRoute("/_app/inventory/count")({ component: Contagem });

/**
 * A conferência física da prateleira.
 *
 * O dono conta o que existe de verdade e o sistema acerta a diferença. A
 * diferença não é escrita por cima do saldo: vira movimentação, como tudo o
 * mais. Do contrário o estoque mudaria sem nenhuma linha explicando por quê, e
 * o extrato deixaria de fechar com o saldo.
 *
 * Produto que o dono não contar fica intocado. Uma contagem parcial é comum —
 * conferir só as bebidas numa terça — e zerar o que não foi contado seria
 * transformar uma conferência em um estrago.
 */
function Contagem() {
  const { tenantId } = useLojaDoEstoque();

  const buscar = useServerFn(contagemEmAndamento);
  const abrir = useServerFn(abrirContagem);
  const anotar = useServerFn(anotarContagem);
  const fechar = useServerFn(fecharContagem);

  const [contagem, setContagem] = useState<ContagemAberta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [busca, setBusca] = useState("");
  const [soPendentes, setSoPendentes] = useState(false);
  // O que está digitado na tela, antes de virar anotação gravada.
  const [rascunho, setRascunho] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    setCarregando(true);
    try {
      const c = await buscar({ data: { tenantId } });
      setContagem(c);
      setRascunho(
        Object.fromEntries(
          (c?.itens ?? []).map((i) => [
            i.id,
            i.counted_quantity_base === null ? "" : String(i.counted_quantity_base),
          ]),
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar a contagem.");
    } finally {
      setCarregando(false);
    }
  }, [buscar, tenantId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function iniciar() {
    if (!tenantId) return;
    setOcupado(true);
    try {
      const r = await abrir({ data: { tenantId } });
      toast.success(`Contagem aberta com ${r.itens} produtos para conferir.`);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir a contagem.");
    } finally {
      setOcupado(false);
    }
  }

  /** Grava o que foi contado quando o campo perde o foco. */
  async function gravarItem(itemId: string, texto: string) {
    if (!tenantId) return;
    const limpo = texto.trim();
    const quantidade = limpo === "" ? null : lerNumero(limpo);

    if (limpo !== "" && quantidade === null) {
      toast.error("Digite um número para a quantidade contada.");
      return;
    }

    try {
      await anotar({ data: { tenantId, itemId, quantidade } });
      setContagem((c) =>
        c
          ? {
              ...c,
              itens: c.itens.map((i) =>
                i.id === itemId ? { ...i, counted_quantity_base: quantidade } : i,
              ),
            }
          : c,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível anotar.");
    }
  }

  async function finalizar() {
    if (!tenantId || !contagem) return;

    const contados = contagem.itens.filter((i) => i.counted_quantity_base !== null).length;
    if (contados === 0) {
      toast.error("Conte ao menos um produto antes de fechar.");
      return;
    }

    const naoContados = contagem.itens.length - contados;
    const aviso =
      naoContados > 0
        ? `\n\n${naoContados} ${naoContados === 1 ? "produto ficou" : "produtos ficaram"} sem contagem e não ${naoContados === 1 ? "será alterado" : "serão alterados"}.`
        : "";

    if (!confirm(`Fechar a contagem e acertar o estoque de ${contados} produtos?${aviso}`)) return;

    setOcupado(true);
    try {
      const r = await fechar({ data: { tenantId, countId: contagem.id } });
      toast.success(
        r.divergencias === 0
          ? "Contagem fechada: o estoque já estava certinho."
          : `Contagem fechada: ${r.divergencias} ${r.divergencias === 1 ? "diferença acertada" : "diferenças acertadas"}, ${deCentavos(r.valor_divergencia_cents)} em jogo.`,
      );
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível fechar a contagem.");
    } finally {
      setOcupado(false);
    }
  }

  const itensFiltrados = useMemo(() => {
    if (!contagem) return [];
    const termo = busca.trim().toLowerCase();
    return contagem.itens
      .filter((i) => !termo || i.produto_nome.toLowerCase().includes(termo))
      .filter((i) => !soPendentes || i.counted_quantity_base === null);
  }, [busca, contagem, soPendentes]);

  const contados = contagem?.itens.filter((i) => i.counted_quantity_base !== null).length ?? 0;
  const divergentes =
    contagem?.itens.filter(
      (i) => i.counted_quantity_base !== null && i.counted_quantity_base !== i.system_quantity_base,
    ).length ?? 0;

  if (carregando) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!contagem) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <ClipboardCheck className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Nenhuma contagem em andamento</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Abrir uma contagem tira um retrato do estoque atual. Você percorre a prateleira anotando
            o que existe de verdade e, ao fechar, o sistema acerta só o que estiver diferente — e
            registra cada acerto no extrato.
          </p>
          <Button onClick={() => void iniciar()} disabled={ocupado}>
            <Play className="mr-2 h-4 w-4" />
            {ocupado ? "Abrindo…" : "Abrir contagem"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium">
              Contagem aberta em{" "}
              {new Date(contagem.started_at).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="text-sm text-muted-foreground">
              {contados} de {contagem.itens.length} contados
              {divergentes > 0 && ` · ${divergentes} com diferença`}
            </p>
          </div>
          <Button onClick={() => void finalizar()} disabled={ocupado || contados === 0}>
            <ClipboardCheck className="mr-2 h-4 w-4" />
            {ocupado ? "Fechando…" : "Fechar e acertar"}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto"
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={soPendentes} onCheckedChange={setSoPendentes} />
          Só os que faltam
        </label>
      </div>

      <div className="space-y-2">
        {itensFiltrados.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {soPendentes ? "Tudo contado por aqui." : "Nenhum produto encontrado."}
          </p>
        )}

        {itensFiltrados.map((item) => {
          const contado = item.counted_quantity_base;
          const diferenca = contado === null ? null : contado - item.system_quantity_base;

          return (
            <Card key={item.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.produto_nome}</p>
                  <p className="text-xs text-muted-foreground">
                    Sistema: {qtd(item.system_quantity_base)} {item.produto_unidade}
                    {diferenca !== null && diferenca !== 0 && (
                      <span className={diferenca > 0 ? " text-emerald-600" : " text-destructive"}>
                        {" "}
                        · {diferenca > 0 ? "sobra" : "falta"} {qtd(Math.abs(diferenca))}
                      </span>
                    )}
                  </p>
                </div>

                <Input
                  className="w-28 shrink-0"
                  inputMode="decimal"
                  value={rascunho[item.id] ?? ""}
                  onChange={(e) => setRascunho((r) => ({ ...r, [item.id]: e.target.value }))}
                  onBlur={(e) => void gravarItem(item.id, e.target.value)}
                  placeholder="contei…"
                  aria-label={`Quantidade contada de ${item.produto_nome}`}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {divergentes > 0 && (
        <p className="flex items-center gap-2 text-sm text-amber-600">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          Ao fechar, cada diferença vira uma movimentação de acerto no extrato.
        </p>
      )}
    </div>
  );
}
