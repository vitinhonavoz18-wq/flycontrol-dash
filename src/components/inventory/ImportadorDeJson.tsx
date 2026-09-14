import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Copy,
  FileJson,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCents } from "@/lib/billing/money";
import { qtd } from "@/lib/inventory/formato";
import {
  INSTRUCAO_PARA_IA,
  MODELO_COMPLETO,
  MODELO_SIMPLES,
  formatarJson,
  lerImportacaoDeProdutos,
  type ErroDeImportacao,
  type ProdutoImportado,
} from "@/lib/inventory/importSchema";
import {
  conferirDuplicidadeDeProdutos,
  importarProdutosPorJson,
  type AcaoDoProduto,
  type ProdutoJaExistente,
  type ResultadoDaImportacao,
} from "@/lib/inventory/inventory.functions";

/**
 * Importar vários produtos de uma vez colando um JSON.
 *
 * O CAMINHO É SEMPRE O MESMO: colar → conferir → escolher → importar.
 *
 * Nada é gravado antes de o lojista ver o que vai entrar. Um arquivo de
 * trezentos produtos importado às cegas é trezentos itens para conferir
 * depois — e ninguém confere. Por isso a prévia não é opcional.
 *
 * O produto importado é IGUAL ao cadastrado na mão: mesma tabela, mesmas
 * regras, mesma baixa de estoque. Não existe "produto de importação" — quem
 * olhar o cadastro depois não consegue dizer por onde ele entrou.
 */

type Etapa = "entrada" | "previa" | "resultado";

const MOTIVO_EM_PORTUGUES: Record<ProdutoJaExistente["motivo"], string> = {
  codigo_barras: "mesmo código de barras",
  sku: "mesmo SKU",
  nome_e_categoria: "mesmo nome e categoria",
  nome: "mesmo nome",
};

type LinhaDaPrevia = ProdutoImportado & {
  selecionado: boolean;
  duplicado: ProdutoJaExistente | null;
  acao: AcaoDoProduto;
};

export function ImportadorDeJson({
  tenantId,
  onImportado,
}: {
  tenantId: string;
  onImportado: () => void;
}) {
  const conferirDuplicidade = useServerFn(conferirDuplicidadeDeProdutos);
  const importar = useServerFn(importarProdutosPorJson);

  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>("entrada");
  const [texto, setTexto] = useState("");
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [errosDeProduto, setErrosDeProduto] = useState<ErroDeImportacao[]>([]);
  const [linhas, setLinhas] = useState<LinhaDaPrevia[]>([]);
  const [modeloAberto, setModeloAberto] = useState<"nenhum" | "simples" | "completo" | "ia">(
    "nenhum",
  );
  const [conferindo, setConferindo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDaImportacao | null>(null);

  const arquivo = useRef<HTMLInputElement>(null);
  /**
   * A senha desta importação.
   *
   * Criada uma vez por conferência e reusada se a pessoa clicar duas vezes ou
   * a internet cair no meio. É o que faz a segunda tentativa devolver o
   * resultado da primeira em vez de cadastrar tudo de novo.
   */
  const chave = useRef<string>("");

  function limparTudo() {
    setEtapa("entrada");
    setTexto("");
    setErroGeral(null);
    setErrosDeProduto([]);
    setLinhas([]);
    setResultado(null);
    setConfirmando(false);
    chave.current = "";
  }

  function fechar(proximo: boolean) {
    setAberto(proximo);
    if (!proximo) limparTudo();
  }

  async function handleArquivo(f: File) {
    if (!f.name.toLowerCase().endsWith(".json")) {
      toast.error("Escolha um arquivo terminado em .json");
      return;
    }
    if (f.size > 5_000_000) {
      toast.error("Arquivo grande demais. Divida a importação em partes.");
      return;
    }
    // O arquivo é lido como TEXTO e nada mais. Não existe execução de nada
    // aqui dentro — é o mesmo que se a pessoa tivesse colado o conteúdo à mão.
    setTexto(await f.text());
    setErroGeral(null);
    toast.success(`Arquivo "${f.name}" carregado.`);
  }

  function handleFormatar() {
    const r = formatarJson(texto);
    if (!r.ok) {
      toast.error(r.erro);
      return;
    }
    setTexto(r.texto);
    toast.success("JSON organizado.");
  }

  async function handleConferir() {
    const leitura = lerImportacaoDeProdutos(texto);

    if (leitura.erroGeral) {
      setErroGeral(leitura.erroGeral);
      setErrosDeProduto([]);
      return;
    }

    setErroGeral(null);
    setErrosDeProduto(leitura.erros);

    if (leitura.produtos.length === 0) {
      setErroGeral("Nenhum produto pôde ser lido. Corrija os erros abaixo e confira de novo.");
      return;
    }

    setConferindo(true);
    try {
      // Quais já existem no estoque? Quem responde é o servidor, olhando a
      // loja de verdade — a tela não tem como saber.
      const duplicados = await conferirDuplicidade({
        data: {
          tenantId,
          produtos: leitura.produtos.map((p) => ({
            nome: p.nome,
            sku: p.sku,
            codigoBarras: p.codigoBarras,
            categoria: p.categoria,
          })),
        },
      });

      const porIndice = new Map(duplicados.map((d) => [d.indice, d]));

      setLinhas(
        leitura.produtos.map((p, i) => {
          const dup = porIndice.get(i) ?? null;
          return {
            ...p,
            duplicado: dup,
            // O padrão do repetido é IGNORAR. Errar para o lado de não mexer
            // no que já está cadastrado é sempre mais barato do que sobrescrever
            // sem querer o preço de um produto que já está vendendo.
            acao: dup ? "ignorar" : "criar",
            selecionado: !dup,
          };
        }),
      );

      chave.current = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      setEtapa("previa");
    } catch (e) {
      setErroGeral(e instanceof Error ? e.message : "Não consegui conferir os produtos.");
    } finally {
      setConferindo(false);
    }
  }

  const selecionados = useMemo(() => linhas.filter((l) => l.selecionado), [linhas]);
  const totalDuplicados = useMemo(() => linhas.filter((l) => l.duplicado).length, [linhas]);

  async function handleImportar() {
    if (selecionados.length === 0) return;
    setImportando(true);
    try {
      const r = await importar({
        data: {
          tenantId,
          chaveDeImportacao: chave.current,
          produtos: selecionados.map((p) => ({
            nome: p.nome,
            sku: p.sku,
            codigoBarras: p.codigoBarras,
            categoria: p.categoria,
            marca: p.marca,
            descricao: p.descricao,
            imagemUrl: p.imagemUrl,
            unidadeBase: p.unidadeBase,
            quantidadeEstoque: p.quantidadeEstoque,
            estoqueMinimo: p.estoqueMinimo,
            precoCustoCents: p.precoCustoCents,
            precoVendaCents: p.precoVendaCents,
            ativo: p.ativo,
            embalagens: p.embalagens.map((e) => ({
              unidade: e.unidade,
              quantidade: e.quantidade,
              precoCents: e.precoCents,
            })),
            acao: p.acao,
            produtoExistenteId: p.duplicado?.existenteId ?? null,
          })),
        },
      });
      setResultado(r);
      setEtapa("resultado");
      onImportado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui importar.");
      setConfirmando(false);
    } finally {
      setImportando(false);
    }
  }

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setAberto(true)}>
        <FileJson className="h-4 w-4" aria-hidden="true" />
        Importar JSON
      </Button>

      <Dialog open={aberto} onOpenChange={fechar}>
        {/* No celular ocupa a tela toda: editar JSON numa janelinha é sofrimento. */}
        <DialogContent className="flex h-[100dvh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:h-[92dvh] sm:rounded-xl">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-primary" aria-hidden="true" />
              Importar produtos por JSON
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Cadastre vários produtos no estoque de uma só vez.
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {etapa === "entrada" && (
              <Entrada
                texto={texto}
                setTexto={setTexto}
                erroGeral={erroGeral}
                errosDeProduto={errosDeProduto}
                modeloAberto={modeloAberto}
                setModeloAberto={setModeloAberto}
                onFormatar={handleFormatar}
                onLimpar={() => {
                  setTexto("");
                  setErroGeral(null);
                  setErrosDeProduto([]);
                }}
                onEscolherArquivo={() => arquivo.current?.click()}
              />
            )}

            {etapa === "previa" && (
              <Previa
                linhas={linhas}
                setLinhas={setLinhas}
                erros={errosDeProduto}
                totalDuplicados={totalDuplicados}
              />
            )}

            {etapa === "resultado" && resultado && <Resultado resultado={resultado} />}
          </div>

          <input
            ref={arquivo}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleArquivo(f);
              e.target.value = "";
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
            {etapa === "entrada" && (
              <>
                <span className="text-xs text-muted-foreground">
                  {texto.trim() ? "Confira antes de importar." : "Adicione seu JSON para começar."}
                </span>
                <Button
                  onClick={handleConferir}
                  disabled={!texto.trim() || conferindo}
                  className="gap-2"
                >
                  {conferindo ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Validar JSON
                </Button>
              </>
            )}

            {etapa === "previa" && !confirmando && (
              <>
                <Button variant="outline" onClick={() => setEtapa("entrada")}>
                  Voltar
                </Button>
                <Button
                  onClick={() => setConfirmando(true)}
                  disabled={selecionados.length === 0}
                  className="gap-2"
                >
                  Importar {selecionados.length}{" "}
                  {selecionados.length === 1 ? "produto" : "produtos"}
                </Button>
              </>
            )}

            {etapa === "previa" && confirmando && (
              <>
                <div className="min-w-0 flex-1 text-sm">
                  <strong>
                    {selecionados.length} {selecionados.length === 1 ? "produto" : "produtos"}
                  </strong>{" "}
                  {selecionados.length === 1 ? "será adicionado" : "serão adicionados"} ao estoque.
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setConfirmando(false)}
                    disabled={importando}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={handleImportar} disabled={importando} className="gap-2">
                    {importando ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Importando produtos…
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" /> Confirmar
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}

            {etapa === "resultado" && (
              <>
                <Button variant="outline" onClick={limparTudo}>
                  Importar outro JSON
                </Button>
                <Button onClick={() => fechar(false)}>Ver produtos</Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------

function Entrada({
  texto,
  setTexto,
  erroGeral,
  errosDeProduto,
  modeloAberto,
  setModeloAberto,
  onFormatar,
  onLimpar,
  onEscolherArquivo,
}: {
  texto: string;
  setTexto: (v: string) => void;
  erroGeral: string | null;
  errosDeProduto: ErroDeImportacao[];
  modeloAberto: "nenhum" | "simples" | "completo" | "ia";
  setModeloAberto: (v: "nenhum" | "simples" | "completo" | "ia") => void;
  onFormatar: () => void;
  onLimpar: () => void;
  onEscolherArquivo: () => void;
}) {
  const linhas = texto ? texto.split("\n").length : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-2" onClick={onEscolherArquivo}>
          <Upload className="h-4 w-4" /> Escolher arquivo .json
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={onFormatar}
          disabled={!texto.trim()}
        >
          <Wand2 className="h-4 w-4" /> Formatar
        </Button>
        <Button variant="ghost" size="sm" className="gap-2" onClick={onLimpar} disabled={!texto}>
          <Trash2 className="h-4 w-4" /> Limpar
        </Button>
      </div>

      <div>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={'{\n  "produtos": []\n}'}
          spellCheck={false}
          className="min-h-[260px] font-mono text-[13px] leading-relaxed"
          aria-label="Cole aqui o JSON dos produtos"
        />
        {linhas > 0 && (
          <p className="mt-1 text-right text-[11px] text-muted-foreground">
            {linhas} {linhas === 1 ? "linha" : "linhas"}
          </p>
        )}
      </div>

      {erroGeral && (
        <div className="flex gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-400">
          <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{erroGeral}</span>
        </div>
      )}

      {errosDeProduto.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="mb-2 text-sm font-bold text-amber-700 dark:text-amber-400">
            Encontramos alguns campos que precisam ser corrigidos:
          </p>
          <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-400">
            {errosDeProduto.slice(0, 12).map((e, i) => (
              <li key={i}>
                <strong>
                  Produto {e.posicao}
                  {e.nome ? ` — ${e.nome}` : ""}
                </strong>
                : {e.mensagem}
              </li>
            ))}
            {errosDeProduto.length > 12 && (
              <li className="italic">e mais {errosDeProduto.length - 12}…</li>
            )}
          </ul>
        </div>
      )}

      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="text-sm font-bold">Modelos</p>
        <div className="flex flex-wrap gap-2">
          <BotaoDeModelo
            ativo={modeloAberto === "simples"}
            onClick={() => setModeloAberto(modeloAberto === "simples" ? "nenhum" : "simples")}
          >
            Modelo simples
          </BotaoDeModelo>
          <BotaoDeModelo
            ativo={modeloAberto === "completo"}
            onClick={() => setModeloAberto(modeloAberto === "completo" ? "nenhum" : "completo")}
          >
            Modelo completo
          </BotaoDeModelo>
          <BotaoDeModelo
            ativo={modeloAberto === "ia"}
            onClick={() => setModeloAberto(modeloAberto === "ia" ? "nenhum" : "ia")}
          >
            <Sparkles className="h-3.5 w-3.5" /> Cadastro com IA
          </BotaoDeModelo>
        </div>

        {modeloAberto === "ia" && (
          <p className="text-xs text-muted-foreground">
            Copie este texto e use no ChatGPT, Claude ou outra IA para transformar fotos ou listas
            de produtos no padrão aceito pelo FlyControl.
          </p>
        )}

        {modeloAberto !== "nenhum" && (
          <CaixaDeModelo
            conteudo={
              modeloAberto === "simples"
                ? MODELO_SIMPLES
                : modeloAberto === "completo"
                  ? MODELO_COMPLETO
                  : INSTRUCAO_PARA_IA
            }
            podeUsar={modeloAberto !== "ia"}
            onUsar={() => setTexto(modeloAberto === "simples" ? MODELO_SIMPLES : MODELO_COMPLETO)}
          />
        )}
      </div>
    </div>
  );
}

function BotaoDeModelo({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button variant={ativo ? "default" : "outline"} size="sm" className="gap-1.5" onClick={onClick}>
      {children}
    </Button>
  );
}

function CaixaDeModelo({
  conteudo,
  podeUsar,
  onUsar,
}: {
  conteudo: string;
  podeUsar: boolean;
  onUsar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(conteudo);
      setCopiado(true);
      toast.success("Modelo copiado com sucesso!");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Navegador sem permissão de área de transferência. O texto está na
      // tela: dá para selecionar e copiar à mão.
      toast.error("Não consegui copiar. Selecione o texto e copie manualmente.");
    }
  }

  return (
    <div className="space-y-2">
      <pre className="max-h-56 overflow-auto rounded-lg bg-muted p-3 font-mono text-[11px] leading-relaxed">
        {conteudo}
      </pre>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={copiar}>
          {copiado ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
          {copiado ? "Copiado!" : "Copiar"}
        </Button>
        {podeUsar && (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={onUsar}>
            <Copy className="h-3.5 w-3.5" /> Usar este modelo
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Previa({
  linhas,
  setLinhas,
  erros,
  totalDuplicados,
}: {
  linhas: LinhaDaPrevia[];
  setLinhas: React.Dispatch<React.SetStateAction<LinhaDaPrevia[]>>;
  erros: ErroDeImportacao[];
  totalDuplicados: number;
}) {
  const selecionados = linhas.filter((l) => l.selecionado).length;

  function marcarTodos(valor: boolean) {
    setLinhas((atual) => atual.map((l) => ({ ...l, selecionado: valor })));
  }

  function mudarAcao(posicao: number, acao: AcaoDoProduto) {
    setLinhas((atual) =>
      atual.map((l) =>
        l.posicao === posicao ? { ...l, acao, selecionado: acao !== "ignorar" } : l,
      ),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-base font-bold">
          {linhas.length} {linhas.length === 1 ? "produto encontrado" : "produtos encontrados"}
        </p>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          >
            ✓ {linhas.length - totalDuplicados} novos
          </Badge>
          {totalDuplicados > 0 && (
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            >
              ⚠ {totalDuplicados} já existem
            </Badge>
          )}
          {erros.length > 0 && (
            <Badge
              variant="outline"
              className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400"
            >
              ✕ {erros.length} com erro
            </Badge>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => marcarTodos(true)}>
          Selecionar todos
        </Button>
        <Button variant="outline" size="sm" onClick={() => marcarTodos(false)}>
          Desmarcar todos
        </Button>
        <span className="self-center text-xs text-muted-foreground">
          {selecionados} selecionado{selecionados === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-2">
        {linhas.map((l) => (
          <div
            key={l.posicao}
            className={`rounded-lg border p-3 ${
              l.duplicado ? "border-amber-500/40 bg-amber-500/5" : "border-border"
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={l.selecionado}
                onChange={(e) =>
                  setLinhas((atual) =>
                    atual.map((x) =>
                      x.posicao === l.posicao ? { ...x, selecionado: e.target.checked } : x,
                    ),
                  )
                }
                className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                aria-label={`Selecionar ${l.nome}`}
              />

              <div className="min-w-0 flex-1">
                <p className="truncate font-bold leading-tight">{l.nome}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {l.categoria || "sem categoria"} · {qtd(l.quantidadeEstoque)} {l.unidadeBase} ·{" "}
                  {l.precoVendaCents > 0 ? formatCents(l.precoVendaCents) : "sem preço"}
                  {l.embalagens.length > 0 && (
                    <>
                      {" · "}
                      {l.embalagens.length} {l.embalagens.length === 1 ? "embalagem" : "embalagens"}
                    </>
                  )}
                </p>

                {l.embalagens.length > 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {l.embalagens
                      .map((e) => `1 ${e.unidade} = ${qtd(e.quantidade)} ${l.unidadeBase}`)
                      .join(" · ")}
                  </p>
                )}

                {l.duplicado && (
                  <div className="mt-2 space-y-1.5">
                    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        <strong>{l.duplicado.existenteNome}</strong> já existe no estoque (
                        {MOTIVO_EM_PORTUGUES[l.duplicado.motivo]}).
                      </span>
                    </p>
                    <Select
                      value={l.acao}
                      onValueChange={(v) => mudarAcao(l.posicao, v as AcaoDoProduto)}
                    >
                      <SelectTrigger className="h-8 w-[220px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ignorar">Ignorar (não mexer)</SelectItem>
                        <SelectItem value="atualizar">Atualizar o existente</SelectItem>
                        <SelectItem value="criar">Criar mesmo assim</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {erros.length > 0 && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-400">
          <p className="font-bold">
            {erros.length} {erros.length === 1 ? "produto ficou" : "produtos ficaram"} de fora por
            erro:
          </p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {erros.slice(0, 8).map((e, i) => (
              <li key={i}>
                Produto {e.posicao}
                {e.nome ? ` — ${e.nome}` : ""}: {e.mensagem}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Resultado({ resultado }: { resultado: ResultadoDaImportacao }) {
  const erros = Array.isArray(resultado.errors) ? resultado.errors : [];

  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
        <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      </div>

      <div>
        <h3 className="text-lg font-bold">Produtos adicionados ao estoque com sucesso!</h3>
        {resultado.repetida && (
          <p className="mt-1 text-sm text-muted-foreground">
            Esta importação já tinha sido feita — nada foi cadastrado de novo.
          </p>
        )}
      </div>

      <div className="mx-auto grid max-w-sm grid-cols-2 gap-2 text-left">
        <Numero rotulo="Adicionados" valor={resultado.total_created} tom="emerald" />
        <Numero rotulo="Atualizados" valor={resultado.total_updated} tom="sky" />
        <Numero rotulo="Ignorados" valor={resultado.total_skipped} tom="muted" />
        <Numero rotulo="Com erro" valor={resultado.total_errors} tom="rose" />
      </div>

      {erros.length > 0 && (
        <div className="mx-auto max-w-lg rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-left text-xs text-rose-700 dark:text-rose-400">
          {erros.slice(0, 10).map((e, i) => (
            <p key={i}>
              <strong>{e.nome || "Produto"}</strong>: {e.mensagem}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string;
  valor: number;
  tom: "emerald" | "sky" | "rose" | "muted";
}) {
  const tons = {
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
    sky: "border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-400",
    rose: "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-400",
    muted: "border-border bg-muted/40",
  };
  return (
    <div className={`rounded-lg border p-3 ${tons[tom]}`}>
      <p className="text-2xl font-black tabular-nums">{valor}</p>
      <p className="text-xs font-medium">{rotulo}</p>
    </div>
  );
}
