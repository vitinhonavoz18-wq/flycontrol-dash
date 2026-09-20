import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, Loader2, MapPin, Plus, Trash2, Undo2 } from "lucide-react";
import { syncToExternal } from "@/utils/menuSync";
import { formatarTaxa, lerTaxa, pareceEngano } from "@/lib/store/taxaDeEntrega";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
 *
 * EDITAR É EXPLÍCITO, NÃO ADIVINHADO
 *
 * Antes a taxa era gravada sozinha quando o campo perdia o foco. No celular
 * isso é invisível: o dono toca em outro lugar e não sabe se salvou. Agora
 * cada linha mostra "Salvar" e "Desfazer" assim que muda alguma coisa, e não
 * grava nada enquanto ele não mandar.
 */

type Zona = {
  id: string;
  neighborhood: string;
  fee: number;
  sort_order: number;
  external_id: string | null;
};

/** O que está sendo digitado numa linha, antes de mandar salvar. */
type Rascunho = { neighborhood: string; fee: string };

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
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});
  const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(false);
  const [limpando, setLimpando] = useState(false);

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
    if (pareceEngano(taxa) && !confirm(`Taxa de ${formatarTaxa(taxa)} para ${bairro}. Confirma?`)) {
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
        `${bairro} foi salvo no painel, mas ainda não apareceu no cardápio online. Tente salvar a taxa de novo em instantes para publicar.`,
      );
  }

  /** O que está na tela para esta linha: o que ele digitou, ou o que está salvo. */
  function rascunhoDe(zona: Zona): Rascunho {
    return rascunhos[zona.id] ?? { neighborhood: zona.neighborhood, fee: formatarTaxa(zona.fee) };
  }

  function editar(zona: Zona, campo: keyof Rascunho, valor: string) {
    setRascunhos((prev) => ({ ...prev, [zona.id]: { ...rascunhoDe(zona), [campo]: valor } }));
  }

  function desfazer(zona: Zona) {
    setRascunhos((prev) => {
      const { [zona.id]: _fora, ...resto } = prev;
      return resto;
    });
  }

  function foiAlterada(zona: Zona): boolean {
    const r = rascunhos[zona.id];
    if (!r) return false;
    return r.neighborhood.trim() !== zona.neighborhood || lerTaxa(r.fee) !== zona.fee;
  }

  /**
   * Salva o nome e a taxa de um bairro JÁ cadastrado.
   *
   * O nome entra junto porque corrigir um erro de digitação não pode exigir
   * apagar o bairro e cadastrar de novo — apagar tira ele do cardápio no meio
   * do expediente, e cliente que estava escolhendo naquele instante perde a
   * opção.
   */
  async function salvarLinha(zona: Zona) {
    const r = rascunhoDe(zona);
    const bairro = r.neighborhood.trim();
    const taxa = lerTaxa(r.fee);

    if (!bairro) {
      toast.error("O nome do bairro não pode ficar em branco.");
      return;
    }
    if (taxa === null) {
      toast.error("A taxa precisa ser um valor válido, como 5,00.");
      return;
    }
    if (
      pareceEngano(taxa) &&
      taxa !== zona.fee &&
      !confirm(`Taxa de ${formatarTaxa(taxa)} para ${bairro}. Confirma?`)
    ) {
      return;
    }
    const mudouNome = bairro.toLowerCase() !== zona.neighborhood.trim().toLowerCase();
    if (
      mudouNome &&
      zonas.some(
        (z) => z.id !== zona.id && z.neighborhood.trim().toLowerCase() === bairro.toLowerCase(),
      )
    ) {
      toast.error(`O bairro "${bairro}" já está na lista.`);
      return;
    }

    setSalvando(zona.id);
    const { error } = await supabase
      .from("delivery_zones")
      .update({ neighborhood: bairro, fee: taxa, updated_at: new Date().toISOString() })
      .eq("id", zona.id);

    if (error) {
      const repetido = (error as { code?: string }).code === "23505";
      toast.error(
        repetido
          ? `O bairro "${bairro}" já está cadastrado nesta loja.`
          : "Não consegui salvar: " + error.message,
      );
      setSalvando(null);
      return;
    }

    const atualizada = { ...zona, neighborhood: bairro, fee: taxa };
    setZonas((prev) => prev.map((z) => (z.id === zona.id ? atualizada : z)));

    const pub = await publicar(zona.external_id ? "update" : "create", atualizada);

    if (pub.externalId && !zona.external_id) {
      await supabase
        .from("delivery_zones")
        .update({ external_id: pub.externalId })
        .eq("id", zona.id);
      setZonas((prev) =>
        prev.map((z) => (z.id === zona.id ? { ...z, external_id: pub.externalId! } : z)),
      );
    }

    desfazer(zona);
    setSalvando(null);

    if (pub.ok) toast.success(`${bairro} atualizado no cardápio.`);
    else
      toast.warning(
        `Salvo no painel, mas o cardápio online ainda mostra o valor anterior. Tente de novo em instantes.`,
      );
  }

  /**
   * Tira UM bairro do ar.
   *
   * A ordem importa: sai do cardápio ANTES de sair daqui. Na ordem contrária,
   * uma falha na publicação deixaria o bairro sumido do painel e ainda de pé
   * no site — o cliente escolheria um bairro que a loja não atende mais, e o
   * dono não teria nem como corrigir, porque a linha já não existiria.
   */
  async function removerUma(zona: Zona): Promise<boolean> {
    if (zona.external_id) {
      const pub = await publicar("delete", zona);
      if (!pub.ok) return false;
    }
    const { error } = await supabase.from("delivery_zones").delete().eq("id", zona.id);
    return !error;
  }

  async function remover(zona: Zona) {
    if (!confirm(`Remover o bairro "${zona.neighborhood}"? Ele deixa de aparecer no cardápio.`))
      return;

    setSalvando(zona.id);
    const ok = await removerUma(zona);
    setSalvando(null);

    if (!ok) {
      toast.error(
        "Não consegui tirar este bairro do cardápio online agora. Nada foi removido — tente de novo em instantes.",
      );
      return;
    }

    setZonas((prev) => prev.filter((z) => z.id !== zona.id));
    desfazer(zona);
    toast.success(`${zona.neighborhood} removido.`);
  }

  /**
   * Limpa a lista inteira, para começar do zero.
   *
   * Vai um por um, e cada um passa pelo mesmo caminho de sempre: sai do
   * cardápio primeiro, depois do painel. Um "apaga tudo" direto no banco
   * deixaria os bairros de pé no site do cliente, e o dono ficaria sem nenhum
   * jeito de tirá-los de lá.
   *
   * Se algum não der certo, ele CONTINUA na lista e o aviso diz quantos e
   * quais ficaram. Dizer "pronto, apagou tudo" com bairro ainda no ar seria
   * pior do que não ter o botão.
   */
  async function limparTudo() {
    setLimpando(true);
    const sobraram: Zona[] = [];
    let removidos = 0;

    for (const zona of zonas) {
      // Um de cada vez, de propósito: o cardápio online é o mesmo destino
      // para todos, e disparar tudo junto já derrubou sincronização antes.
      const ok = await removerUma(zona);
      if (ok) removidos++;
      else sobraram.push(zona);
    }

    setZonas(sobraram);
    setRascunhos({});
    setLimpando(false);
    setConfirmandoLimpeza(false);

    if (sobraram.length === 0) {
      toast.success(
        `${removidos} bairro${removidos === 1 ? "" : "s"} removido${removidos === 1 ? "" : "s"}. O cardápio volta a cobrar a taxa padrão para todo mundo.`,
      );
    } else {
      toast.warning(
        `Removi ${removidos}, mas ${sobraram.length} não saíram do cardápio online: ${sobraram
          .map((z) => z.neighborhood)
          .join(", ")}. Eles continuam na lista — tente de novo em instantes.`,
      );
    }
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
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {zonas.length} bairro{zonas.length === 1 ? "" : "s"} na lista. Toque no nome ou na
              taxa para corrigir.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={limpando || salvando !== null}
              onClick={() => setConfirmandoLimpeza(true)}
            >
              <Trash2 className="h-4 w-4" />
              Excluir todos
            </Button>
          </div>

          <div className="space-y-2">
            {zonas.map((zona) => {
              const r = rascunhoDe(zona);
              const mudou = foiAlterada(zona);
              const ocupada = salvando === zona.id || limpando;
              return (
                <div
                  key={zona.id}
                  className={`rounded-lg border bg-card p-3 transition-colors ${
                    mudou ? "border-primary/50 bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[140px] flex-1 space-y-1">
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Bairro
                      </Label>
                      <Input
                        value={r.neighborhood}
                        disabled={ocupada}
                        aria-label={`Nome do bairro ${zona.neighborhood}`}
                        onChange={(e) => editar(zona, "neighborhood", e.target.value)}
                      />
                    </div>
                    <div className="w-28 space-y-1">
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Taxa (R$)
                      </Label>
                      <Input
                        value={r.fee}
                        inputMode="decimal"
                        disabled={ocupada}
                        aria-label={`Taxa de ${zona.neighborhood}`}
                        onChange={(e) => editar(zona, "fee", e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && mudou && salvarLinha(zona)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover ${zona.neighborhood}`}
                      disabled={ocupada}
                      onClick={() => remover(zona)}
                    >
                      {salvando === zona.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </div>

                  {/* Só aparece depois que ele mexe em alguma coisa. Botão de
                      salvar sempre à vista em toda linha vira ruído, e ruído a
                      gente aprende a não ler. */}
                  {mudou && (
                    <div className="mt-3 flex items-center justify-end gap-2 border-t pt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        disabled={ocupada}
                        onClick={() => desfazer(zona)}
                      >
                        <Undo2 className="h-3.5 w-3.5" /> Desfazer
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={ocupada}
                        onClick={() => salvarLinha(zona)}
                      >
                        {salvando === zona.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Salvar
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
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
        <Button onClick={adicionar} disabled={salvando === "novo" || limpando} className="gap-2">
          {salvando === "novo" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Adicionar
        </Button>
      </div>

      <AlertDialog
        open={confirmandoLimpeza}
        onOpenChange={(aberto) => !limpando && setConfirmandoLimpeza(aberto)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {zonas.length} bairro{zonas.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Todos saem do cardápio online na hora. A partir daí, o cliente de qualquer bairro
              passa a pagar a Taxa de Entrega Padrão até você cadastrar a lista de novo. Isso não
              tem como desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={limpando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={limpando}
              className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                // O diálogo fecha sozinho ao clicar, e fechar no meio da
                // limpeza esconderia o que ainda está acontecendo.
                e.preventDefault();
                void limparTudo();
              }}
            >
              {limpando && <Loader2 className="h-4 w-4 animate-spin" />}
              {limpando ? "Removendo…" : "Sim, excluir todos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
