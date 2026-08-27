import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Palette, RotateCcw, Save, X } from "lucide-react";
import { ColorPicker } from "@/components/store/ColorPicker";
import { SitePreview } from "@/components/store/SitePreview";
import { MODELOS, MODELO_PADRAO, coresDoModelo } from "@/lib/theme/templates";
import { corEscolhida, paraTripletoHsl, type Hsl } from "@/lib/theme/color";

/**
 * A aba "Aparência" da tela Minha Loja.
 *
 * DIFERENTE DO RESTO DA TELA, AQUI NADA SALVA SOZINHO
 *
 * Nos outros campos, sair do campo já grava. Cor é diferente: a pessoa
 * experimenta, arrasta, compara, volta atrás. Gravar a cada arrasto seria
 * como o garçom lançar o pedido a cada palavra que o cliente fala — o
 * cardápio do site mudaria de cor no meio do movimento, na frente de quem
 * está pedindo.
 *
 * Então tudo aqui é rascunho até apertar "Salvar alterações". "Cancelar"
 * joga o rascunho fora e traz de volta o que está no ar.
 */

type Loja = {
  name?: string | null;
  selected_template?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  show_item_images?: boolean | null;
};

type Props = {
  pizzeria: Loja;
  salvando: boolean;
  /** Grava tudo de uma vez e devolve `true` quando deu certo. */
  onSalvar: (campos: Record<string, unknown>) => Promise<boolean>;
};

type Rascunho = {
  template: string;
  primaria: Hsl;
  secundaria: Hsl;
  mostrarFotos: boolean;
};

/** Lê a loja como está salva e monta o ponto de partida do rascunho. */
function rascunhoSalvo(pizzeria: Loja): Rascunho {
  const template = pizzeria.selected_template || MODELO_PADRAO;
  const doModelo = coresDoModelo(template);
  return {
    template,
    // Sem cor escolhida, o campo já mostra a cor do próprio modelo — em vez
    // de um branco vazio que não diz nada sobre como o site está hoje.
    primaria: corEscolhida(pizzeria.primary_color) ?? doModelo.primaria,
    secundaria: corEscolhida(pizzeria.secondary_color) ?? doModelo.secundaria,
    mostrarFotos: pizzeria.show_item_images ?? true,
  };
}

function mesmaCor(a: Hsl, b: Hsl): boolean {
  return paraTripletoHsl(a) === paraTripletoHsl(b);
}

export function AppearanceEditor({ pizzeria, salvando, onSalvar }: Props) {
  const salvo = useMemo(() => rascunhoSalvo(pizzeria), [pizzeria]);
  const [rascunho, setRascunho] = useState<Rascunho>(salvo);
  // Muda a chave quando a loja recarrega: o rascunho volta ao que está no ar.
  const [chaveDaLoja, setChaveDaLoja] = useState(() => JSON.stringify(salvo));
  const chaveAtual = JSON.stringify(salvo);
  if (chaveAtual !== chaveDaLoja) {
    setChaveDaLoja(chaveAtual);
    setRascunho(salvo);
  }

  const mudou =
    rascunho.template !== salvo.template ||
    !mesmaCor(rascunho.primaria, salvo.primaria) ||
    !mesmaCor(rascunho.secundaria, salvo.secundaria) ||
    rascunho.mostrarFotos !== salvo.mostrarFotos;

  const doModeloAtual = coresDoModelo(rascunho.template);
  const naCorDoTema =
    mesmaCor(rascunho.primaria, doModeloAtual.primaria) &&
    mesmaCor(rascunho.secundaria, doModeloAtual.secundaria);

  /** Trocar de modelo traz as cores dele — é o que "escolher um modelo" significa. */
  function escolherModelo(id: string) {
    const cores = coresDoModelo(id);
    setRascunho({
      ...rascunho,
      template: id,
      primaria: cores.primaria,
      secundaria: cores.secundaria,
    });
  }

  function restaurarCoresDoTema() {
    const cores = coresDoModelo(rascunho.template);
    setRascunho({ ...rascunho, primaria: cores.primaria, secundaria: cores.secundaria });
  }

  async function salvar() {
    await onSalvar({
      selected_template: rascunho.template,
      primary_color: paraTripletoHsl(rascunho.primaria),
      secondary_color: paraTripletoHsl(rascunho.secundaria),
      show_item_images: rascunho.mostrarFotos,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" /> Aparência
        </CardTitle>
        <CardDescription>
          Modelo visual e cores da marca no site público. Mexa à vontade — nada vai ao ar antes de
          você salvar.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Modelo visual do site</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {MODELOS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => escolherModelo(m.id)}
                disabled={salvando}
                className={`rounded-lg border-2 p-3 text-left transition-colors ${
                  rascunho.template === m.id
                    ? "border-primary bg-primary/5"
                    : "border-input hover:border-primary/40"
                }`}
              >
                <p className="text-sm font-bold">{m.nome}</p>
                <p className="text-[10px] text-muted-foreground">{m.descricao}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Escolher um modelo carrega as cores dele. Depois disso você pode trocar as cores como
            quiser.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cor-primaria">Cor primária</Label>
              <ColorPicker
                id="cor-primaria"
                rotulo="Cor primária"
                valor={rascunho.primaria}
                disabled={salvando}
                onChange={(c) => setRascunho((r) => ({ ...r, primaria: c }))}
              />
              <p className="text-xs text-muted-foreground">
                A cor da marca: botões, preços e destaques do cardápio.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cor-secundaria">Cor secundária</Label>
              <ColorPicker
                id="cor-secundaria"
                rotulo="Cor secundária"
                valor={rascunho.secundaria}
                disabled={salvando}
                onChange={(c) => setRascunho((r) => ({ ...r, secundaria: c }))}
              />
              <p className="text-xs text-muted-foreground">
                Usada nos valores somados: adicionais, bordas e o total do carrinho.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Exibir fotos nos sabores/itens</p>
                <p className="text-[10px] text-muted-foreground">
                  Habilita o anexo de fotos no cardápio público
                </p>
              </div>
              <Switch
                checked={rascunho.mostrarFotos}
                onCheckedChange={(v) => setRascunho((r) => ({ ...r, mostrarFotos: v }))}
                disabled={salvando}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Como vai ficar</Label>
            <SitePreview
              template={rascunho.template}
              primaria={rascunho.primaria}
              secundaria={rascunho.secundaria}
              nomeDaLoja={pizzeria.name || ""}
            />
            <p className="text-xs text-muted-foreground">
              Prévia do cardápio com as cores deste rascunho.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            onClick={() => setRascunho(salvo)}
            disabled={salvando || !mudou}
            className="sm:order-1"
          >
            <X className="mr-2 h-4 w-4" /> Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={restaurarCoresDoTema}
            disabled={salvando || naCorDoTema}
            className="sm:order-2"
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Restaurar cores do tema
          </Button>
          <Button onClick={salvar} disabled={salvando || !mudou} className="sm:order-3">
            {salvando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar alterações
          </Button>
        </div>

        {mudou && (
          <p className="text-right text-xs text-amber-600 dark:text-amber-500">
            Você tem alterações que ainda não foram para o site.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
