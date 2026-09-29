import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, FileJson, Loader2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { syncToExternal } from "@/utils/menuSync";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MENU_IMPORT_EXAMPLE,
  parseMenuImport,
  type ImportedItem,
  type ParsedMenu,
} from "@/lib/menu/importSchema";
import {
  buildImportPlan,
  planTotals,
  type ExistingMenu,
  type ImportPlan,
} from "@/lib/menu/importPlan";
import {
  runImport as executeImport,
  type CategoryResult,
  type ImportDeps,
  type ImportReport,
  type WriteResult,
  mensagemFinal,
} from "@/lib/menu/importRunner";

interface MenuImportDialogProps {
  pizzeriaId: string;
  pizzeriaSlug?: string;
  pizzeriaApiKey?: string;
  syncEndpoint?: string;
  /** Chamado depois de gravar, para a tela do cardápio recarregar as listas. */
  onImported: () => void;
}

const SF_CAT_PREFIX = "sf_cat_";

/** Erros de sincronização traduzidos, no mesmo padrão do resto do cardápio. */
function syncErrorMessage(error?: string): string {
  if (error === "404") return "Endereço de sincronização não encontrado.";
  if (error === "auth_error") return "Chave de autorização inválida ou sem permissão.";
  if (error === "cors_error") return "Erro de conexão com o site público.";
  if (error === "html_response") return "O site público respondeu em formato inesperado.";
  if (error === "missing_external_id") return "O site público não devolveu o código do item.";
  if (error?.startsWith("api_error:")) return error.replace("api_error:", "").trim();
  return error
    ? `Não foi possível atualizar o site público (${error}).`
    : "Não foi possível atualizar o site público.";
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const PAGE = 1000;

/**
 * Lê TODAS as linhas de uma consulta. O Supabase devolve no máximo 1000 por
 * vez; sem isto, uma loja grande pareceria ter menos itens do que tem — e a
 * conferência de "já existe" deixaria passar duplicados.
 */
async function fetchAll<T>(
  label: string,
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`Não consegui ler ${label}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function loadExistingMenu(pizzeriaId: string): Promise<ExistingMenu> {
  const [categories, products, extras] = await Promise.all([
    fetchAll<ExistingMenu["categories"][number]>("as categorias", (from, to) =>
      supabase
        .from("menu_categories")
        .select("id, name, external_id, order_index, active")
        .eq("pizzeria_id", pizzeriaId)
        .order("id")
        .range(from, to),
    ),
    fetchAll<ExistingMenu["products"][number]>("os produtos", (from, to) =>
      supabase
        .from("menu_products")
        .select("name, category_id, product_type")
        .eq("pizzeria_id", pizzeriaId)
        .order("id")
        .range(from, to),
    ),
    fetchAll<ExistingMenu["extras"][number]>("os adicionais", (from, to) =>
      supabase
        .from("menu_extras")
        .select("name, extra_type")
        .eq("pizzeria_id", pizzeriaId)
        .order("id")
        .range(from, to),
    ),
  ]);
  return { categories, products, extras };
}

type Stage = "input" | "preview" | "running" | "done";

export function MenuImportDialog({
  pizzeriaId,
  pizzeriaSlug,
  pizzeriaApiKey,
  syncEndpoint,
  onImported,
}: MenuImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("input");
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [menu, setMenu] = useState<ParsedMenu | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [checking, setChecking] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const syncs = !!(pizzeriaSlug && pizzeriaApiKey);
  const totals = plan ? planTotals(plan) : null;
  const toCreate = totals ? totals.productsToCreate + totals.extrasToCreate : 0;
  const nothingNew = !!totals && toCreate === 0 && totals.categoriesToCreate === 0;

  function reset() {
    setStage("input");
    setText("");
    setErrors([]);
    setMenu(null);
    setPlan(null);
    setProgress({ done: 0, total: 0 });
    setReport(null);
  }

  function handleOpenChange(next: boolean) {
    // Fechar no meio da importação deixaria metade do cardápio criado sem o
    // dono saber o que entrou. O diálogo só tranca enquanto está gravando.
    if (!next && stage === "running") return;
    setOpen(next);
    if (!next) reset();
  }

  async function handleFile(file: File) {
    const content = await file.text();
    setText(content);
    setErrors([]);
    toast.success(`Arquivo "${file.name}" carregado. Confira e clique em Validar.`);
  }

  async function handleValidate() {
    const result = parseMenuImport(text);
    if (!result.ok) {
      setErrors(result.errors);
      setMenu(null);
      return;
    }
    setErrors([]);
    setChecking(true);
    try {
      // A prévia já compara com o cardápio atual: o que aparece como "novo" é
      // o que de fato será criado, e o que já existe aparece como existente.
      const existing = await loadExistingMenu(pizzeriaId);
      setMenu(result.data);
      setPlan(buildImportPlan(result.data, existing));
      setStage("preview");
    } catch (err) {
      console.error("[Importação] Falha ao conferir o cardápio atual:", err);
      setErrors([errorText(err)]);
    } finally {
      setChecking(false);
    }
  }

  /**
   * Cada gravação confere `error` E o registro devolvido. Um insert que não
   * devolve a linha criada não pode ser tratado como sucesso.
   */
  function buildDeps(onProgress: ImportDeps["onProgress"]): ImportDeps {
    return {
      onProgress,

      async createCategory({ nome, descricao, orderIndex }): Promise<CategoryResult> {
        let externalId: string | null = null;
        try {
          if (syncs) {
            const sync = await syncToExternal({
              type: "category",
              action: "create",
              data: {
                name: nome,
                description: descricao ?? "",
                active: true,
                order_index: orderIndex,
              },
              pizzeriaSlug: pizzeriaSlug!,
              pizzeriaApiKey: pizzeriaApiKey!,
              syncEndpoint,
            });
            if (!sync.success) return { ok: false, why: syncErrorMessage(sync.error) };
            externalId = sync.externalId ?? null;
          }

          const { data, error } = await supabase
            .from("menu_categories")
            .insert({
              name: nome,
              description: descricao ?? null,
              pizzeria_id: pizzeriaId,
              order_index: orderIndex,
              active: true,
              external_id: externalId,
              external_source: externalId ? "sitecreatorfly" : null,
            })
            .select("id")
            .single();

          if (error || !data?.id) {
            await undoOnSite("category", externalId);
            return { ok: false, why: error?.message ?? "o banco não devolveu a categoria criada" };
          }
          return { ok: true, id: data.id, externalId };
        } catch (err) {
          await undoOnSite("category", externalId);
          return { ok: false, why: errorText(err) };
        }
      },

      async createProduct({
        item,
        categoryId,
        externalCategoryId,
        productType,
      }): Promise<WriteResult> {
        const externalCategory = externalCategoryId?.startsWith(SF_CAT_PREFIX)
          ? externalCategoryId.slice(SF_CAT_PREFIX.length)
          : externalCategoryId;

        // O item é SEMPRE gravado no painel. Se o site público recusar, o item
        // fica salvo aqui e o motivo aparece como aviso — antes, a recusa do
        // site descartava o item e sobrava a categoria vazia.
        let externalId: string | undefined;
        let warning: string | undefined;

        if (syncs) {
          if (productType === "standard" && !externalCategory) {
            warning = "a categoria não está ligada ao site público.";
          } else {
            const sync = await syncToExternal({
              type: productType,
              action: "create",
              data: {
                name: item.nome,
                description: item.descricao ?? "",
                price: item.preco,
                product_type: productType,
                active: true,
                external_category_id: externalCategory,
              },
              pizzeriaSlug: pizzeriaSlug!,
              pizzeriaApiKey: pizzeriaApiKey!,
              syncEndpoint,
            });
            if (sync.success) externalId = sync.externalId;
            else warning = syncErrorMessage(sync.error);
          }
        }

        const { data, error } = await supabase
          .from("menu_products")
          .insert({
            name: item.nome,
            description: item.descricao ?? null,
            price: item.preco,
            category_id: categoryId,
            product_type: productType,
            pizzeria_id: pizzeriaId,
            active: true,
            available: true,
            external_id: externalId ?? null,
            external_source: externalId ? "sitecreatorfly" : null,
          })
          .select("id")
          .single();

        if (error || !data?.id) {
          // Não deixa o item pendurado no site sem existir no painel.
          await undoOnSite(productType, externalId);
          return { ok: false, why: error?.message ?? "o banco não devolveu o produto criado" };
        }
        return { ok: true, warning };
      },

      async createExtra({ item, extraType }): Promise<WriteResult> {
        const payload = {
          name: item.nome,
          price: item.preco,
          extra_type: extraType,
          pizzeria_id: pizzeriaId,
          active: true,
        };
        let externalId: string | undefined;
        let warning: string | undefined;

        if (syncs) {
          const sync = await syncToExternal({
            type: "extra",
            action: "create",
            data: payload,
            pizzeriaSlug: pizzeriaSlug!,
            pizzeriaApiKey: pizzeriaApiKey!,
            syncEndpoint,
          });
          if (sync.success) externalId = sync.externalId;
          else warning = syncErrorMessage(sync.error);
        }

        const { data, error } = await supabase
          .from("menu_extras")
          .insert({
            ...payload,
            external_id: externalId ?? null,
            external_source: externalId ? "sitecreatorfly" : null,
          })
          .select("id")
          .single();

        if (error || !data?.id) {
          await undoOnSite(extraType === "borda" ? "border" : "additional", externalId);
          return { ok: false, why: error?.message ?? "o banco não devolveu o item criado" };
        }
        return { ok: true, warning };
      },
    };
  }

  /** Desfaz no site o que foi criado lá quando a gravação no painel falhou. */
  async function undoOnSite(type: string, externalId?: string | null) {
    if (!syncs || !externalId) return;
    const undo = await syncToExternal({
      type,
      action: "delete",
      externalId,
      pizzeriaSlug: pizzeriaSlug!,
      pizzeriaApiKey: pizzeriaApiKey!,
      syncEndpoint,
    });
    if (!undo.success) {
      console.error("[Importação] Não consegui desfazer no site o item", externalId, undo.error);
    }
  }

  async function runImport() {
    if (!menu) return;
    setStage("running");
    setProgress({ done: 0, total: 0 });

    let result: ImportReport;
    try {
      // Confere de novo agora: o cardápio pode ter mudado desde a prévia.
      const existing = await loadExistingMenu(pizzeriaId);
      const freshPlan = buildImportPlan(menu, existing);
      result = await executeImport(
        freshPlan,
        buildDeps((done, total) => setProgress({ done, total })),
      );
    } catch (err) {
      console.error("[Importação] Falha inesperada:", err);
      toast.error(`Erro ao importar: ${errorText(err)}`);
      setStage("preview");
      return;
    }

    setReport(result);
    setStage("done");

    if (result.failures.length > 0) {
      toast.error(
        `${result.failures.length} ${result.failures.length === 1 ? "item não foi importado" : "itens não foram importados"}. Veja a lista.`,
      );
    } else if (result.warnings.length > 0) {
      toast.warning("Importação concluída, mas o site público não recebeu alguns itens.");
    } else {
      toast.success(mensagemFinal(result));
    }

    // Recarrega as listas do cardápio — sem F5.
    onImported();
  }

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <FileJson className="h-4 w-4" aria-hidden="true" />
        Importar JSON
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar cardápio por arquivo JSON</DialogTitle>
          </DialogHeader>

          {stage === "input" && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Cole o conteúdo do arquivo abaixo ou anexe o arquivo. Nada é gravado antes de você
                conferir a prévia.
              </p>

              <div className="rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setShowExample((v) => !v)}
                  className="flex w-full items-center justify-between p-3 text-left text-sm font-medium"
                >
                  <span>Ver o modelo do arquivo</span>
                  <span className="text-xs text-muted-foreground">
                    {showExample ? "ocultar" : "mostrar"}
                  </span>
                </button>

                {showExample && (
                  <div className="space-y-2 border-t border-border p-3">
                    <p className="text-xs text-muted-foreground">
                      Use este modelo como base. Os quatro campos são opcionais — mande só o que
                      tiver. Preço aceita <code>45.90</code> ou <code>&quot;45,90&quot;</code>.
                    </p>
                    <pre className="max-h-64 overflow-auto rounded-md bg-muted/50 p-3 text-xs leading-relaxed">
                      {MENU_IMPORT_EXAMPLE}
                    </pre>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(MENU_IMPORT_EXAMPLE)
                            .then(() => toast.success("Modelo copiado."))
                            .catch(() => toast.error("Não foi possível copiar."));
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copiar modelo
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setText(MENU_IMPORT_EXAMPLE)}
                      >
                        Preencher com o modelo
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setErrors([]);
                }}
                spellCheck={false}
                placeholder='{ "categorias": [ ... ] }'
                className="h-56 w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
              />

              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-4 w-4" aria-hidden="true" /> Anexar arquivo
                </Button>
              </div>

              {errors.length > 0 && (
                <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    {errors.length === 1
                      ? "Encontrei 1 problema:"
                      : `Encontrei ${errors.length} problemas:`}
                  </p>
                  <ul className="space-y-1 text-xs text-destructive">
                    {errors.map((e, i) => (
                      <li key={i} className="break-words">
                        • {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {stage === "preview" && menu && plan && totals && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <Check className="h-4 w-4" aria-hidden="true" /> Arquivo válido.
                </p>
              </div>

              <div className="space-y-1 rounded-lg border border-border p-3 text-sm">
                <Summary label="Categorias novas" value={totals.categoriesToCreate} />
                <Summary
                  label="Categorias que já existem (serão reaproveitadas)"
                  value={totals.categoriesReused}
                />
                <Summary label="Produtos novos" value={totals.productsToCreate} />
                <Summary
                  label="Produtos que já existem (não serão repetidos)"
                  value={totals.productsSkipped}
                />
                {(totals.extrasToCreate > 0 || totals.extrasSkipped > 0) && (
                  <>
                    <Summary label="Bordas e adicionais novos" value={totals.extrasToCreate} />
                    <Summary
                      label="Bordas e adicionais que já existem"
                      value={totals.extrasSkipped}
                    />
                  </>
                )}
                <div className="mt-2 flex justify-between border-t border-border pt-2 font-bold">
                  <span>Total a criar</span>
                  <span>{toCreate}</span>
                </div>
              </div>

              {plan.groups.length > 0 && (
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border p-3 text-xs">
                  {plan.groups.map((g, i) => (
                    <div key={i}>
                      <p className="font-semibold">
                        {g.nome}{" "}
                        <span className="font-normal text-muted-foreground">
                          {g.existing ? "(categoria já existe)" : "(categoria nova)"}
                        </span>
                      </p>
                      {g.itens.length === 0 ? (
                        <p className="text-muted-foreground">(sem itens)</p>
                      ) : (
                        <ul className="text-muted-foreground">
                          {g.itens.map((it, j) => (
                            <li key={j}>
                              {it.item.nome} — R$ {it.item.preco.toFixed(2).replace(".", ",")}
                              {it.skip === "banco" && (
                                <strong className="text-amber-700 dark:text-amber-400">
                                  {" "}
                                  · já existe, não será repetido
                                </strong>
                              )}
                              {it.skip === "arquivo" && (
                                <strong className="text-amber-700 dark:text-amber-400">
                                  {" "}
                                  · repetido no arquivo, entra uma vez só
                                </strong>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <p className="font-semibold text-amber-700 dark:text-amber-400">
                  Antes de confirmar
                </p>
                <p className="mt-1 text-muted-foreground">
                  A importação <strong>adiciona</strong> ao cardápio: nada do que já existe é
                  apagado ou substituído. Categoria com o mesmo nome (sem diferenciar maiúsculas) é
                  reaproveitada, e item que já está na categoria não é repetido.
                </p>
                {totals.inactiveCategories.length > 0 && (
                  <p className="mt-2 text-muted-foreground">
                    <strong>Atenção:</strong> {totals.inactiveCategories.join(", ")}{" "}
                    {totals.inactiveCategories.length === 1
                      ? "está desativada"
                      : "estão desativadas"}
                    . Os itens entram, mas só aparecem depois que você ativar a categoria.
                  </p>
                )}
                {!syncs && (
                  <p className="mt-2 text-muted-foreground">
                    Este estabelecimento ainda não está ligado ao site público, então a importação
                    entra só no painel.
                  </p>
                )}
              </div>
            </div>
          )}

          {stage === "running" && (
            <div className="space-y-3 py-8 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm font-medium">
                Importando {progress.done} de {progress.total}…
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Não feche esta janela até terminar.</p>
            </div>
          )}

          {stage === "done" && report && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {mensagemFinal(report)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {report.categoriesCreated}{" "}
                  {report.categoriesCreated === 1 ? "categoria criada" : "categorias criadas"}
                  {report.categoriesReused > 0 && `, ${report.categoriesReused} reaproveitada(s)`}
                  {report.productsSkipped > 0 &&
                    `, ${report.productsSkipped} item(ns) já existia(m) e não foi(ram) repetido(s)`}
                  .
                </p>
              </div>

              {report.failures.length > 0 && (
                <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <X className="h-4 w-4" aria-hidden="true" />
                    {report.failures.length} não{" "}
                    {report.failures.length === 1 ? "entrou" : "entraram"}:
                  </p>
                  <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-destructive">
                    {report.failures.map((f, i) => (
                      <li key={i} className="break-words">
                        • {f.mensagem}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    O que entrou continua salvo. Corrija o arquivo só com estes itens e importe de
                    novo — o que já existe não é repetido.
                  </p>
                </div>
              )}

              {report.warnings.length > 0 && (
                <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    {report.warnings.length}{" "}
                    {report.warnings.length === 1
                      ? "item ficou só no painel (o site público não recebeu)"
                      : "itens ficaram só no painel (o site público não recebeu)"}
                    :
                  </p>
                  <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {report.warnings.map((w, i) => (
                      <li key={i} className="break-words">
                        • {w.mensagem}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {stage === "input" && (
              <>
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => void handleValidate()} disabled={checking}>
                  {checking ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />{" "}
                      Conferindo…
                    </>
                  ) : (
                    "Validar arquivo"
                  )}
                </Button>
              </>
            )}
            {stage === "preview" && (
              <>
                <Button variant="outline" onClick={() => setStage("input")}>
                  Voltar e editar
                </Button>
                <Button onClick={() => void runImport()} disabled={nothingNew}>
                  {nothingNew ? "Nada novo para importar" : `Confirmar e importar ${toCreate}`}
                </Button>
              </>
            )}
            {stage === "done" && <Button onClick={() => handleOpenChange(false)}>Fechar</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
