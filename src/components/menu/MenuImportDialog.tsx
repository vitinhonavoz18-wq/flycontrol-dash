import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, FileJson, Loader2, Sparkles, Upload, X } from "lucide-react";
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
  INSTRUCAO_PARA_IA,
  MENU_IMPORT_EXAMPLE,
  countEntries,
  parseMenuImport,
  type ImportedItem,
  type ParsedMenu,
} from "@/lib/menu/importSchema";

interface MenuImportDialogProps {
  pizzeriaId: string;
  pizzeriaSlug?: string;
  pizzeriaApiKey?: string;
  syncEndpoint?: string;
  /** Quantas categorias já existem — define onde as novas entram na ordem. */
  existingCategoryCount: number;
  onImported: () => void;
}

const SF_CAT_PREFIX = "sf_cat_";

/** Erros de sincronização traduzidos, no mesmo padrão do resto do cardápio. */
function syncErrorMessage(error?: string): string {
  if (error === "404") return "Endereço de sincronização não encontrado.";
  if (error === "auth_error") return "Chave de autorização inválida ou sem permissão.";
  if (error === "cors_error") return "Erro de conexão com o site público.";
  if (error === "html_response") return "O site público respondeu em formato inesperado.";
  if (error?.startsWith("api_error:")) return error.replace("api_error:", "").trim();
  return "Não foi possível atualizar o site público.";
}

type Stage = "input" | "preview" | "running" | "done";

type Failure = { what: string; why: string };

export function MenuImportDialog({
  pizzeriaId,
  pizzeriaSlug,
  pizzeriaApiKey,
  syncEndpoint,
  existingCategoryCount,
  onImported,
}: MenuImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("input");
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [menu, setMenu] = useState<ParsedMenu | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [modeloAberto, setModeloAberto] = useState<"nenhum" | "modelo" | "ia">("nenhum");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failures, setFailures] = useState<Failure[]>([]);
  const [created, setCreated] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const syncs = !!(pizzeriaSlug && pizzeriaApiKey);

  function reset() {
    setStage("input");
    setText("");
    setErrors([]);
    setMenu(null);
    setAvisos([]);
    setProgress({ done: 0, total: 0 });
    setFailures([]);
    setCreated(0);
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

  function handleValidate() {
    const result = parseMenuImport(text);
    if (!result.ok) {
      setErrors(result.errors);
      setMenu(null);
      return;
    }
    setErrors([]);
    setMenu(result.data);
    setAvisos(result.avisos);
    setStage("preview");
  }

  async function runImport() {
    if (!menu) return;
    setStage("running");
    const total = countEntries(menu);
    setProgress({ done: 0, total });
    const problems: Failure[] = [];
    let ok = 0;
    let step = 0;

    const advance = () => {
      step += 1;
      setProgress({ done: step, total });
    };

    // ---- Categorias, e os itens de cada uma -------------------------------
    // A ordem importa: o site público só aceita um produto depois que a
    // categoria dele já existe lá. É como só conseguir guardar a caixa
    // depois que a prateleira foi montada.
    let orderIndex = existingCategoryCount;

    for (const categoria of menu.categorias) {
      let externalCategoryId: string | null = null;
      let localCategoryId: string | null = null;

      try {
        if (syncs) {
          const sync = await syncToExternal({
            type: "category",
            action: "create",
            data: {
              name: categoria.nome,
              description: categoria.descricao ?? "",
              image_url: categoria.imagem ?? null,
              active: true,
              order_index: orderIndex,
            },
            pizzeriaSlug: pizzeriaSlug!,
            pizzeriaApiKey: pizzeriaApiKey!,
            syncEndpoint,
          });
          if (!sync.success) throw new Error(syncErrorMessage(sync.error));
          externalCategoryId = sync.externalId ?? null;
        }

        const { data: inserted, error } = await supabase
          .from("menu_categories")
          .insert({
            name: categoria.nome,
            description: categoria.descricao ?? null,
            image_url: categoria.imagem ?? null,
            pizzeria_id: pizzeriaId,
            order_index: orderIndex,
            active: true,
            external_id: externalCategoryId,
            external_source: externalCategoryId ? "sitecreatorfly" : null,
          })
          .select("id")
          .single();

        if (error) throw new Error(error.message);
        localCategoryId = inserted.id;
        orderIndex += 1;
        ok += 1;
      } catch (err) {
        problems.push({
          what: `Categoria "${categoria.nome}"`,
          why: err instanceof Error ? err.message : String(err),
        });
      }
      advance();

      if (!localCategoryId) {
        // Sem a categoria, os itens dela não têm onde entrar. Marca todos
        // como não importados para o dono saber exatamente o que refazer.
        for (const item of categoria.itens) {
          problems.push({
            what: `Item "${item.nome}"`,
            why: `A categoria "${categoria.nome}" não foi criada.`,
          });
          advance();
        }
        continue;
      }

      const normalizedCategoryId = externalCategoryId?.startsWith(SF_CAT_PREFIX)
        ? externalCategoryId.slice(SF_CAT_PREFIX.length)
        : externalCategoryId;

      for (const item of categoria.itens) {
        const result = await createProduct(item, {
          categoryId: localCategoryId,
          externalCategoryId: normalizedCategoryId,
          productType: "standard",
        });
        if (result.ok) ok += 1;
        else problems.push({ what: `Item "${item.nome}"`, why: result.why });
        advance();
      }
    }

    // ---- Bebidas: não pertencem a categoria, igual ao cadastro manual -----
    for (const bebida of menu.bebidas) {
      const result = await createProduct(bebida, {
        categoryId: null,
        externalCategoryId: null,
        productType: "beverage",
      });
      if (result.ok) ok += 1;
      else problems.push({ what: `Bebida "${bebida.nome}"`, why: result.why });
      advance();
    }

    // ---- Bordas e adicionais ---------------------------------------------
    for (const [lista, tipo, rotulo] of [
      [menu.bordas, "borda", "Borda"],
      [menu.adicionais, "adicional", "Adicional"],
    ] as const) {
      for (const extra of lista) {
        const result = await createExtra(extra, tipo);
        if (result.ok) ok += 1;
        else problems.push({ what: `${rotulo} "${extra.nome}"`, why: result.why });
        advance();
      }
    }

    setCreated(ok);
    setFailures(problems);
    setStage("done");
    onImported();
  }

  async function createProduct(
    item: ImportedItem,
    opts: {
      categoryId: string | null;
      externalCategoryId: string | null;
      productType: "standard" | "beverage";
    },
  ): Promise<{ ok: true } | { ok: false; why: string }> {
    try {
      let externalId: string | undefined;

      if (syncs) {
        const sync = await syncToExternal({
          type: opts.productType,
          action: "create",
          data: {
            name: item.nome,
            description: item.descricao ?? "",
            price: item.preco,
            image_url: item.imagem ?? null,
            category_id: opts.categoryId,
            product_type: opts.productType,
            active: true,
            external_category_id: opts.externalCategoryId,
          },
          pizzeriaSlug: pizzeriaSlug!,
          pizzeriaApiKey: pizzeriaApiKey!,
          syncEndpoint,
        });
        if (!sync.success) return { ok: false, why: syncErrorMessage(sync.error) };
        externalId = sync.externalId;
      }

      const { error } = await supabase.from("menu_products").insert({
        name: item.nome,
        description: item.descricao ?? null,
        price: item.preco,
        image_url: item.imagem ?? null,
        category_id: opts.categoryId,
        product_type: opts.productType,
        pizzeria_id: pizzeriaId,
        active: true,
        available: true,
        external_id: externalId ?? null,
        external_source: externalId ? "sitecreatorfly" : null,
      });

      if (error) return { ok: false, why: error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, why: err instanceof Error ? err.message : String(err) };
    }
  }

  async function createExtra(
    item: ImportedItem,
    extraType: "borda" | "adicional",
  ): Promise<{ ok: true } | { ok: false; why: string }> {
    try {
      let externalId: string | undefined;
      const payload = {
        name: item.nome,
        price: item.preco,
        extra_type: extraType,
        pizzeria_id: pizzeriaId,
        active: true,
      };

      if (syncs) {
        const sync = await syncToExternal({
          type: "extra",
          action: "create",
          data: payload,
          pizzeriaSlug: pizzeriaSlug!,
          pizzeriaApiKey: pizzeriaApiKey!,
          syncEndpoint,
        });
        if (!sync.success) return { ok: false, why: syncErrorMessage(sync.error) };
        externalId = sync.externalId;
      }

      const { error } = await supabase.from("menu_extras").insert({
        ...payload,
        external_id: externalId ?? null,
        external_source: externalId ? "sitecreatorfly" : null,
      });

      if (error) return { ok: false, why: error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, why: err instanceof Error ? err.message : String(err) };
    }
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

              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={modeloAberto === "modelo" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setModeloAberto(modeloAberto === "modelo" ? "nenhum" : "modelo")}
                  >
                    Ver o modelo do arquivo
                  </Button>
                  <Button
                    variant={modeloAberto === "ia" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setModeloAberto(modeloAberto === "ia" ? "nenhum" : "ia")}
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Montar com o ChatGPT
                  </Button>
                </div>

                {modeloAberto === "modelo" && (
                  <p className="text-xs text-muted-foreground">
                    Use este modelo como base. As quatro listas são opcionais — mande só o que
                    tiver. Preço aceita <code>45.90</code> ou <code>&quot;45,90&quot;</code>. A foto
                    (<code>imagem</code>) é opcional e precisa ser um endereço começando com{" "}
                    <code>https://</code>.
                  </p>
                )}
                {modeloAberto === "ia" && (
                  <p className="text-xs text-muted-foreground">
                    Copie este texto, cole no ChatGPT (ou outra IA) junto com a foto do seu cardápio
                    ou a lista de produtos, e cole aqui embaixo o que ele responder.
                  </p>
                )}

                {modeloAberto !== "nenhum" && (
                  <div className="space-y-2">
                    <pre className="max-h-64 overflow-auto rounded-md bg-muted/50 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                      {modeloAberto === "modelo" ? MENU_IMPORT_EXAMPLE : INSTRUCAO_PARA_IA}
                    </pre>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          const conteudo =
                            modeloAberto === "modelo" ? MENU_IMPORT_EXAMPLE : INSTRUCAO_PARA_IA;
                          void navigator.clipboard
                            .writeText(conteudo)
                            .then(() => toast.success("Copiado."))
                            .catch(() =>
                              toast.error("Não consegui copiar. Selecione o texto e copie à mão."),
                            );
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copiar
                      </Button>
                      {modeloAberto === "modelo" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setText(MENU_IMPORT_EXAMPLE);
                            setErrors([]);
                          }}
                        >
                          Preencher com o modelo
                        </Button>
                      )}
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

          {stage === "preview" && menu && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <Check className="h-4 w-4" aria-hidden="true" /> Arquivo válido.
                </p>
              </div>

              <div className="space-y-1 rounded-lg border border-border p-3 text-sm">
                <Summary label="Categorias" value={menu.categorias.length} />
                <Summary
                  label="Itens dentro das categorias"
                  value={menu.categorias.reduce((s, c) => s + c.itens.length, 0)}
                />
                <Summary label="Bebidas" value={menu.bebidas.length} />
                <Summary label="Bordas" value={menu.bordas.length} />
                <Summary label="Adicionais" value={menu.adicionais.length} />
                <Summary label="Com foto" value={contarFotos(menu)} />
                <div className="mt-2 flex justify-between border-t border-border pt-2 font-bold">
                  <span>Total a criar</span>
                  <span>{countEntries(menu)}</span>
                </div>
              </div>

              {avisos.length > 0 && (
                <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                  <p className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Confira antes de
                    importar
                  </p>
                  <ul className="space-y-1 text-muted-foreground">
                    {avisos.map((a, i) => (
                      <li key={i} className="break-words">
                        • {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {menu.categorias.length > 0 && (
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border p-3 text-xs">
                  {menu.categorias.map((c, i) => (
                    <div key={i}>
                      <p className="font-semibold">{c.nome}</p>
                      <p className="text-muted-foreground">
                        {c.itens.length === 0
                          ? "(sem itens)"
                          : c.itens
                              .map((it) => `${it.nome} — R$ ${it.preco.toFixed(2)}`)
                              .join(" · ")}
                      </p>
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
                  apagado ou substituído. Se um nome se repetir, você fica com dois itens iguais e
                  precisa apagar um pela tela normal.
                </p>
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

          {stage === "done" && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {created} {created === 1 ? "registro criado" : "registros criados"}.
                </p>
              </div>

              {failures.length > 0 && (
                <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <X className="h-4 w-4" aria-hidden="true" />
                    {failures.length} não {failures.length === 1 ? "entrou" : "entraram"}:
                  </p>
                  <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-destructive">
                    {failures.map((f, i) => (
                      <li key={i} className="break-words">
                        • <strong>{f.what}</strong>: {f.why}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    O que entrou continua salvo. Corrija o arquivo só com estes itens e importe de
                    novo, ou cadastre-os pela tela normal.
                  </p>
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
                <Button onClick={handleValidate}>Validar arquivo</Button>
              </>
            )}
            {stage === "preview" && (
              <>
                <Button variant="outline" onClick={() => setStage("input")}>
                  Voltar e editar
                </Button>
                <Button onClick={() => void runImport()}>
                  Confirmar e importar {countEntries(menu!)}
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

/** Quantos produtos, bebidas e categorias chegam com foto. */
function contarFotos(menu: ParsedMenu): number {
  return (
    menu.categorias.filter((c) => c.imagem).length +
    menu.categorias.reduce((s, c) => s + c.itens.filter((i) => i.imagem).length, 0) +
    menu.bebidas.filter((b) => b.imagem).length
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
