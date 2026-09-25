/**
 * FlyDelivery → "Impulsionar no FlyDelivery".
 *
 * Duas partes:
 *   Produtos  — o cardápio da loja com o botão "Impulsionar" (ou o motivo de
 *               não poder);
 *   Campanhas — o que foi pedido, a situação de cada um e os números
 *               (impressões, cliques e taxa de cliques).
 *
 * A campanha é só uma LIGAÇÃO com o produto do cardápio: nome, foto e preço
 * continuam vindo do cadastro. Mudou lá, muda no anúncio.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Image as ImageIcon, Loader2, Pause, Play, Rocket, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  COR_DO_STATUS,
  LIMITE_DE_CAMPANHAS,
  contaNoLimite,
  dataCurta,
  motivoParaNaoImpulsionar,
  rotuloDoStatus,
  taxaDeCliques,
  type StatusDeCampanha,
} from "@/lib/flydelivery/campanhas";
import { CampanhaDialog, type ProdutoImpulsionavel } from "./CampanhaDialog";

type Produto = ProdutoImpulsionavel & {
  active: boolean | null;
  available: boolean | null;
  product_type: string | null;
};

type Campanha = {
  campaign_id: string;
  product_id: string;
  product_name: string;
  image_url: string | null;
  price: number;
  status: string;
  display_status: string;
  start_at: string;
  end_at: string;
  duration_days: number | null;
  impressions: number;
  clicks: number;
  ctr: number;
  review_note: string | null;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ImpulsionarProdutos({
  pizzeriaId,
  storeName,
  lojaNoFlyDelivery,
}: {
  pizzeriaId: string;
  storeName: string;
  lojaNoFlyDelivery: boolean;
}) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<Produto | null>(null);
  const [aba, setAba] = useState("produtos");
  const [mexendo, setMexendo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [prods, camps] = await Promise.all([
      supabase
        .from("menu_products")
        .select(
          "id, name, image_url, price, flydelivery_promo_price, active, available, product_type, menu_categories(name)",
        )
        .eq("pizzeria_id", pizzeriaId)
        .eq("active", true)
        .order("name"),
      supabase.rpc("flydelivery_campaign_stats", { p_pizzeria_id: pizzeriaId }),
    ]);
    if (prods.error) toast.error("Erro ao carregar produtos: " + prods.error.message);
    if (camps.error) toast.error("Erro ao carregar campanhas: " + camps.error.message);
    setProdutos(
      (
        (prods.data ?? []) as unknown as Array<
          Produto & { menu_categories: { name: string } | null }
        >
      ).map((p) => ({ ...p, category_name: p.menu_categories?.name ?? null })),
    );
    setCampanhas((camps.data ?? []) as unknown as Campanha[]);
    setCarregando(false);
  }, [pizzeriaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const vivas = campanhas.filter((c) => contaNoLimite(c.display_status));
  const cheia = vivas.length >= LIMITE_DE_CAMPANHAS;
  const produtoComCampanha = useMemo(
    () => new Map(vivas.map((c) => [c.product_id, c.display_status])),
    [vivas],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return produtos.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [produtos, busca]);

  const mudarStatus = async (c: Campanha, status: "paused" | "active" | "cancelled") => {
    setMexendo(c.campaign_id);
    const { error } = await supabase
      .from("flydelivery_campaigns")
      .update({ status })
      .eq("id", c.campaign_id);
    setMexendo(null);
    if (error) toast.error("Não foi possível alterar: " + error.message);
    else
      toast.success(
        status === "paused"
          ? "Campanha pausada."
          : status === "active"
            ? "Campanha retomada."
            : "Campanha cancelada.",
      );
    carregar();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-primary" /> Impulsione seus produtos
              </CardTitle>
              <CardDescription>
                Aumente a visibilidade dos seus produtos dentro do FlyDelivery. Eles aparecem em
                banners “Patrocinado” e, ao tocar, o cliente cai direto no produto.
              </CardDescription>
            </div>
            <Badge variant={cheia ? "default" : "secondary"} className="shrink-0 text-sm">
              {vivas.length}/{LIMITE_DE_CAMPANHAS} campanhas
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="campanhas">
            Campanhas{campanhas.length ? ` (${campanhas.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="produtos" className="space-y-3 pt-3">
          {cheia ? (
            <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
              Sua loja já tem {LIMITE_DE_CAMPANHAS} campanhas ativas ou aguardando aprovação.
              Cancele ou espere uma terminar para impulsionar outro produto.
            </p>
          ) : null}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto"
              className="pl-9"
            />
          </div>
          {carregando ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtrados.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum produto encontrado.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {filtrados.map((p) => {
                const motivo = motivoParaNaoImpulsionar(p, lojaNoFlyDelivery);
                const emCampanha = produtoComCampanha.get(p.id);
                const promo =
                  p.flydelivery_promo_price != null && p.flydelivery_promo_price < p.price
                    ? p.flydelivery_promo_price
                    : null;
                return (
                  <li key={p.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 gap-3">
                      {p.image_url && /^https?:\/\//i.test(p.image_url) ? (
                        <img
                          src={p.image_url}
                          alt=""
                          loading="lazy"
                          className="h-16 w-16 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted">
                          <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="min-w-0 space-y-0.5">
                        <p className="line-clamp-1 font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.category_name ?? "Sem categoria"}
                        </p>
                        <p className="text-sm">
                          <span className={promo ? "text-muted-foreground line-through" : ""}>
                            {brl(p.price)}
                          </span>
                          {promo ? (
                            <span className="ml-2 font-semibold text-primary">{brl(promo)}</span>
                          ) : null}
                        </p>
                        {emCampanha ? (
                          <Badge
                            variant="secondary"
                            className={COR_DO_STATUS[emCampanha as StatusDeCampanha]}
                          >
                            {rotuloDoStatus(emCampanha)}
                          </Badge>
                        ) : motivo ? (
                          <p className="text-xs text-destructive">{motivo}</p>
                        ) : (
                          <Badge variant="secondary" className="bg-success/15 text-success">
                            Pode impulsionar
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0"
                      disabled={!!motivo || !!emCampanha || cheia}
                      onClick={() => setEscolhido(p)}
                    >
                      <Rocket className="mr-1 h-4 w-4" /> Impulsionar
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="campanhas" className="pt-3">
          {campanhas.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma campanha ainda. Escolha um produto na aba Produtos e toque em “Impulsionar”.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">Produto</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Início</th>
                    <th className="p-3">Fim</th>
                    <th className="p-3 text-right">Impressões</th>
                    <th className="p-3 text-right">Cliques</th>
                    <th className="p-3 text-right">CTR</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {campanhas.map((c) => (
                    <tr key={c.campaign_id}>
                      <td className="p-3">
                        <p className="line-clamp-1 font-medium">{c.product_name}</p>
                        {c.review_note ? (
                          <p className="text-xs text-muted-foreground">
                            Administração: {c.review_note}
                          </p>
                        ) : null}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant="secondary"
                          className={COR_DO_STATUS[c.display_status as StatusDeCampanha]}
                        >
                          {rotuloDoStatus(c.display_status)}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap p-3">{dataCurta(c.start_at)}</td>
                      <td className="whitespace-nowrap p-3">{dataCurta(c.end_at)}</td>
                      <td className="p-3 text-right tabular-nums">{c.impressions}</td>
                      <td className="p-3 text-right tabular-nums">{c.clicks}</td>
                      <td className="p-3 text-right tabular-nums">
                        {taxaDeCliques(c.impressions, c.clicks)}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {c.display_status === "active" || c.display_status === "scheduled" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={mexendo === c.campaign_id}
                              onClick={() => mudarStatus(c, "paused")}
                              title="Pausar"
                            >
                              <Pause className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {c.display_status === "paused" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={mexendo === c.campaign_id}
                              onClick={() => mudarStatus(c, "active")}
                              title="Retomar"
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {contaNoLimite(c.display_status) ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={mexendo === c.campaign_id}
                              onClick={() => {
                                if (window.confirm(`Cancelar a campanha de “${c.product_name}”?`)) {
                                  mudarStatus(c, "cancelled");
                                }
                              }}
                              title="Cancelar"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Impressão = o anúncio apareceu de verdade na tela de um cliente (uma vez por visita).
            CTR = cliques ÷ impressões.
          </p>
        </TabsContent>
      </Tabs>

      <CampanhaDialog
        produto={escolhido}
        pizzeriaId={pizzeriaId}
        storeName={storeName}
        onClose={() => setEscolhido(null)}
        onCriada={() => {
          setEscolhido(null);
          setAba("campanhas");
          carregar();
        }}
      />
    </div>
  );
}
