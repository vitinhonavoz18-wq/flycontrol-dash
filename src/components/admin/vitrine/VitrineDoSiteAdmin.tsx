import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { paraEnderecoComCache } from "@/lib/midia/enderecoComCache";
import { classificarComida, TIPOS_DE_COMIDA, type TipoDeComida } from "@/lib/vitrine/vitrine";

/**
 * VITRINE DO SITE — a tela onde a equipe escolhe os alimentos que flutuam no
 * topo da página inicial.
 *
 * O caminho de um produto até o site:
 *
 *   1. a equipe ADICIONA (escolha manual, já aprovada) ou pede SUGESTÕES
 *      (escolha automática, que espera aprovação);
 *   2. o processo de recorte, que roda sozinho no GitHub de hora em hora,
 *      tira o fundo da foto e confere a qualidade;
 *   3. pronto + aprovado + ligado = aparece no site em até 10 minutos.
 *
 * Por que aprovação: a foto é do restaurante, e colocá-la na vitrine da
 * plataforma é divulgação. Alguém da equipe precisa olhar antes — inclusive
 * para não ir ao ar um recorte que saiu torto.
 *
 * Quem pode mexer: só administradores da plataforma. A trava de verdade está
 * no banco (regras de acesso da tabela); esconder a tela é só a placa.
 */

type Linha = {
  id: string;
  product_id: string;
  origin: string;
  approved: boolean;
  enabled: boolean;
  position: number;
  food_kind: string | null;
  display_name: string | null;
  status: string;
  status_detail: string | null;
  cutout_path: string | null;
  menu_products: { name: string; image_url: string | null; pizzeria_id: string } | null;
};

const NOMES_DOS_TIPOS: Record<TipoDeComida, string> = {
  hamburguer: "Hambúrguer",
  pizza: "Pizza",
  acai: "Açaí",
  pastel: "Pastel",
  japonesa: "Comida japonesa",
  salgado: "Salgado / porção",
  doce: "Doce / sobremesa",
  prato: "Prato",
  lanche: "Lanche",
  outro: "Outro",
};

const SITUACAO: Record<string, { texto: string; classe: string }> = {
  pendente: {
    texto: "Na fila do recorte",
    classe: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  processando: { texto: "Recortando…", classe: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  pronto: {
    texto: "Recorte pronto",
    classe: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  falhou: { texto: "Recorte recusado", classe: "bg-destructive/15 text-destructive" },
};

/** Fundo xadrez: mostra que o recorte é transparente de verdade. */
const XADREZ = {
  backgroundColor: "#fff",
  backgroundImage: "conic-gradient(#e4e7ec 25%, transparent 0 50%, #e4e7ec 0 75%, transparent 0)",
  backgroundSize: "16px 16px",
};

function urlDoRecorte(caminho: string | null): string | null {
  if (!caminho) return null;
  return supabase.storage.from("hero-showcase").getPublicUrl(caminho).data.publicUrl;
}

export function VitrineDoSiteAdmin() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");

  const lista = useQuery({
    queryKey: ["admin-vitrine"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hero_showcase_items")
        .select(
          "id, product_id, origin, approved, enabled, position, food_kind, display_name, status, status_detail, cutout_path, menu_products(name, image_url, pizzeria_id)",
        )
        // Mesma ordem do site: escolha manual primeiro ("manual" vem depois de
        // "automatica" no alfabeto, por isso a ordem invertida), depois a posição.
        .order("origin", { ascending: false })
        .order("position")
        .order("created_at");
      if (error) throw error;
      const linhas = (data ?? []) as unknown as Linha[];
      const lojas = [...new Set(linhas.map((l) => l.menu_products?.pizzeria_id).filter(Boolean))];
      const nomes = new Map<string, string>();
      if (lojas.length) {
        const { data: z } = await supabase
          .from("pizzerias")
          .select("id, name")
          .in("id", lojas as string[]);
        for (const loja of z ?? []) nomes.set(loja.id, loja.name);
      }
      return linhas.map((l) => ({
        ...l,
        loja: nomes.get(l.menu_products?.pizzeria_id ?? "") ?? "",
      }));
    },
    // Enquanto há recorte na fila, a tela se atualiza sozinha.
    refetchInterval: (q) =>
      q.state.data?.some((l) => l.status === "pendente" || l.status === "processando")
        ? 30000
        : false,
  });

  const resultados = useQuery({
    queryKey: ["admin-vitrine-busca", termo],
    enabled: termo.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_products")
        .select("id, name, image_url, pizzeria_id, menu_categories(name)")
        .ilike("name", `%${termo.trim()}%`)
        .not("image_url", "is", null)
        .neq("image_url", "")
        .eq("active", true)
        .limit(24);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sugestoes = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("hero_showcase_candidates", { p_limit: 24 });
      if (error) throw error;
      return data ?? [];
    },
    onError: (e: Error) => toast.error(`Não foi possível buscar sugestões: ${e.message}`),
  });

  const recarregar = () => qc.invalidateQueries({ queryKey: ["admin-vitrine"] });

  const adicionar = useMutation({
    mutationFn: async (p: {
      id: string;
      nome: string;
      categoria?: string | null;
      automatica?: boolean;
    }) => {
      const maior = Math.max(0, ...(lista.data ?? []).map((l) => l.position));
      const { error } = await supabase.from("hero_showcase_items").insert({
        product_id: p.id,
        origin: p.automatica ? "automatica" : "manual",
        // Escolha manual já é a aprovação; sugestão automática espera alguém olhar.
        approved: !p.automatica,
        food_kind: classificarComida(p.nome, p.categoria),
        display_name: p.nome,
        position: maior + 10,
      });
      if (error) throw error;
    },
    onSuccess: (_, p) => {
      toast.success(`"${p.nome}" entrou na fila do recorte.`);
      recarregar();
    },
    onError: (e: Error) =>
      toast.error(
        /duplicate|unique/i.test(e.message) ? "Esse produto já está na vitrine." : e.message,
      ),
  });

  const alterar = useMutation({
    mutationFn: async ({
      id,
      campos,
    }: {
      id: string;
      campos: Database["public"]["Tables"]["hero_showcase_items"]["Update"];
    }) => {
      const { error } = await supabase.from("hero_showcase_items").update(campos).eq("id", id);
      if (error) throw error;
    },
    onSuccess: recarregar,
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hero_showcase_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido da vitrine. A foto do cardápio não foi tocada.");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linhas = useMemo(() => lista.data ?? [], [lista.data]);
  const noSite = linhas.filter((l) => l.enabled && l.approved && l.status === "pronto").length;
  const naVitrine = useMemo(() => new Set(linhas.map((l) => l.product_id)), [linhas]);

  function mover(indice: number, direcao: -1 | 1) {
    const outro = linhas[indice + direcao];
    const este = linhas[indice];
    // Só troca de lugar dentro do mesmo grupo (manual com manual).
    if (!outro || !este || outro.origin !== este.origin) return;
    alterar.mutate({ id: este.id, campos: { position: outro.position } });
    alterar.mutate({ id: outro.id, campos: { position: este.position } });
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Vitrine do site</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Os alimentos que flutuam no topo da página inicial, trocando a cada 3 segundos. Só aparece
          no site o que está <strong>aprovado</strong>, <strong>ligado</strong> e com o{" "}
          <strong>recorte pronto</strong>. Hoje no site: <strong>{noSite}</strong>{" "}
          {noSite === 1 ? "produto" : "produtos"}
          {noSite < 2 && " — com menos de dois, o site mostra o hambúrguer da marca"}.
        </p>
        <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
          O recorte (tirar o fundo da foto) roda sozinho no GitHub, de hora em hora: “Actions →
          Vitrine do site — preparar fotos”. Lá também dá para rodar na hora. Mudanças aparecem no
          site em até 10 minutos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Na vitrine</CardTitle>
          <CardDescription>
            Na ordem em que aparecem. A escolha manual vem antes das sugestões.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lista.isPending && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          {lista.isError && (
            <p className="text-sm text-destructive">
              Não foi possível carregar a vitrine. Se a migração “vitrine_do_site” ainda não foi
              aplicada no Supabase, aplique-a primeiro.
            </p>
          )}
          {!lista.isPending && !lista.isError && linhas.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum produto ainda. Busque um produto abaixo ou peça sugestões.
            </p>
          )}
          {linhas.map((l, i) => {
            const recorte = urlDoRecorte(l.cutout_path);
            const original = l.menu_products?.image_url
              ? paraEnderecoComCache(l.menu_products.image_url)
              : null;
            const situacao = SITUACAO[l.status] ?? SITUACAO.pendente;
            return (
              <div
                key={l.id}
                className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center"
              >
                <div className="flex shrink-0 gap-2">
                  {original && (
                    <img
                      src={original}
                      alt=""
                      className="h-20 w-20 rounded-lg object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="grid h-20 w-20 place-items-center rounded-lg" style={XADREZ}>
                    {recorte ? (
                      <img
                        src={recorte}
                        alt="Recorte"
                        className="max-h-[72px] max-w-[72px]"
                        loading="lazy"
                      />
                    ) : (
                      <span className="px-1 text-center text-[10px] text-muted-foreground">
                        sem recorte
                      </span>
                    )}
                  </div>
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="truncate font-semibold">
                    {l.display_name || l.menu_products?.name || "Produto"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{l.loja}</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={situacao.classe}>
                      {situacao.texto}
                    </Badge>
                    <Badge variant="outline">
                      {l.origin === "manual" ? "Escolha manual" : "Sugestão"}
                    </Badge>
                    {!l.approved && (
                      <Badge
                        variant="outline"
                        className="bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      >
                        Aguarda aprovação
                      </Badge>
                    )}
                  </div>
                  {l.status === "falhou" && l.status_detail && (
                    <p className="text-xs text-destructive">{l.status_detail}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={(l.food_kind as TipoDeComida) ?? "outro"}
                    onValueChange={(v) => alterar.mutate({ id: l.id, campos: { food_kind: v } })}
                  >
                    <SelectTrigger className="h-9 w-[150px]" aria-label="Tipo de comida">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_DE_COMIDA.map((t) => (
                        <SelectItem key={t} value={t}>
                          {NOMES_DOS_TIPOS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!l.approved && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={l.status !== "pronto"}
                      title={
                        l.status !== "pronto" ? "Aprove depois de ver o recorte pronto" : undefined
                      }
                      onClick={() => alterar.mutate({ id: l.id, campos: { approved: true } })}
                    >
                      <Check className="mr-1 h-4 w-4" /> Aprovar
                    </Button>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={l.enabled}
                      onCheckedChange={(v) => alterar.mutate({ id: l.id, campos: { enabled: v } })}
                      aria-label="Ligado no site"
                    />
                    Ligado
                  </label>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Subir"
                    disabled={i === 0}
                    onClick={() => mover(i, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Descer"
                    disabled={i === linhas.length - 1}
                    onClick={() => mover(i, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Refazer o recorte"
                    title="Refazer o recorte"
                    onClick={() =>
                      alterar.mutate({
                        id: l.id,
                        // Apagar a "impressão digital" obriga a refazer o recorte
                        // mesmo que a foto não tenha mudado.
                        campos: { status: "pendente", status_detail: null, source_hash: null },
                      })
                    }
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remover da vitrine"
                    className="text-destructive"
                    onClick={() => {
                      if (window.confirm("Tirar este produto da vitrine do site?"))
                        remover.mutate(l.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Adicionar produto</CardTitle>
          <CardDescription>
            Busque pelo nome. Prefira foto grande, nítida, com o alimento inteiro e sem ninguém na
            imagem.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setTermo(busca);
            }}
          >
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Ex.: calabresa, açaí, x-bacon"
              aria-label="Nome do produto"
            />
            <Button type="submit" variant="outline">
              <Search className="mr-1 h-4 w-4" /> Buscar
            </Button>
          </form>
          {resultados.isFetching && (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(resultados.data ?? []).map((p) => {
              const categoria = (p as { menu_categories?: { name?: string } | null })
                .menu_categories?.name;
              const ja = naVitrine.has(p.id);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg border border-border p-2"
                >
                  {p.image_url && (
                    <img
                      src={paraEnderecoComCache(p.image_url)}
                      alt=""
                      className="h-14 w-14 rounded-md object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{categoria}</div>
                  </div>
                  <Button
                    size="sm"
                    disabled={ja || adicionar.isPending}
                    onClick={() => adicionar.mutate({ id: p.id, nome: p.name, categoria })}
                  >
                    {ja ? "Já está" : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sugestões automáticas</CardTitle>
          <CardDescription>
            Produtos ativos, com foto, de lojas ativas, alternando categorias. Entram como sugestão:
            só vão ao site depois que você aprovar o recorte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            onClick={() => sugestoes.mutate()}
            disabled={sugestoes.isPending}
          >
            {sugestoes.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-4 w-4" />
            )}
            Sugerir produtos
          </Button>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(sugestoes.data ?? []).map((p) => {
              const ja = naVitrine.has(p.product_id);
              return (
                <div
                  key={p.product_id}
                  className="flex items-center gap-3 rounded-lg border border-border p-2"
                >
                  <img
                    src={paraEnderecoComCache(p.imagem)}
                    alt=""
                    className="h-14 w-14 rounded-md object-cover"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.nome}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.categoria} · {p.loja}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ja || adicionar.isPending}
                    onClick={() =>
                      adicionar.mutate({
                        id: p.product_id,
                        nome: p.nome,
                        categoria: p.categoria,
                        automatica: true,
                      })
                    }
                  >
                    {ja ? "Já está" : "Sugerir"}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
