/**
 * Janela "Impulsionar produto" — contratação PÓS-PAGA.
 *
 *   1. o produto (foto, nome, preço normal e promocional, loja);
 *   2. "Por quanto tempo?" — os pacotes, já com o preço;
 *   3. o resumo (produto, período, valor, início e término);
 *   4. a cobrança: nada agora, o valor entra na próxima fatura do FlyControl;
 *   5. o "estou ciente" e o botão "Confirmar impulsionamento".
 *
 * Nada de PIX, cartão ou checkout. A tela manda ao banco só o produto, o
 * pacote, a data de início e uma chave única da contratação — o PREÇO sai do
 * pacote lá no banco, que cria o anúncio e a cobrança juntos, numa operação só.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarClock, Loader2, ReceiptText, Rocket, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  dataCurta,
  dataLonga,
  mensagemDoContrato,
  novaChaveDeContratacao,
  quandoEntraNaFatura,
  reaisDeCentavos,
  terminoDoImpulso,
  type ResumoDoImpulsionamento,
} from "@/lib/flydelivery/campanhas";

export type ProdutoImpulsionavel = {
  id: string;
  name: string;
  image_url: string | null;
  price: number;
  flydelivery_promo_price: number | null;
  category_name: string | null;
};

type Pacote = {
  id: string;
  duration_days: number;
  label: string;
  price_cents: number;
  description: string | null;
};

/** O "comprovante" que `flydelivery_contract_boost` devolve. */
export type Comprovante = {
  campaign_id: string;
  product_name: string;
  package_label: string | null;
  amount_cents: number;
  start_at: string;
  end_at: string;
  charge_status: string | null;
  duplicate: boolean;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Data local no formato do campo de data (aaaa-mm-dd). */
function isoDoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CampanhaDialog({
  produto,
  storeName,
  resumo,
  onClose,
  onContratado,
}: {
  produto: ProdutoImpulsionavel | null;
  storeName: string;
  resumo: ResumoDoImpulsionamento | null;
  onClose: () => void;
  onContratado: (comprovante: Comprovante) => void;
}) {
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [pacoteId, setPacoteId] = useState<string | null>(null);
  const [agendar, setAgendar] = useState(false);
  const [dia, setDia] = useState(() => isoDoDia(new Date()));
  const [ciente, setCiente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Uma chave por janela aberta: toque duplo ou reenvio não cria outro contrato.
  const [chave] = useState(novaChaveDeContratacao);

  useEffect(() => {
    let vivo = true;
    supabase
      .from("flydelivery_campaign_plans")
      .select("id, duration_days, label, price_cents, description")
      .eq("active", true)
      .order("sort_order")
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) toast.error("Não foi possível carregar os pacotes.");
        const lista = (data ?? []) as Pacote[];
        setPacotes(lista);
        setPacoteId(
          (atual) => atual ?? lista.find((p) => p.duration_days === 7)?.id ?? lista[0]?.id ?? null,
        );
        setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const pacote = pacotes.find((p) => p.id === pacoteId) ?? null;
  const promo =
    produto?.flydelivery_promo_price != null && produto.flydelivery_promo_price < produto.price
      ? produto.flydelivery_promo_price
      : null;

  const hoje = isoDoDia(new Date());
  const ultimoDia = isoDoDia(terminoDoImpulso(new Date(), resumo?.max_schedule_days ?? 30));
  // Hoje = agora; outro dia = meia-noite daquele dia, no fuso do aparelho.
  const inicio = useMemo(
    () => (!agendar || dia <= hoje ? new Date() : new Date(`${dia}T00:00:00`)),
    [agendar, dia, hoje],
  );
  const termino = pacote ? terminoDoImpulso(inicio, pacote.duration_days) : null;
  const valor = pacote ? reaisDeCentavos(pacote.price_cents) : "—";
  const quando = quandoEntraNaFatura(resumo);

  const confirmar = async () => {
    if (!produto || !pacote || !ciente || enviando) return;
    setEnviando(true);
    const { data, error } = await supabase.rpc("flydelivery_contract_boost", {
      p_product_id: produto.id,
      p_plan_id: pacote.id,
      p_idempotency_key: chave,
      p_terms_accepted: true,
      p_start_at: agendar && dia > hoje ? inicio.toISOString() : null,
    });
    setEnviando(false);
    if (error) {
      toast.error(mensagemDoContrato(error));
      return;
    }
    const c = data as unknown as Comprovante;
    const comeca =
      new Date(c.start_at) > new Date() ? `começa em ${dataCurta(c.start_at)}` : "já está no ar";
    toast.success(
      c.amount_cents > 0
        ? `Impulsionamento confirmado: ${comeca}. ${reaisDeCentavos(c.amount_cents)} entra ${quando}.`
        : `Impulsionamento confirmado: ${comeca}.`,
    );
    onContratado(c);
  };

  return (
    <Dialog open={!!produto} onOpenChange={(aberto) => !aberto && !enviando && onClose()}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-2 border-b p-4 pr-10 text-left sm:p-6 sm:pr-12">
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" /> Impulsionar produto
          </DialogTitle>
          <DialogDescription className="sr-only">
            Escolha por quanto tempo impulsionar. Você não paga agora: o valor entra na próxima
            fatura do FlyControl.
          </DialogDescription>
          <div className="flex items-start gap-2 rounded-lg bg-primary/10 p-3 text-primary">
            <Zap className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="text-sm leading-snug">
              <p className="font-semibold">Anuncie agora. Pague junto com sua próxima fatura.</p>
              <p className="text-xs opacity-90">Sem pagamento agora.</p>
            </div>
          </div>
        </DialogHeader>

        {produto ? (
          <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
            {/* 1. O produto */}
            <div className="flex items-center gap-3 rounded-lg border p-3">
              {produto.image_url ? (
                <img
                  src={produto.image_url}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-md object-cover"
                />
              ) : null}
              <div className="min-w-0 space-y-0.5">
                <p className="line-clamp-2 font-semibold leading-tight">{produto.name}</p>
                <p className="text-xs text-muted-foreground">{storeName}</p>
                <p className="text-sm">
                  <span className={promo ? "text-muted-foreground line-through" : "font-medium"}>
                    {brl(produto.price)}
                  </span>
                  {promo ? (
                    <span className="ml-2 font-semibold text-primary">
                      {brl(promo)} <span className="text-xs font-normal">no FlyDelivery</span>
                    </span>
                  ) : null}
                </p>
              </div>
            </div>

            {/* 2. Os pacotes */}
            <div className="space-y-2">
              <p className="font-semibold">Por quanto tempo você quer impulsionar este produto?</p>
              {carregando ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : pacotes.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Nenhum pacote disponível no momento.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup">
                  {pacotes.map((p) => {
                    const marcado = p.id === pacoteId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={marcado}
                        onClick={() => setPacoteId(p.id)}
                        className={`min-h-[64px] rounded-xl border-2 px-3 py-2 text-left transition-colors ${
                          marcado
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/40 hover:bg-muted"
                        }`}
                      >
                        <span className="block text-sm font-semibold">{p.label}</span>
                        <span
                          className={`block text-lg font-extrabold tabular-nums ${marcado ? "text-primary" : ""}`}
                        >
                          {p.price_cents > 0 ? reaisDeCentavos(p.price_cents) : "Grátis"}
                        </span>
                        {p.description ? (
                          <span className="block text-[11px] leading-tight text-muted-foreground">
                            {p.description}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Início */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4" /> Quando começa
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={agendar ? "outline" : "default"}
                  onClick={() => setAgendar(false)}
                >
                  Agora
                </Button>
                <Button
                  type="button"
                  variant={agendar ? "default" : "outline"}
                  onClick={() => setAgendar(true)}
                >
                  Agendar
                </Button>
              </div>
              {agendar ? (
                <Input
                  type="date"
                  aria-label="Dia de início"
                  min={hoje}
                  max={ultimoDia}
                  value={dia}
                  onChange={(e) => setDia(e.target.value || hoje)}
                  className="w-full sm:w-fit"
                />
              ) : null}
            </div>

            {/* 3. Resumo */}
            <div className="rounded-lg border">
              <p className="border-b px-3 py-2 text-sm font-semibold">Resumo</p>
              <dl className="divide-y text-sm">
                <Linha rotulo="Produto" valor={produto.name} />
                <Linha rotulo="Período" valor={pacote?.label ?? "—"} />
                <Linha rotulo="Valor" valor={valor} destaque />
                <Linha
                  rotulo="Início"
                  valor={agendar && dia > hoje ? dataLonga(inicio) : "Agora, assim que confirmar"}
                />
                <Linha rotulo="Término" valor={termino ? dataCurta(termino.toISOString()) : "—"} />
              </dl>
            </div>

            {/* 4. Cobrança */}
            <div className="space-y-1.5 rounded-lg bg-muted/60 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-semibold">
                <ReceiptText className="h-4 w-4" /> Cobrança
              </p>
              <p>Este valor será adicionado à sua próxima fatura do FlyControl.</p>
              <p className="font-semibold text-success">Você não precisa pagar agora.</p>
              {pacote && pacote.price_cents > 0 ? (
                <p>
                  <strong>{valor}</strong> será adicionado à sua próxima fatura do FlyControl
                  <span className="text-muted-foreground"> ({quando})</span>.
                </p>
              ) : null}
            </div>

            {/* Prévia */}
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Como vai aparecer no aplicativo
              </summary>
              <div className="pt-3">
                <PreviaDoBanner produto={produto} storeName={storeName} promo={promo} />
              </div>
            </details>

            {/* 5. Ciente */}
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
              <Checkbox
                checked={ciente}
                onCheckedChange={(v) => setCiente(v === true)}
                className="no-touch-min mt-0.5 h-5 w-5"
              />
              <span>
                Estou ciente de que o valor deste impulsionamento será adicionado à minha próxima
                fatura.
              </span>
            </label>
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 border-t bg-background p-4 sm:flex-row sm:justify-end sm:px-6">
          <Button variant="outline" onClick={onClose} disabled={enviando}>
            Voltar
          </Button>
          <Button onClick={confirmar} disabled={!pacote || !ciente || enviando} size="lg">
            {enviando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="mr-2 h-4 w-4" />
            )}
            Confirmar impulsionamento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className="shrink-0 text-muted-foreground">{rotulo}</dt>
      <dd
        className={`min-w-0 text-right ${destaque ? "text-base font-bold text-primary" : "font-medium"}`}
      >
        {valor}
      </dd>
    </div>
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
