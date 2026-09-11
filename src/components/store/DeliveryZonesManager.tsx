import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { syncToExternal } from "@/utils/menuSync";

/**
 * Os bairros que a loja atende, cada um com a sua taxa de entrega.
 *
 * O QUE ISSO RESOLVE
 *
 * Antes existia UMA taxa só para a cidade inteira: quem mora a três
 * quarteirões pagava o mesmo de quem mora do outro lado do rio. O ajuste era
 * feito na mão, por WhatsApp, depois do pedido já fechado — quando o cliente
 * já tinha visto um preço e ia receber outro.
 *
 * Aqui o dono escreve o caderninho uma vez: bairro e preço. No cardápio, o
 * cliente escolhe o bairro dele e já vê a taxa certa antes de fechar o pedido.
 *
 * CADA LINHA VIAJA SOZINHA
 *
 * Salvar aqui grava no painel E publica no cardápio na mesma ação. Se a
 * publicação falhar, o aviso diz isso — em vez de dizer "salvo" e deixar o
 * cliente vendo a taxa antiga.
 */

type Zona = {
  id: string;
  neighborhood: string;
  fee: number;
  sort_order: number;
  external_id: string | null;
};

/** Aceita "5,50" e "5.50" — o lojista digita como quiser. */
function lerTaxa(texto: string): number | null {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function formatarTaxa(fee: number): string {
  return fee.toFixed(2).replace(".", ",");
}

/** Só o que este componente precisa saber sobre a loja. */
type LojaParaZonas = {
  id: string;
  slug?: string | null;
  api_key?: string | null;
  sync_endpoint?: string | null;
};

export function DeliveryZonesManager({
  pizzeria,
  ensureSyncEndpoint,
}: {
  pizzeria: LojaParaZonas;
  /** Resolve (e cria, se preciso) o endereço do cardápio online. */
  ensureSyncEndpoint: (pz: LojaParaZonas) => Promise<string | undefined>;
}) {
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [novoBairro, setNovoBairro] = useState("");
  const [novaTaxa, setNovaTaxa] = useState("");

  useEffect(() => {
    if (!pizzeria?.id) return;
    let ativo = true;
    (async () => {
      setCarregando(true);
      const { data, error } = await supabase
        .from("delivery_zones")
        .select("id, neighborhood, fee, sort_order, external_id")
        .eq("pizzeria_id", pizzeria.id)
        .order("sort_order")
        .order("neighborhood");
      if (!ativo) return;
      if (error) toast.error("Não consegui carregar os bairros: " + error.message);
      else setZonas(((data ?? []) as Zona[]).map((z) => ({ ...z, fee: Number(z.fee) })));
      setCarregando(false);
    })();
    return () => {
      ativo = false;
    };
  }, [pizzeria?.id]);

  /**
   * Leva uma zona para o cardápio online.
   *
   * Devolve o id que o SiteCreatorFly deu para ela (na criação), ou `null`
   * quando não deu para publicar. Quem chamou decide o que dizer ao lojista —
   * aqui não se engole erro em silêncio.
   */
  async function publicar(
    acao: "create" | "update" | "delete",
    zona: { neighborhood?: string; fee?: number; sort_order?: number; external_id?: string | null },
  ): Promise<{ ok: boolean; externalId?: string }> {
    if (!pizzeria?.slug || !pizzeria?.api_key) {
      return { ok: false };
    }

    let endpoint = pizzeria.sync_endpoint;
    if (!endpoint) endpoint = await ensureSyncEndpoint(pizzeria);
    if (!endpoint) return { ok: false };

    const r = await syncToExternal({
      type: "delivery_zone",
      action: acao,
      externalId: zona.external_id ?? undefined,
      pizzeriaSlug: pizzeria.slug,
      pizzeriaApiKey: pizzeria.api_key,
      syncEndpoint: endpoint,
      data: {
        neighborhood: zona.neighborhood,
        fee: zona.fee,
        sort_order: zona.sort_order ?? 0,
      },
    });

    return { ok: r.success, externalId: r.externalId };
  }

  async function adicionar() {
    const bairro = novoBairro.trim();
    const taxa = lerTaxa(novaTaxa || "0");

    if (!bairro) {
      toast.error("Escreva o nome do bairro.");
      return;
    }
    if (taxa === null) {
      toast.error("A taxa precisa ser um valor válido, como 5,00.");
      return;
    }
    // Conferido aqui só para dar um aviso claro. Quem garante de verdade é o
    // índice único do banco — a tela pode estar desatualizada, o banco não.
    if (zonas.some((z) => z.neighborhood.trim().toLowerCase() === bairro.toLowerCase())) {
      toast.error(`O bairro "${bairro}" já está na lista.`);
      return;
    }

    setSalvando("novo");
    const ordem = zonas.length;

    const { data, error } = await supabase
      .from("delivery_zones")
      .insert({
        pizzeria_id: pizzeria.id,
        neighborhood: bairro,
        fee: taxa,
        sort_order: ordem,
      })
      .select("id, neighborhood, fee, sort_order, external_id")
      .single();

    if (error || !data) {
      // 23505 é a caneta travando no caderno de reservas: bairro repetido.
      const repetido = (error as { code?: string } | null)?.code === "23505";
      toast.error(
        repetido
          ? `O bairro "${bairro}" já está cadastrado nesta loja.`
          : "Não consegui salvar: " + (error?.message ?? "erro desconhecido"),
      );
      setSalvando(null);
      return;
    }

    const nova = { ...(data as Zona), fee: Number((data as Zona).fee) };
    const pub = await publicar("create", { ...nova, external_id: null });

    if (pub.ok && pub.externalId) {
      await supabase
        .from("delivery_zones")
        .update({ external_id: pub.externalId })
        .eq("id", nova.id);
      nova.external_id = pub.externalId;
    }

    setZonas((prev) => [...prev, nova]);
    setNovoBairro("");
    setNovaTaxa("");
    setSalvando(null);

    if (pub.ok) toast.success(`${bairro} adicionado e publicado no cardápio.`);
    else
      toast.warning(
        `${bairro} foi salvo no painel, mas ainda não apareceu no cardápio online. Tente editar a taxa em instantes para publicar de novo.`,
      );
  }

  async function alterarTaxa(zona: Zona, texto: string) {
    const taxa = lerTaxa(texto);
    if (taxa === null) {
      toast.error("A taxa precisa ser um valor válido, como 5,00.");
      return;
    }
    if (taxa === zona.fee) return;

    setSalvando(zona.id);
    const { error } = await supabase
      .from("delivery_zones")
      .update({ fee: taxa, updated_at: new Date().toISOString() })
      .eq("id", zona.id);

    if (error) {
      toast.error("Não consegui salvar: " + error.message);
      setSalvando(null);
      return;
    }

    setZonas((prev) => prev.map((z) => (z.id === zona.id ? { ...z, fee: taxa } : z)));

    const pub = await publicar(zona.external_id ? "update" : "create", { ...zona, fee: taxa });

    if (pub.externalId && !zona.external_id) {
      await supabase
        .from("delivery_zones")
        .update({ external_id: pub.externalId })
        .eq("id", zona.id);
      setZonas((prev) =>
        prev.map((z) => (z.id === zona.id ? { ...z, external_id: pub.externalId! } : z)),
      );
    }

    setSalvando(null);
    if (pub.ok) toast.success(`Taxa de ${zona.neighborhood} atualizada no cardápio.`);
    else
      toast.warning(
        `Taxa salva no painel, mas o cardápio online ainda mostra a anterior. Tente de novo em instantes.`,
      );
  }

  async function remover(zona: Zona) {
    if (!confirm(`Remover o bairro "${zona.neighborhood}"? Ele deixa de aparecer no cardápio.`))
      return;

    setSalvando(zona.id);

    // Tira do cardápio ANTES de tirar daqui.
    //
    // Na ordem contrária, uma falha na publicação deixaria o bairro sumido do
    // painel e ainda de pé no site — o cliente escolheria um bairro que a loja
    // não atende mais, e o dono não teria nem como corrigir, porque a linha já
    // não existiria para ele.
    if (zona.external_id) {
      const pub = await publicar("delete", zona);
      if (!pub.ok) {
        toast.error(
          "Não consegui tirar este bairro do cardápio online agora. Nada foi removido — tente de novo em instantes.",
        );
        setSalvando(null);
        return;
      }
    }

    const { error } = await supabase.from("delivery_zones").delete().eq("id", zona.id);
    if (error) {
      toast.error("Não consegui remover: " + error.message);
      setSalvando(null);
      return;
    }

    setZonas((prev) => prev.filter((z) => z.id !== zona.id));
    setSalvando(null);
    toast.success(`${zona.neighborhood} removido.`);
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando bairros…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {zonas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <MapPin className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm font-medium">Nenhum bairro cadastrado ainda</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Enquanto a lista estiver vazia, o cardápio cobra a taxa padrão para todo mundo. Cadastre
            os bairros que você atende para cada um ter o seu preço.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {zonas.map((zona) => (
            <div
              key={zona.id}
              className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{zona.neighborhood}</p>
              </div>
              <div className="w-32 space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Taxa (R$)
                </Label>
                <Input
                  defaultValue={formatarTaxa(zona.fee)}
                  inputMode="decimal"
                  disabled={salvando === zona.id}
                  onBlur={(e) => alterarTaxa(zona, e.target.value)}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover ${zona.neighborhood}`}
                disabled={salvando === zona.id}
                onClick={() => remover(zona)}
              >
                {salvando === zona.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 text-destructive" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <div className="min-w-[160px] flex-1 space-y-1">
          <Label htmlFor="novo-bairro" className="text-xs">
            Bairro
          </Label>
          <Input
            id="novo-bairro"
            placeholder="Ex: Centro"
            value={novoBairro}
            onChange={(e) => setNovoBairro(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionar()}
          />
        </div>
        <div className="w-32 space-y-1">
          <Label htmlFor="nova-taxa" className="text-xs">
            Taxa (R$)
          </Label>
          <Input
            id="nova-taxa"
            placeholder="5,00"
            inputMode="decimal"
            value={novaTaxa}
            onChange={(e) => setNovaTaxa(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionar()}
          />
        </div>
        <Button onClick={adicionar} disabled={salvando === "novo"} className="gap-2">
          {salvando === "novo" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Adicionar
        </Button>
      </div>
    </div>
  );
}
