/**
 * Aba "Produtos em Vitrine" do FlyDelivery.
 *
 * O lojista escolhe até 3 produtos do PRÓPRIO cardápio para aparecerem como
 * ofertas no aplicativo. Nada é cadastrado de novo: a vitrine guarda só qual
 * produto e em que posição. Nome, foto e preços vêm do cadastro do produto —
 * mudou lá, muda na vitrine.
 *
 * QUEM CONFERE É O BANCO
 *
 * Limite de 3, produto ser da loja, foto, promoção válida: tudo isso é
 * conferido no banco (ver `lib/flydelivery/vitrine.ts`). Esta tela explica e
 * desabilita botões para ajudar — mas, se alguém burlar a tela, o banco recusa
 * do mesmo jeito.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Check,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Repeat,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { LIMITE_DA_VITRINE, checklist, percentualDeDesconto } from "@/lib/flydelivery/vitrine";

type Candidato = {
  product_id: string;
  name: string;
  image_url: string | null;
  price: number;
  promo_price: number | null;
  active: boolean;
  available: boolean;
  category_name: string | null;
  product_type: string | null;
  issues: string[];
  showcase_id: string | null;
  display_order: number | null;
  moderation_status: string | null;
};

type Props = {
  pizzeriaId: string;
  storeName: string;
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/** Traduz a recusa do banco em algo que o lojista entende. */
function mensagemDoBanco(error: { code?: string; message?: string }): string {
  if (error.code === "23514") return "Este produto não cumpre os requisitos da vitrine.";
  if (error.code === "23505") {
    return "A vitrine mudou enquanto você mexia (talvez em outra aba). Recarregamos a lista.";
  }
  if (error.code === "42501") return "Sem permissão para alterar a vitrine desta loja.";
  return error.message ?? "Não foi possível salvar.";
}

export function VitrineManager({ pizzeriaId, storeName }: Props) {
  const router = useRouter();
  const [itens, setItens] = useState<Candidato[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  /** Posição que está sendo trocada, quando o lojista clicou em "Trocar". */
  const [trocando, setTrocando] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase.rpc("flydelivery_showcase_candidates", {
      p_pizzeria_id: pizzeriaId,
    });
    if (error) toast.error("Erro ao carregar a vitrine: " + mensagemDoBanco(error));
    setItens((data ?? []) as unknown as Candidato[]);
    setCarregando(false);
  }, [pizzeriaId]);

  useEffect(() => {
    setTrocando(null);
    carregar();
  }, [carregar]);

  const selecionados = useMemo(
    () =>
      itens
        .filter((i) => i.showcase_id)
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
    [itens],
  );
  const cheia = selecionados.length >= LIMITE_DA_VITRINE;

  const candidatos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter(
      (i) => !i.showcase_id && i.active && (!q || i.name.toLowerCase().includes(q)),
    );
  }, [itens, busca]);

  const editarProduto = (item: Candidato) => {
    const aba = item.product_type === "beverage" ? "beverages" : "products";
    router.history.push(
      `/menu?pizzeriaId=${encodeURIComponent(pizzeriaId)}&aba=${aba}&produto=${encodeURIComponent(item.product_id)}`,
    );
  };

  const posicaoLivre = () => {
    const ocupadas = new Set(selecionados.map((s) => s.display_order));
    for (let p = 1; p <= LIMITE_DA_VITRINE; p++) if (!ocupadas.has(p)) return p;
    return null;
  };

  const adicionar = async (item: Candidato) => {
    if (salvando) return;
    setSalvando(true);
    try {
      if (trocando !== null) {
        const alvo = selecionados.find((s) => s.display_order === trocando);
        if (!alvo?.showcase_id) return;
        const { error } = await supabase
          .from("flydelivery_showcase_products")
          .update({ product_id: item.product_id })
          .eq("id", alvo.showcase_id);
        if (error) throw error;
        toast.success(`“${item.name}” entrou no lugar de “${alvo.name}”.`);
        setTrocando(null);
      } else {
        const posicao = posicaoLivre();
        if (posicao === null) {
          toast.error("A vitrine já tem 3 produtos. Remova ou troque um deles.");
          return;
        }
        const { error } = await supabase.from("flydelivery_showcase_products").insert({
          pizzeria_id: pizzeriaId,
          product_id: item.product_id,
          display_order: posicao,
        });
        if (error) throw error;
        toast.success(`“${item.name}” está na vitrine.`);
      }
    } catch (error) {
      toast.error(mensagemDoBanco(error as { code?: string; message?: string }));
    } finally {
      setSalvando(false);
      carregar();
    }
  };

  const remover = async (item: Candidato) => {
    if (!item.showcase_id || salvando) return;
    setSalvando(true);
    const { error } = await supabase
      .from("flydelivery_showcase_products")
      .delete()
      .eq("id", item.showcase_id);
    setSalvando(false);
    if (error) toast.error(mensagemDoBanco(error));
    else toast.success(`“${item.name}” saiu da vitrine.`);
    if (trocando === item.display_order) setTrocando(null);
    carregar();
  };

  if (carregando && itens.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Produtos em Vitrine
              </CardTitle>
              <CardDescription>
                Escolha até 3 produtos promocionais para ganhar destaque no FlyDelivery.
              </CardDescription>
            </div>
            <Badge variant={cheia ? "default" : "secondary"} className="shrink-0 text-sm">
              {cheia
                ? `${LIMITE_DA_VITRINE} de ${LIMITE_DA_VITRINE} produtos selecionados`
                : `${selecionados.length}/${LIMITE_DA_VITRINE} selecionados`}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {selecionados.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nenhum produto na vitrine ainda. Escolha abaixo um produto com foto e preço
              promocional.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {selecionados.map((item) => (
                <SelecionadoCard
                  key={item.product_id}
                  item={item}
                  storeName={storeName}
                  trocandoEste={trocando === item.display_order}
                  salvando={salvando}
                  onRemover={() => remover(item)}
                  onTrocar={() =>
                    setTrocando((t) => (t === item.display_order ? null : item.display_order))
                  }
                  onEditar={() => editarProduto(item)}
                />
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Esses produtos poderão aparecer como ofertas para clientes próximos ao seu
            estabelecimento. O preço promocional vale só no FlyDelivery — no site de pedidos e no
            balcão continua o preço normal.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {trocando !== null
              ? `Escolha o produto que vai para a posição ${trocando}`
              : "Produtos do cardápio"}
          </CardTitle>
          <CardDescription>
            Para entrar na vitrine, o produto precisa estar ativo e disponível, ter foto, preço
            normal e um preço promocional menor que o normal. A promoção é cadastrada no próprio
            produto, em Cardápio → editar → “Promoção no app”.
          </CardDescription>
          {trocando !== null ? (
            <Button variant="outline" size="sm" className="w-fit" onClick={() => setTrocando(null)}>
              <X className="mr-1 h-4 w-4" /> Cancelar troca
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto"
              className="pl-9"
            />
          </div>

          {candidatos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum produto encontrado.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {candidatos.map((item) => (
                <CandidatoLinha
                  key={item.product_id}
                  item={item}
                  bloqueadoPorLimite={cheia && trocando === null}
                  trocando={trocando}
                  salvando={salvando}
                  onAdicionar={() => adicionar(item)}
                  onEditar={() => editarProduto(item)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Foto({ url, className }: { url: string | null; className: string }) {
  return url && /^https?:\/\//i.test(url) ? (
    <img src={url} alt="" loading="lazy" className={`${className} object-cover`} />
  ) : (
    <div className={`${className} flex items-center justify-center bg-muted`}>
      <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
    </div>
  );
}

function Pendencias({ issues }: { issues: string[] }) {
  return (
    <ul className="space-y-0.5 text-xs">
      {checklist(issues).map((linha) => (
        <li
          key={linha.rotulo}
          className={linha.ok ? "text-muted-foreground" : "font-medium text-destructive"}
        >
          {linha.ok ? "✓" : "✕"} {linha.rotulo}
          {!linha.ok && linha.motivo ? (
            <span className="block pl-4 font-normal text-muted-foreground">{linha.motivo}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Um produto que já está na vitrine — do jeito que o cliente vê no app. */
function SelecionadoCard({
  item,
  storeName,
  trocandoEste,
  salvando,
  onRemover,
  onTrocar,
  onEditar,
}: {
  item: Candidato;
  storeName: string;
  trocandoEste: boolean;
  salvando: boolean;
  onRemover: () => void;
  onTrocar: () => void;
  onEditar: () => void;
}) {
  const bloqueado = item.moderation_status === "blocked";
  const pausado = !bloqueado && item.issues.length > 0;
  const desconto = item.promo_price ? percentualDeDesconto(item.price, item.promo_price) : 0;

  return (
    <div
      className={`overflow-hidden rounded-xl border ${trocandoEste ? "ring-2 ring-primary" : ""}`}
    >
      {/* Prévia do cartão do aplicativo: a foto é a estrela. */}
      <div className="relative">
        <Foto url={item.image_url} className="aspect-[4/3] w-full" />
        <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
          Oferta{desconto > 0 ? ` -${desconto}%` : ""}
        </span>
        <span className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-semibold">
          Posição {item.display_order}
        </span>
      </div>
      <div className="space-y-2 p-3">
        <div className="min-w-0">
          <p className="line-clamp-1 font-semibold">{item.name}</p>
          <p className="line-clamp-1 text-xs text-muted-foreground">{storeName}</p>
        </div>
        <div className="flex items-baseline gap-2">
          {item.promo_price && item.promo_price < item.price ? (
            <>
              <span className="text-xs text-muted-foreground line-through">{brl(item.price)}</span>
              <span className="font-bold text-primary">{brl(item.promo_price)}</span>
            </>
          ) : (
            <span className="font-bold">{brl(item.price)}</span>
          )}
        </div>

        {bloqueado ? (
          <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            Vitrine bloqueada pela administração do FlyControl. Fale com o suporte.
          </p>
        ) : pausado ? (
          <div className="space-y-2 rounded-md bg-amber-500/10 p-2">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              Vitrine pausada — produto não atende mais aos requisitos.
            </p>
            <Pendencias issues={item.issues} />
          </div>
        ) : (
          <p className="flex items-center gap-1 text-xs font-medium text-success">
            <Check className="h-3.5 w-3.5" /> Na vitrine
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {pausado ? (
            <Button size="sm" variant="outline" onClick={onEditar}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Editar produto
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={trocandoEste ? "default" : "outline"}
            onClick={onTrocar}
            disabled={salvando}
          >
            <Repeat className="mr-1 h-3.5 w-3.5" /> {trocandoEste ? "Trocando…" : "Trocar"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemover} disabled={salvando}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover
          </Button>
        </div>
      </div>
    </div>
  );
}

function CandidatoLinha({
  item,
  bloqueadoPorLimite,
  trocando,
  salvando,
  onAdicionar,
  onEditar,
}: {
  item: Candidato;
  bloqueadoPorLimite: boolean;
  trocando: number | null;
  salvando: boolean;
  onAdicionar: () => void;
  onEditar: () => void;
}) {
  const elegivel = item.issues.length === 0;
  const temPromo = item.promo_price != null && item.promo_price < item.price;

  return (
    <li className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 gap-3">
        <Foto url={item.image_url} className="h-16 w-16 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="line-clamp-1 font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground">{item.category_name ?? "Sem categoria"}</p>
          <p className="text-sm">
            <span className={temPromo ? "text-muted-foreground line-through" : ""}>
              {brl(item.price)}
            </span>
            {temPromo ? (
              <span className="ml-2 font-semibold text-primary">{brl(item.promo_price!)}</span>
            ) : null}
          </p>
          {elegivel ? (
            <Badge variant="secondary" className="bg-success/15 text-success">
              Elegível
            </Badge>
          ) : (
            <div className="space-y-1">
              <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                Pendência
              </Badge>
              <p className="text-xs font-medium">Produto não elegível para vitrine.</p>
              <Pendencias issues={item.issues} />
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2 sm:flex-col sm:items-end">
        {elegivel ? (
          <Button size="sm" onClick={onAdicionar} disabled={salvando || bloqueadoPorLimite}>
            {trocando !== null ? `Colocar na posição ${trocando}` : "Adicionar à vitrine"}
          </Button>
        ) : (
          <>
            <Button size="sm" disabled>
              Adicionar à vitrine
            </Button>
            <Button size="sm" variant="outline" onClick={onEditar}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Editar produto
            </Button>
          </>
        )}
        {elegivel && bloqueadoPorLimite ? (
          <p className="text-[11px] text-muted-foreground">
            Remova ou troque um produto para liberar.
          </p>
        ) : null}
      </div>
    </li>
  );
}
