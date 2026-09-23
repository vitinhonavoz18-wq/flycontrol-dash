/**
 * Vitrines de todas as lojas — só para a administração do FlyControl.
 *
 * Mostra quais produtos estão sendo usados como vitrine, se estão aparecendo
 * de verdade no aplicativo e, quando não estão, por quê. O bloqueio é da
 * moderação: esconde a oferta sem apagar a escolha da loja, e só o
 * administrador bloqueia ou libera (o banco confere).
 *
 * Preparado para crescer: patrocínio, campanhas e ordenação manual entram
 * como colunas novas na mesma tabela, sem trocar esta estrutura.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { checklist } from "@/lib/flydelivery/vitrine";

type Linha = {
  showcase_id: string;
  pizzeria_id: string;
  store_name: string;
  product_id: string;
  product_name: string;
  image_url: string | null;
  price: number;
  promo_price: number | null;
  display_order: number;
  moderation_status: string;
  issues: string[];
  publicly_visible: boolean;
  updated_at: string;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function VitrineAdminOverview() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mexendo, setMexendo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase.rpc("flydelivery_showcase_admin_overview");
    if (error) toast.error("Erro ao carregar vitrines: " + error.message);
    setLinhas((data ?? []) as unknown as Linha[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const alternarBloqueio = async (linha: Linha) => {
    setMexendo(linha.showcase_id);
    const bloquear = linha.moderation_status !== "blocked";
    const { error } = await supabase
      .from("flydelivery_showcase_products")
      .update({ moderation_status: bloquear ? "blocked" : "active" })
      .eq("id", linha.showcase_id);
    setMexendo(null);
    if (error) toast.error("Não foi possível alterar: " + error.message);
    else toast.success(bloquear ? "Vitrine bloqueada." : "Vitrine liberada.");
    carregar();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-5 w-5 text-primary" />
          Administração — vitrines de todas as lojas
        </CardTitle>
        <CardDescription>
          Só administradores veem este quadro. “Bloquear” esconde a oferta do aplicativo sem apagar
          a escolha da loja.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {carregando ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : linhas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma loja escolheu produtos para a vitrine ainda.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {linhas.map((l) => {
              const pendentes = checklist(l.issues).filter((c) => !c.ok);
              return (
                <li
                  key={l.showcase_id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 font-medium">
                      {l.product_name}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        · {l.store_name} · posição {l.display_order}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {l.promo_price ? `${brl(l.price)} → ${brl(l.promo_price)}` : brl(l.price)}
                    </p>
                    {pendentes.length > 0 ? (
                      <p className="text-xs text-destructive">
                        Pendências: {pendentes.map((p) => p.rotulo).join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {l.moderation_status === "blocked" ? (
                      <Badge variant="destructive">Bloqueada</Badge>
                    ) : l.publicly_visible ? (
                      <Badge className="bg-success text-white">No ar</Badge>
                    ) : (
                      <Badge variant="secondary">Pausada</Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mexendo === l.showcase_id}
                      onClick={() => alternarBloqueio(l)}
                    >
                      {l.moderation_status === "blocked" ? "Liberar" : "Bloquear"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
