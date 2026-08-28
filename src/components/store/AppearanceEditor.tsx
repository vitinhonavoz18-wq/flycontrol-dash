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
import { MenuLayoutPicker } from "@/components/store/MenuLayoutPicker";
import { layoutPorId, type LayoutId } from "@/lib/menu/layouts";

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
  /** O tipo do negócio, editado na aba Identidade. Aqui só é lido. */
  business_type?: string | null;
  /**
   * O pacotinho de configurações extras da loja. A cor de fundo mora aqui,
   * em `background_color`, e não numa coluna própria: `site_settings` já
   * existe, já viaja para o site público e já é MESCLADO do outro lado, então
   * gravar uma chave nova não apaga as outras nem exige mexer no banco.
   */
  site_settings?: Record<string, unknown> | null;
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
  fundo: Hsl;
  mostrarFotos: boolean;
  /**
   * O layout escolhido, ou `null` para "usar o recomendado pelo meu tipo de
   * negócio". Guardar `null` em vez do id recomendado é de propósito: assim,
   * se o lojista trocar o tipo do estabelecimento depois, o cardápio
   * acompanha sozinho em vez de ficar preso na escolha antiga.
   */
  layout: LayoutId | null;
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
    // Loja antiga não tem esta chave: cai na cor do próprio modelo, que é
    // exatamente o fundo que ela já mostra hoje. Ninguém muda de cara sozinho.
    fundo: corEscolhida(pizzeria.site_settings?.background_color) ?? doModelo.fundo,
    mostrarFotos: pizzeria.show_item_images ?? true,
    layout: layoutPorId(pizzeria.site_settings?.menu_layout)?.id ?? null,
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
    !mesmaCor(rascunho.fundo, salvo.fundo) ||
    rascunho.mostrarFotos !== salvo.mostrarFotos ||
    rascunho.layout !== salvo.layout;

  const doModeloAtual = coresDoModelo(rascunho.template);
  const naCorDoTema =
    mesmaCor(rascunho.primaria, doModeloAtual.primaria) &&
    mesmaCor(rascunho.secundaria, doModeloAtual.secundaria) &&
    mesmaCor(rascunho.fundo, doModeloAtual.fundo);

  /** Trocar de modelo traz as cores dele — é o que "escolher um modelo" significa. */
  function escolherModelo(id: string) {
    const cores = coresDoModelo(id);
    setRascunho({
      ...rascunho,
      template: id,
      primaria: cores.primaria,
      secundaria: cores.secundaria,
      fundo: cores.fundo,
    });
  }

  function restaurarCoresDoTema() {
    const cores = coresDoModelo(rascunho.template);
    setRascunho({
      ...rascunho,
      primaria: cores.primaria,
      secundaria: cores.secundaria,
      fundo: cores.fundo,
    });
  }

  async function salvar() {
    await onSalvar({
      selected_template: rascunho.template,
      primary_color: paraTripletoHsl(rascunho.primaria),
      secondary_color: paraTripletoHsl(rascunho.secundaria),
      show_item_images: rascunho.mostrarFotos,
      // Mesclado com o que já estava lá: `site_settings` guarda também o
      // modelo de checkout e o desconto de marketing. Gravar só a cor
      // apagaria os dois — como reescrever a comanda inteira para mudar o
      // ponto da carne.
      site_settings: {
        ...(pizzeria.site_settings ?? {}),
        background_color: paraTripletoHsl(rascunho.fundo),
        // String vazia, e não a chave removida: o site mescla o que chega com
        // o que já tem, então apagar a chave aqui deixaria a escolha antiga
        // viva do outro lado. Vazio é o que o site lê como "sem escolha".
        menu_layout: rascunho.layout ?? "",
      },
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

        <div className="border-t pt-5">
          <MenuLayoutPicker
            businessType={pizzeria.business_type}
            valor={rascunho.layout}
            disabled={salvando}
            onChange={(l) => setRascunho((r) => ({ ...r, layout: l }))}
          />
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

            <div className="space-y-2">
              <Label htmlFor="cor-fundo">Cor de fundo</Label>
              <ColorPicker
                id="cor-fundo"
                rotulo="Cor de fundo"
                valor={rascunho.fundo}
                disabled={salvando}
                onChange={(c) => setRascunho((r) => ({ ...r, fundo: c }))}
              />
              <p className="text-xs text-muted-foreground">
                Define a cor de fundo principal do seu cardápio. Os cards dos produtos e a cor do
                texto se ajustam sozinhos para continuar legíveis.
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
              fundo={rascunho.fundo}
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
