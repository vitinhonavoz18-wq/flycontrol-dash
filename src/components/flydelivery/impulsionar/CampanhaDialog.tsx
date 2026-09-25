/**
 * Janela "Impulsionar produto": escolher o período, ver a prévia e enviar.
 *
 * A campanha nasce AGUARDANDO APROVAÇÃO — quem põe no ar é a administração
 * do FlyControl (o banco não deixa a loja aprovar a si mesma). O período e o
 * valor saem da tabela de planos, não desta tela: o banco recalcula o fim e o
 * preço na hora de gravar.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { reaisDeCentavos } from "@/lib/flydelivery/campanhas";

export type ProdutoImpulsionavel = {
  id: string;
  name: string;
  image_url: string | null;
  price: number;
  flydelivery_promo_price: number | null;
  category_name: string | null;
};

type Plano = { id: string; duration_days: number; label: string; price_cents: number };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "hoje" no formato do campo de data (aaaa-mm-dd), no fuso do aparelho. */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mensagemDoBanco(error: { code?: string; message?: string }): string {
  const msg = error.message ?? "";
  if (msg.includes("Limite de 3"))
    return "Sua loja já tem 3 campanhas ativas ou aguardando. Cancele uma para criar outra.";
  if (msg.includes("já tem uma campanha")) return "Este produto já tem uma campanha nesse período.";
  if (msg.includes("não elegível"))
    return "Este produto não cumpre os requisitos para impulsionar.";
  if (error.code === "42501") return "Sem permissão para esta loja.";
  return msg || "Não foi possível criar a campanha.";
}

export function CampanhaDialog({
  produto,
  pizzeriaId,
  storeName,
  onClose,
  onCriada,
}: {
  produto: ProdutoImpulsionavel | null;
  pizzeriaId: string;
  storeName: string;
  onClose: () => void;
  onCriada: () => void;
}) {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [planoId, setPlanoId] = useState<string | null>(null);
  const [inicio, setInicio] = useState(hojeISO());
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!produto) return;
    setInicio(hojeISO());
    supabase
      .from("flydelivery_campaign_plans")
      .select("id, duration_days, label, price_cents")
      .eq("active", true)
      .order("sort_order")
      .then(({ data, error }) => {
        if (error) toast.error("Não foi possível carregar os períodos.");
        const lista = (data ?? []) as Plano[];
        setPlanos(lista);
        setPlanoId(
          (atual) => atual ?? lista.find((p) => p.duration_days === 7)?.id ?? lista[0]?.id ?? null,
        );
      });
  }, [produto]);

  const plano = planos.find((p) => p.id === planoId) ?? null;
  const promo =
    produto?.flydelivery_promo_price != null && produto.flydelivery_promo_price < produto.price
      ? produto.flydelivery_promo_price
      : null;

  const enviar = async () => {
    if (!produto || !plano || enviando) return;
    setEnviando(true);
    // Começa hoje = agora; outra data = meia-noite daquele dia, no fuso da loja.
    const comeca = inicio === hojeISO() ? new Date() : new Date(`${inicio}T00:00:00`);
    const { error } = await supabase.from("flydelivery_campaigns").insert({
      pizzeria_id: pizzeriaId,
      product_id: produto.id,
      plan_id: plano.id,
      start_at: comeca.toISOString(),
      // O banco recalcula o fim a partir do plano; este valor só satisfaz o tipo.
      end_at: new Date(comeca.getTime() + plano.duration_days * 86_400_000).toISOString(),
    });
    setEnviando(false);
    if (error) {
      toast.error(mensagemDoBanco(error));
      return;
    }
    toast.success("Campanha enviada! Ela entra no ar assim que a administração aprovar.");
    onCriada();
  };

  return (
    <Dialog open={!!produto} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" /> Impulsionar produto
          </DialogTitle>
          <DialogDescription>
            O produto aparece em destaque para clientes do FlyDelivery. Ao tocar, o cliente cai
            direto nele, no seu cardápio.
          </DialogDescription>
        </DialogHeader>

        {produto ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-lg border p-3">
              {produto.image_url ? (
                <img src={produto.image_url} alt="" className="h-14 w-14 rounded-md object-cover" />
              ) : null}
              <div className="min-w-0">
                <p className="line-clamp-1 font-semibold">{produto.name}</p>
                <p className="text-xs text-muted-foreground">{storeName}</p>
                <p className="text-sm font-medium">{brl(promo ?? produto.price)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Período da campanha</Label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {planos.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlanoId(p.id)}
                    className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                      p.id === planoId
                        ? "border-primary bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    {p.label}
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {p.price_cents > 0 ? reaisDeCentavos(p.price_cents) : "Grátis"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inicio-campanha">Começa em</Label>
              <Input
                id="inicio-campanha"
                type="date"
                min={hojeISO()}
                value={inicio}
                onChange={(e) => setInicio(e.target.value || hojeISO())}
                className="w-fit"
              />
              <p className="text-xs text-muted-foreground">
                Só vai ao ar depois da aprovação. Se a aprovação chegar depois desta data, o período
                continua contando a partir dela.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Prévia no aplicativo</Label>
              <PreviaDoBanner produto={produto} storeName={storeName} promo={promo} />
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={!plano || enviando}>
            {enviando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="mr-2 h-4 w-4" />
            )}
            Impulsionar produto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** O banner do jeito que o aplicativo desenha (components/SponsoredBanner.tsx). */
export function PreviaDoBanner({
  produto,
  storeName,
  promo,
}: {
  produto: Pick<ProdutoImpulsionavel, "name" | "image_url" | "price">;
  storeName: string;
  promo: number | null;
}) {
  return (
    <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl bg-card shadow-md ring-1 ring-border">
      <div className="relative aspect-[16/9] w-full bg-muted">
        {produto.image_url ? (
          <img src={produto.image_url} alt="" className="h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          Patrocinado
        </span>
        <div className="absolute bottom-2 left-3 right-3 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-wide opacity-90">
            Produto em destaque
          </p>
          <p className="line-clamp-1 text-lg font-extrabold">{produto.name}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="line-clamp-1 text-xs text-muted-foreground">{storeName}</p>
          <p className="font-bold text-primary">
            {promo ? (
              <>
                <span className="mr-1 text-xs font-normal text-muted-foreground line-through">
                  {brl(produto.price)}
                </span>
                {brl(promo)}
              </>
            ) : (
              brl(produto.price)
            )}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
          Ver produto
        </span>
      </div>
    </div>
  );
}
