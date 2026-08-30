import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, RotateCcw, Save, Type } from "lucide-react";
import {
  TEXTOS_DO_CARDAPIO,
  conferirTexto,
  dividirTitulo,
  limparTexto,
  paraGravar,
  resolverTextos,
  type ChaveDeTexto,
  type TextosDoCardapio,
} from "@/lib/site/menuTexts";

/**
 * A aba "Textos do Cardápio" da tela Minha Loja.
 *
 * COMO ESTA TELA SE MONTA
 *
 * Ela não conhece os três campos de hoje. Ela percorre o catálogo em
 * `menuTexts.ts` e desenha um campo para cada linha que encontrar. Quando um
 * texto novo for acrescentado lá, ele aparece aqui sozinho — com rótulo,
 * ajuda, contador e validação — sem ninguém mexer neste arquivo.
 *
 * NADA SALVA SOZINHO
 *
 * Igual à aba Aparência: a pessoa escreve, apaga, compara com a prévia. Se
 * cada tecla gravasse, o cardápio do site mudaria enquanto o cliente está
 * lendo, como trocar a placa da vitrine com o freguês parado na frente dela.
 * Aqui é rascunho até apertar "Salvar alterações".
 */

type Props = {
  /** O pacotinho de configurações da loja, direto do banco. */
  siteSettings: unknown;
  /** Grava o pacote de textos. Quem chama junta com o resto das configurações. */
  aoSalvar: (textos: Record<string, string>) => Promise<boolean>;
  salvando?: boolean;
};

export function MenuTextsEditor({ siteSettings, aoSalvar, salvando }: Props) {
  // O que está no ar hoje, já com o padrão preenchido onde não há personalização.
  const noAr = useMemo(() => resolverTextos(siteSettings), [siteSettings]);

  const [rascunho, setRascunho] = useState<TextosDoCardapio>(noAr);
  const [confirmandoRestauro, setConfirmandoRestauro] = useState(false);

  const erros = useMemo(() => {
    const e: Partial<Record<ChaveDeTexto, string>> = {};
    for (const d of TEXTOS_DO_CARDAPIO) {
      const problema = conferirTexto(rascunho[d.chave] ?? "", d.chave);
      if (problema) e[d.chave] = problema;
    }
    return e;
  }, [rascunho]);

  const temErro = Object.keys(erros).length > 0;
  const mudou = TEXTOS_DO_CARDAPIO.some((d) => (rascunho[d.chave] ?? "") !== noAr[d.chave]);

  // A prévia mostra o resultado final, já com o padrão no lugar do que ficou
  // em branco — exatamente o que o cliente veria.
  const previa = useMemo(() => {
    const pronto = {} as TextosDoCardapio;
    for (const d of TEXTOS_DO_CARDAPIO) {
      const limpo = limparTexto(rascunho[d.chave], d.chave);
      pronto[d.chave] = limpo.length > 0 ? limpo : d.padrao;
    }
    return pronto;
  }, [rascunho]);

  const titulo = dividirTitulo(previa.menu_title);

  async function salvar() {
    if (temErro) return;
    const ok = await aoSalvar(paraGravar(rascunho));
    if (ok) setRascunho(resolverTextos({ menu_texts: paraGravar(rascunho) }));
  }

  async function restaurar() {
    setConfirmandoRestauro(false);
    // Gravar um pacote vazio é o mesmo que dizer "não tenho personalização":
    // na leitura, cada texto cai no padrão sozinho.
    const ok = await aoSalvar({});
    if (ok) setRascunho(resolverTextos(null));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="h-4 w-4 text-primary" /> Textos do Cardápio
          </CardTitle>
          <CardDescription>
            Personalize os principais textos exibidos no seu cardápio digital. Deixe um campo em
            branco para voltar ao texto padrão.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {TEXTOS_DO_CARDAPIO.map((d) => {
            const valor = rascunho[d.chave] ?? "";
            const erro = erros[d.chave];
            const Campo = d.multilinha ? Textarea : Input;
            return (
              <div key={d.chave} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Label htmlFor={`texto-${d.chave}`}>{d.rotulo}</Label>
                  <span
                    className={`text-xs tabular-nums ${
                      valor.length > d.maximo
                        ? "font-bold text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {valor.length}/{d.maximo}
                  </span>
                </div>
                <Campo
                  id={`texto-${d.chave}`}
                  value={valor}
                  placeholder={d.padrao}
                  rows={d.multilinha ? 3 : undefined}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setRascunho((r) => ({ ...r, [d.chave]: e.target.value }))
                  }
                  disabled={salvando}
                  aria-invalid={!!erro}
                  aria-describedby={`ajuda-${d.chave}`}
                  // `text-base` no celular evita o zoom automático que o
                  // navegador dá em campo com letra menor que 16px — a tela
                  // pula sozinha e a pessoa perde de vista o que digitava.
                  className="text-base sm:text-sm"
                />
                <p
                  id={`ajuda-${d.chave}`}
                  className={`text-xs ${erro ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {erro ?? d.ajuda}
                </p>
              </div>
            );
          })}

          {/* A prévia. Sem animação e sem carregar o cardápio inteiro: é só
              texto sendo redesenhado, o mesmo custo de digitar num campo. */}
          <div className="rounded-xl border bg-muted/30 p-5 text-center">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Prévia
            </p>
            <span className="inline-block rounded-full border border-primary/25 bg-primary/15 px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.3em] text-primary">
              {previa.menu_badge}
            </span>
            <h2 className="mt-4 text-3xl font-black uppercase tracking-tighter sm:text-4xl">
              {titulo.inicio}
              <span className="text-primary">{titulo.destaque}</span>
            </h2>
            <div className="mx-auto mb-4 mt-4 h-1 w-20 rounded-full bg-primary opacity-80" />
            <p className="mx-auto max-w-xl text-sm italic leading-relaxed text-muted-foreground opacity-90">
              {previa.menu_description}
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmandoRestauro(true)}
              disabled={salvando}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" /> Restaurar texto padrão
            </Button>
            <Button
              type="button"
              onClick={() => void salvar()}
              disabled={salvando || temErro || !mudou}
              className="gap-2"
            >
              {salvando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar alterações
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmandoRestauro} onOpenChange={setConfirmandoRestauro}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar os textos padrão do cardápio?</AlertDialogTitle>
            <AlertDialogDescription>
              Os três textos voltam ao original e o que você escreveu é perdido. O restante do
              cardápio não muda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void restaurar()}>Restaurar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
