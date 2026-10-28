import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2,
  Pizza,
  Save,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Calculator,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { syncToExternal } from "@/utils/menuSync";
import {
  CHAVE_DA_CONFIG,
  NOMES_DAS_REGRAS,
  REGRAS_DE_SABORES,
  calcularPizza,
  chaveDeNome,
  descreverPizza,
  formatarCentavos,
  lerConfigPizzaria,
  reaisParaCentavos,
  validarConfigPizzaria,
  type ConfigPizzaria,
  type RegraDeSabores,
  type RegraSemCombinacao,
} from "@/lib/pizza/motorDePreco";
import {
  gradeParaPrecos,
  montarCatalogoDoPainel,
  textoParaIngredientes,
  type ComplementoDoPainel,
  type ProdutoDoPainel,
  type TamanhoDoPainel,
} from "@/lib/pizza/catalogoDoPainel";

/**
 * Aba "Pizzaria" do cardápio.
 *
 * Tudo aqui grava de verdade: no banco do painel e, quando a loja está
 * conectada, no site de pedidos (pelo mesmo caminho de sincronização das
 * outras abas). Nada é só visual.
 *
 *   1. Regras de preço (maior preço, média, combinação, ou a regra antiga).
 *   2. Quais categorias são de pizza (de onde saem os sabores).
 *   3. Preço de cada sabor em cada tamanho, e ingredientes retiráveis.
 *   4. Preço de bordas e adicionais por tamanho, e quantas vezes o
 *      adicional pode ir na mesma pizza.
 *   5. Combinações com preço fechado (só na regra de combinação).
 *   6. Conferência antes de publicar e simulador de preço.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type Props = {
  pizzeriaId: string;
  pizzeria: any;
  categories: any[];
  onRefresh?: () => void;
};

type Sabor = ProdutoDoPainel & {
  category_id: string | null;
  description?: string | null;
  image_url?: string | null;
  external_id?: string | null;
  max_extras?: number | null;
  product_type?: string | null;
};
type Complemento = ComplementoDoPainel & { external_id?: string | null };
type Tamanho = TamanhoDoPainel & { id: string };

function centavosParaTexto(c: number | undefined): string {
  return typeof c === "number" ? (c / 100).toFixed(2).replace(".", ",") : "";
}

function precosParaGrade(precos: unknown, tamanhos: Tamanho[]): Record<string, string> {
  const obj = (precos && typeof precos === "object" ? precos : {}) as Record<string, number>;
  const porChave: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) porChave[chaveDeNome(k)] = v;
  return Object.fromEntries(
    tamanhos.map((t) => [t.name, centavosParaTexto(porChave[chaveDeNome(t.name)])]),
  );
}

function normalizarIdExterno(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.startsWith("sf_cat_") ? id.slice("sf_cat_".length) : id;
}

export function PizzariaPremium({ pizzeriaId, pizzeria, categories, onRefresh }: Props) {
  const [carregando, setCarregando] = useState(true);
  const [tamanhos, setTamanhos] = useState<Tamanho[]>([]);
  const [produtos, setProdutos] = useState<Sabor[]>([]);
  const [complementos, setComplementos] = useState<Complemento[]>([]);
  const [config, setConfig] = useState<ConfigPizzaria>(() =>
    lerConfigPizzaria(pizzeria?.site_settings?.[CHAVE_DA_CONFIG]),
  );
  const [salvandoRegras, setSalvandoRegras] = useState(false);
  const [categoriasPizza, setCategoriasPizza] = useState<string[]>(
    categories.filter((c) => c.is_pizza).map((c) => c.id),
  );

  // Grades em edição (texto digitado), por id.
  const [gradeSabor, setGradeSabor] = useState<Record<string, Record<string, string>>>({});
  const [ingredientesTexto, setIngredientesTexto] = useState<Record<string, string>>({});
  const [gradeComplemento, setGradeComplemento] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [maxQtd, setMaxQtd] = useState<Record<string, string>>({});
  const [salvandoLinha, setSalvandoLinha] = useState<string | null>(null);

  const conectada = !!(pizzeria?.slug && pizzeria?.api_key && pizzeria?.sync_endpoint);

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pizzeriaId]);

  async function carregar() {
    setCarregando(true);
    const db = supabase as any;
    const [t, p, e] = await Promise.all([
      db.from("pizzeria_pizza_sizes").select("*").eq("pizzeria_id", pizzeriaId).order("sort_order"),
      db.from("menu_products").select("*").eq("pizzeria_id", pizzeriaId).order("name"),
      db.from("menu_extras").select("*").eq("pizzeria_id", pizzeriaId).order("name"),
    ]);
    if (t.error || p.error || e.error) {
      toast.error("Erro ao carregar a pizzaria: " + (t.error || p.error || e.error).message);
      setCarregando(false);
      return;
    }
    const ts = (t.data ?? []) as Tamanho[];
    setTamanhos(ts);
    setProdutos((p.data ?? []) as Sabor[]);
    setComplementos((e.data ?? []) as Complemento[]);
    setGradeSabor(
      Object.fromEntries(
        (p.data ?? []).map((x: any) => [x.id, precosParaGrade(x.pizza_size_prices_cents, ts)]),
      ),
    );
    setIngredientesTexto(
      Object.fromEntries(
        (p.data ?? []).map((x: any) => [
          x.id,
          Array.isArray(x.ingredients) ? x.ingredients.join(", ") : "",
        ]),
      ),
    );
    setGradeComplemento(
      Object.fromEntries(
        (e.data ?? []).map((x: any) => [x.id, precosParaGrade(x.pizza_size_prices_cents, ts)]),
      ),
    );
    setMaxQtd(
      Object.fromEntries((e.data ?? []).map((x: any) => [x.id, String(x.max_quantity ?? 1)])),
    );
    setCarregando(false);
  }

  const sabores = useMemo(
    () => produtos.filter((p) => p.category_id && categoriasPizza.includes(p.category_id)),
    [produtos, categoriasPizza],
  );

  // O que está SALVO + a configuração em edição: é o que o simulador e a
  // conferência usam. Preço digitado e não salvo não entra.
  const catalogo = useMemo(
    () =>
      montarCatalogoDoPainel({
        tamanhos,
        sabores,
        complementos,
        siteSettings: pizzeria?.site_settings,
        configEmEdicao: config,
      }),
    [tamanhos, sabores, complementos, pizzeria?.site_settings, config],
  );
  const problemas = useMemo(() => validarConfigPizzaria(catalogo), [catalogo]);

  // ── Sincronização ─────────────────────────────────────────────────────
  async function publicar(
    params: Parameters<typeof syncToExternal>[0]["type"],
    dados: any,
  ): Promise<boolean> {
    if (!conectada) return true; // loja sem site conectado: só o painel
    if (params !== "restaurant" && !dados.external_id) {
      toast.error(
        `“${dados.name}” ainda não existe no site de pedidos. Abra e salve uma vez na aba do cardápio para criá-lo lá.`,
      );
      return false;
    }
    const r = await syncToExternal({
      type: params,
      action: "update",
      id: dados.id,
      externalId: dados.external_id,
      data: dados,
      pizzeriaSlug: pizzeria.slug,
      pizzeriaApiKey: pizzeria.api_key,
      syncEndpoint: pizzeria.sync_endpoint,
    });
    if (!r.success) {
      toast.error(
        `Não foi possível atualizar o site de pedidos${r.error ? ` (${r.error})` : ""}. Nada foi alterado. ` +
          "Se o erro falar de coluna inexistente, falta aplicar a atualização do banco do site.",
      );
      return false;
    }
    return true;
  }

  // ── 1. Regras ─────────────────────────────────────────────────────────
  async function salvarRegras() {
    if (problemas.length > 0) {
      toast.error("Corrija os pontos listados em “Conferência” antes de publicar.");
      return;
    }
    setSalvandoRegras(true);
    const siteSettings = { ...(pizzeria?.site_settings ?? {}), [CHAVE_DA_CONFIG]: config };
    const ok = await publicar("restaurant", { site_settings: { [CHAVE_DA_CONFIG]: config } });
    if (ok) {
      const { error } = await supabase
        .from("pizzerias")
        .update({ site_settings: siteSettings } as any)
        .eq("id", pizzeriaId);
      if (error) toast.error("Erro ao salvar: " + error.message);
      else {
        toast.success("Regras de preço publicadas");
        if (pizzeria) pizzeria.site_settings = siteSettings;
        onRefresh?.();
      }
    }
    setSalvandoRegras(false);
  }

  // ── 2. Categorias de pizza (só organização do painel) ─────────────────
  async function alternarCategoria(id: string, marcada: boolean) {
    const { error } = await (supabase as any)
      .from("menu_categories")
      .update({ is_pizza: marcada })
      .eq("id", id);
    if (error) {
      toast.error("Erro ao salvar categoria: " + error.message);
      return;
    }
    setCategoriasPizza((cur) => (marcada ? [...cur, id] : cur.filter((x) => x !== id)));
  }

  // ── 3. Sabores ────────────────────────────────────────────────────────
  async function salvarSabor(s: Sabor) {
    const { precos, invalidos } = gradeParaPrecos(gradeSabor[s.id] ?? {});
    if (invalidos.length > 0) {
      toast.error(`Preço inválido em: ${invalidos.join(", ")}`);
      return;
    }
    const ingredients = textoParaIngredientes(ingredientesTexto[s.id] ?? "");
    setSalvandoLinha(s.id);
    const cat = categories.find((c) => c.id === s.category_id);
    const ok = await publicar((s.product_type as any) || "standard", {
      ...s,
      external_category_id: normalizarIdExterno(cat?.external_id),
      pizza_size_prices_cents: precos,
      ingredients,
    });
    if (ok) {
      const { error } = await (supabase as any)
        .from("menu_products")
        .update({ pizza_size_prices_cents: precos, ingredients })
        .eq("id", s.id);
      if (error) toast.error("Erro ao salvar: " + error.message);
      else {
        toast.success(`“${s.name}” salvo`);
        setProdutos((cur) =>
          cur.map((p) =>
            p.id === s.id ? { ...p, pizza_size_prices_cents: precos, ingredients } : p,
          ),
        );
      }
    }
    setSalvandoLinha(null);
  }

  // ── 4. Bordas e adicionais ────────────────────────────────────────────
  async function salvarComplemento(c: Complemento) {
    const { precos, invalidos } = gradeParaPrecos(gradeComplemento[c.id] ?? {});
    if (invalidos.length > 0) {
      toast.error(`Preço inválido em: ${invalidos.join(", ")}`);
      return;
    }
    const max = parseInt(maxQtd[c.id] ?? "1", 10);
    if (!Number.isInteger(max) || max < 1 || max > 20) {
      toast.error("A quantidade máxima precisa ser de 1 a 20.");
      return;
    }
    setSalvandoLinha(c.id);
    // Vai o registro inteiro (nome, preço, ativo): mandar só os campos novos
    // faria o site entender "ativo" como verdadeiro e reativar um item pausado.
    const ok = await publicar("extra", {
      ...c,
      pizza_size_prices_cents: precos,
      max_quantity: max,
    });
    if (ok) {
      const { error } = await (supabase as any)
        .from("menu_extras")
        .update({ pizza_size_prices_cents: precos, max_quantity: max })
        .eq("id", c.id);
      if (error) toast.error("Erro ao salvar: " + error.message);
      else {
        toast.success(`“${c.name}” salvo`);
        setComplementos((cur) =>
          cur.map((x) =>
            x.id === c.id ? { ...x, pizza_size_prices_cents: precos, max_quantity: max } : x,
          ),
        );
      }
    }
    setSalvandoLinha(null);
  }

  // ── 5. Combinações ────────────────────────────────────────────────────
  const [novaCombo, setNovaCombo] = useState<{ tamanho: string; sabores: string[]; preco: string }>(
    {
      tamanho: "",
      sabores: [],
      preco: "",
    },
  );
  function adicionarCombinacao() {
    const preco = reaisParaCentavos(novaCombo.preco);
    if (!novaCombo.tamanho || novaCombo.sabores.length < 2 || preco <= 0) {
      toast.error("Escolha o tamanho, pelo menos 2 sabores e o preço.");
      return;
    }
    setConfig((c) => ({
      ...c,
      combinacoes: [
        ...c.combinacoes,
        {
          tamanho: chaveDeNome(novaCombo.tamanho),
          sabores: novaCombo.sabores.map(chaveDeNome),
          precoCentavos: preco,
        },
      ],
    }));
    setNovaCombo({ tamanho: novaCombo.tamanho, sabores: [], preco: "" });
  }

  // ── 6. Simulador ──────────────────────────────────────────────────────
  const [sim, setSim] = useState<{
    tamanho: string;
    sabores: string[];
    borda: string;
    adicionais: Record<string, number>;
  }>({
    tamanho: "",
    sabores: [],
    borda: "",
    adicionais: {},
  });
  const simulacao = sim.tamanho
    ? calcularPizza(catalogo, {
        tamanho: sim.tamanho,
        sabores: sim.sabores.map((id) => ({ id })),
        bordaId: sim.borda || null,
        adicionais: Object.entries(sim.adicionais)
          .filter(([, q]) => q > 0)
          .map(([id, quantidade]) => ({ id, quantidade })),
      })
    : null;

  if (carregando) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const nomeDoSabor = (chave: string) =>
    sabores.find((s) => chaveDeNome(s.name) === chave)?.name ?? chave;
  const nomeDoTamanho = (chave: string) =>
    tamanhos.find((t) => chaveDeNome(t.name) === chave)?.name ?? chave;
  const tamanhosAtivos = tamanhos.filter((t) => t.active !== false);

  return (
    <div className="space-y-6">
      {!conectada && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          Esta loja ainda não está conectada ao site de pedidos. O que for salvo aqui fica no painel
          e só chega ao site depois da conexão.
        </div>
      )}

      {/* 1. Regras */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Pizza className="h-4 w-4 text-primary" /> Regras de preço
          </CardTitle>
          <CardDescription>
            Como o site calcula o preço de uma pizza com mais de um sabor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Regra dos sabores</Label>
              <Select
                value={config.regra}
                onValueChange={(v) => setConfig((c) => ({ ...c, regra: v as RegraDeSabores }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGRAS_DE_SABORES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {NOMES_DAS_REGRAS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {config.regra === "tamanho_e_especiais" &&
                  "Preço do tamanho + extra dos sabores especiais. É a regra de antes: nenhum preço muda."}
                {config.regra === "maior_preco" &&
                  "Meia calabresa (R$ 50) + meia camarão (R$ 80) = R$ 80."}
                {config.regra === "media_ponderada" &&
                  "Meia calabresa (R$ 50) + meia camarão (R$ 80) = R$ 65. Com 3 sabores, cada um vale 1/3."}
                {config.regra === "combinacao" &&
                  "Cada combinação tem um preço fechado, cadastrado abaixo."}
              </p>
            </div>
            {config.regra === "combinacao" && (
              <div className="space-y-2">
                <Label>Combinação não cadastrada</Label>
                <Select
                  value={config.regraSemCombinacao}
                  onValueChange={(v) =>
                    setConfig((c) => ({ ...c, regraSemCombinacao: v as RegraSemCombinacao }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recusar">Não deixar o cliente pedir</SelectItem>
                    <SelectItem value="maior_preco">Cobrar pelo sabor mais caro</SelectItem>
                    <SelectItem value="media_ponderada">Cobrar pela média dos sabores</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              Borda obrigatória
              <Switch
                checked={config.bordaObrigatoria}
                onCheckedChange={(v) => setConfig((c) => ({ ...c, bordaObrigatoria: v }))}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              Cliente pode retirar ingredientes
              <Switch
                checked={config.permitirRemoverIngredientes}
                onCheckedChange={(v) =>
                  setConfig((c) => ({ ...c, permitirRemoverIngredientes: v }))
                }
              />
            </label>
            <div className="space-y-1 rounded-lg border p-3 text-sm">
              <Label htmlFor="max-adicionais">Máximo de adicionais por pizza</Label>
              <Input
                id="max-adicionais"
                inputMode="numeric"
                placeholder="Sem limite"
                value={config.maxAdicionaisPorPizza ?? ""}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setConfig((c) => ({
                    ...c,
                    maxAdicionaisPorPizza: v === "" ? null : Math.min(99, parseInt(v, 10)),
                  }));
                }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Retirar ingrediente nunca dá desconto. Os ingredientes de cada sabor são cadastrados na
            tabela de sabores abaixo.
          </p>
        </CardContent>
      </Card>

      {/* 5. Combinações */}
      {config.regra === "combinacao" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Combinações com preço fechado</CardTitle>
            <CardDescription>
              Ex.: Grande, Calabresa + Mussarela = R$ 59,90. A ordem dos sabores não importa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {config.combinacoes.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma combinação cadastrada.</p>
            )}
            <ul className="space-y-2">
              {config.combinacoes.map((c, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 rounded border p-2 text-sm"
                >
                  <span>
                    <strong>{nomeDoTamanho(c.tamanho)}</strong>:{" "}
                    {c.sabores.map(nomeDoSabor).join(" + ")} — {formatarCentavos(c.precoCentavos)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover combinação"
                    onClick={() =>
                      setConfig((x) => ({
                        ...x,
                        combinacoes: x.combinacoes.filter((_, j) => j !== i),
                      }))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="grid gap-3 md:grid-cols-[160px_1fr_120px_auto] items-end">
              <div className="space-y-1">
                <Label>Tamanho</Label>
                <Select
                  value={novaCombo.tamanho}
                  onValueChange={(v) => setNovaCombo((n) => ({ ...n, tamanho: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tamanho" />
                  </SelectTrigger>
                  <SelectContent>
                    {tamanhosAtivos.map((t) => (
                      <SelectItem key={t.id} value={t.name}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Sabores</Label>
                <div className="flex flex-wrap gap-2 rounded border p-2 max-h-32 overflow-auto">
                  {sabores.map((s) => (
                    <label key={s.id} className="flex items-center gap-1 text-xs">
                      <Checkbox
                        checked={novaCombo.sabores.includes(s.name)}
                        onCheckedChange={(v) =>
                          setNovaCombo((n) => ({
                            ...n,
                            sabores: v
                              ? [...n.sabores, s.name]
                              : n.sabores.filter((x) => x !== s.name),
                          }))
                        }
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Preço (R$)</Label>
                <Input
                  inputMode="decimal"
                  value={novaCombo.preco}
                  onChange={(e) => setNovaCombo((n) => ({ ...n, preco: e.target.value }))}
                />
              </div>
              <Button onClick={adicionarCombinacao} variant="outline">
                <Plus className="h-4 w-4 mr-1" /> Incluir
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              As combinações só valem depois de “Publicar regras”.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 6. Conferência + publicar */}
      <Card className={problemas.length > 0 ? "border-destructive/50" : "border-emerald-500/40"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {problemas.length > 0 ? (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
            Conferência antes de publicar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {problemas.length === 0 ? (
            <p className="text-sm">Tudo certo para publicar estas regras.</p>
          ) : (
            <ul className="list-disc pl-5 text-sm space-y-1 text-destructive">
              {problemas.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          <Button onClick={salvarRegras} disabled={salvandoRegras || problemas.length > 0}>
            {salvandoRegras ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Publicar regras
          </Button>
        </CardContent>
      </Card>

      {/* 2. Categorias */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Categorias de pizza</CardTitle>
          <CardDescription>
            Os produtos destas categorias aparecem como sabores na tabela abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={categoriasPizza.includes(c.id)}
                onCheckedChange={(v) => alternarCategoria(c.id, !!v)}
              />
              {c.name}
            </label>
          ))}
        </CardContent>
      </Card>

      {/* 3. Sabores */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preço dos sabores por tamanho</CardTitle>
          <CardDescription>
            Campo vazio = usa o preço do tamanho. Os preços são ligados ao NOME do tamanho: se
            renomear um tamanho, confira esta tabela de novo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tamanhos.length === 0 && (
            <p className="text-sm text-muted-foreground">Cadastre os tamanhos primeiro.</p>
          )}
          {sabores.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Marque acima as categorias de pizza para listar os sabores.
            </p>
          )}
          {sabores.map((s) => (
            <div key={s.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm">
                  {s.name}
                  {s.active === false && (
                    <span className="ml-2 text-xs text-muted-foreground">(pausado)</span>
                  )}
                </p>
                <Button size="sm" onClick={() => salvarSabor(s)} disabled={salvandoLinha === s.id}>
                  {salvandoLinha === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {tamanhos.map((t) => (
                  <div key={t.id} className="space-y-1">
                    <Label className="text-xs">{t.name}</Label>
                    <Input
                      inputMode="decimal"
                      placeholder={centavosParaTexto(reaisParaCentavos(t.price))}
                      value={gradeSabor[s.id]?.[t.name] ?? ""}
                      onChange={(e) =>
                        setGradeSabor((g) => ({
                          ...g,
                          [s.id]: { ...(g[s.id] ?? {}), [t.name]: e.target.value },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Ingredientes que o cliente pode retirar (separados por vírgula)
                </Label>
                <Input
                  placeholder="cebola, azeitona, orégano"
                  value={ingredientesTexto[s.id] ?? ""}
                  onChange={(e) => setIngredientesTexto((m) => ({ ...m, [s.id]: e.target.value }))}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 4. Bordas e adicionais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bordas e adicionais por tamanho</CardTitle>
          <CardDescription>
            Campo vazio = usa o preço único cadastrado na aba de complementos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {complementos.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma borda ou adicional cadastrado.</p>
          )}
          {complementos.map((c) => (
            <div key={c.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm">
                  {c.name}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({c.extra_type === "borda" ? "borda" : "adicional"}, preço único{" "}
                    {formatarCentavos(reaisParaCentavos(c.price))})
                  </span>
                </p>
                <Button
                  size="sm"
                  onClick={() => salvarComplemento(c)}
                  disabled={salvandoLinha === c.id}
                >
                  {salvandoLinha === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {tamanhos.map((t) => (
                  <div key={t.id} className="space-y-1">
                    <Label className="text-xs">{t.name}</Label>
                    <Input
                      inputMode="decimal"
                      value={gradeComplemento[c.id]?.[t.name] ?? ""}
                      onChange={(e) =>
                        setGradeComplemento((g) => ({
                          ...g,
                          [c.id]: { ...(g[c.id] ?? {}), [t.name]: e.target.value },
                        }))
                      }
                    />
                  </div>
                ))}
                {c.extra_type !== "borda" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Máx. por pizza</Label>
                    <Input
                      inputMode="numeric"
                      value={maxQtd[c.id] ?? "1"}
                      onChange={(e) =>
                        setMaxQtd((m) => ({ ...m, [c.id]: e.target.value.replace(/\D/g, "") }))
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Simulador */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4 text-primary" /> Simulador
          </CardTitle>
          <CardDescription>
            Monte uma pizza e veja o preço que o cliente vai pagar, com as regras desta tela e os
            preços já salvos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Tamanho</Label>
              <Select
                value={sim.tamanho}
                onValueChange={(v) => setSim((s) => ({ ...s, tamanho: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {tamanhosAtivos.map((t) => (
                    <SelectItem key={t.id} value={t.name}>
                      {t.name} (até {t.max_flavors})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Borda</Label>
              <Select
                value={sim.borda || "nenhuma"}
                onValueChange={(v) => setSim((s) => ({ ...s, borda: v === "nenhuma" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Sem borda</SelectItem>
                  {catalogo.bordas.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {sabores.map((s) => (
              <label key={s.id} className="flex items-center gap-1 text-sm">
                <Checkbox
                  checked={sim.sabores.includes(s.id)}
                  onCheckedChange={(v) =>
                    setSim((x) => ({
                      ...x,
                      sabores: v ? [...x.sabores, s.id] : x.sabores.filter((y) => y !== s.id),
                    }))
                  }
                />
                {s.name}
              </label>
            ))}
          </div>
          {catalogo.adicionais.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {catalogo.adicionais.map((a) => (
                <label key={a.id} className="flex items-center gap-1 text-sm">
                  {a.nome}
                  <Input
                    className="h-8 w-14"
                    inputMode="numeric"
                    value={String(sim.adicionais[a.id] ?? 0)}
                    onChange={(e) =>
                      setSim((x) => ({
                        ...x,
                        adicionais: {
                          ...x.adicionais,
                          [a.id]: parseInt(e.target.value.replace(/\D/g, "") || "0", 10),
                        },
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          )}
          {simulacao &&
            (simulacao.ok ? (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <pre className="whitespace-pre-wrap font-sans">
                  {descreverPizza(simulacao.pizza)}
                </pre>
                <p className="mt-2 font-bold">
                  {NOMES_DAS_REGRAS[simulacao.pizza.regraAplicada]}:{" "}
                  {formatarCentavos(simulacao.pizza.precoUnitarioCentavos)}
                </p>
              </div>
            ) : (
              <ul className="list-disc pl-5 text-sm text-destructive">
                {simulacao.erros.map((e, i) => (
                  <li key={i}>{e.mensagem}</li>
                ))}
              </ul>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
