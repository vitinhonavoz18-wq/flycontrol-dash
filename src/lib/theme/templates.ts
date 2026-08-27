/**
 * Os 5 modelos visuais do site público e as cores de cada um.
 *
 * ATENÇÃO — ESTE ARQUIVO É UMA CÓPIA FIEL
 *
 * Quem realmente pinta o cardápio é o SiteCreatorFly, no arquivo
 * `src/components/site/SiteThemeWrapper.tsx` do outro projeto. Os dois
 * sistemas são separados e não compartilham código, então esta tabela existe
 * aqui só para o painel conseguir MOSTRAR a prévia igual ao que vai ao ar.
 *
 * É como a foto do prato no cardápio: ela não é a comida, mas precisa ser a
 * mesma comida. Mudou a receita de um lado, muda dos dois — senão a prévia
 * vira propaganda enganosa.
 */

import {
  apagadoSobre,
  bordaSobre,
  lerCor,
  paraTripletoHsl,
  superficieSobre,
  textoApagadoSobre,
  textoLegivelSobre,
  textoPrincipalSobre,
  type Hsl,
} from "./color";

/** As peças de cor que o site usa para pintar tudo. Valores em receita HSL. */
export type TokensTema = {
  bg: string;
  fg: string;
  card: string;
  border: string;
  muted: string;
  mutedFg: string;
  primary: string;
  primaryFg: string;
  secondary: string;
  headerBg: string;
  headerFg: string;
};

export type ModeloVisual = {
  id: string;
  nome: string;
  descricao: string;
  tokens: TokensTema;
};

const PADRAO_ESCURO: TokensTema = {
  bg: "0 0% 1%",
  fg: "0 0% 98%",
  card: "0 0% 4%",
  border: "0 0% 12%",
  muted: "0 0% 6%",
  mutedFg: "0 0% 65%",
  primary: "38 92% 50%",
  primaryFg: "0 0% 0%",
  secondary: "142 71% 45%",
  headerBg: "0 0% 2%",
  headerFg: "0 0% 98%",
};

export const MODELOS: readonly ModeloVisual[] = [
  {
    id: "black",
    nome: "Black Premium",
    descricao: "Escuro, elegante e gastronômico.",
    tokens: PADRAO_ESCURO,
  },
  {
    id: "white",
    nome: "White Clean",
    descricao: "Versão clara, leve e moderna.",
    tokens: {
      ...PADRAO_ESCURO,
      bg: "0 0% 98%",
      fg: "222 47% 11%",
      card: "0 0% 100%",
      border: "214 32% 91%",
      muted: "210 40% 96%",
      mutedFg: "215 16% 47%",
      primaryFg: "0 0% 100%",
      headerBg: "0 0% 100%",
      headerFg: "222 47% 11%",
    },
  },
  {
    id: "pizza_hut_style",
    nome: "Pizza Red",
    descricao: "Estilo fast-food, visual vermelho.",
    tokens: {
      ...PADRAO_ESCURO,
      bg: "30 100% 99%",
      fg: "0 0% 7%",
      card: "0 0% 100%",
      border: "24 25% 91%",
      muted: "24 25% 98%",
      mutedFg: "0 0% 33%",
      primary: "358 92% 46%",
      primaryFg: "0 0% 100%",
      headerBg: "358 92% 46%",
      headerFg: "0 0% 100%",
    },
  },
  {
    id: "burger_style",
    nome: "Burger Showcase",
    descricao: "Moderno, foco em hamburguerias.",
    tokens: {
      ...PADRAO_ESCURO,
      bg: "210 20% 98%",
      fg: "0 0% 10%",
      card: "0 0% 100%",
      border: "45 100% 90%",
      muted: "0 0% 95%",
      mutedFg: "0 0% 45%",
      primary: "35 100% 43%",
      primaryFg: "0 0% 100%",
      headerBg: "0 0% 7%",
      headerFg: "0 0% 100%",
    },
  },
  {
    id: "bar_prime",
    nome: "Bar Prime",
    descricao: "Visual moderno para bares, drinks e eventos.",
    tokens: {
      ...PADRAO_ESCURO,
      bg: "0 0% 4%",
      card: "0 0% 7%",
      border: "0 0% 15%",
      muted: "0 0% 10%",
      mutedFg: "0 0% 60%",
      headerBg: "0 0% 5%",
    },
  },
] as const;

export const MODELO_PADRAO = "black";

export function modelo(id: string | null | undefined): ModeloVisual {
  return MODELOS.find((m) => m.id === id) ?? MODELOS[0];
}

/**
 * As cores que o modelo traz de fábrica, no formato do campo de código.
 *
 * É o que o botão "Restaurar cores do tema" devolve: o lojista experimentou,
 * não gostou, e volta ao ponto de partida daquele modelo — como desfazer a
 * troca de toalha das mesas e recolocar a original.
 */
export function coresDoModelo(id: string | null | undefined): {
  primaria: Hsl;
  secundaria: Hsl;
  fundo: Hsl;
} {
  const m = modelo(id);
  return {
    primaria: lerCor(m.tokens.primary)!,
    secundaria: lerCor(m.tokens.secondary)!,
    fundo: lerCor(m.tokens.bg)!,
  };
}

/**
 * Junta o modelo escolhido com as cores da loja e devolve as peças finais.
 *
 * A regra: a cor escolhida pela loja SEMPRE vence a do modelo. Antes não era
 * assim — Pizza Red e Burger Showcase forçavam a própria cor e engoliam a
 * escolha do lojista, que mexia no campo e não via nada mudar no site.
 *
 * A cor da letra dos botões é calculada só quando a loja escolheu a cor. Nos
 * modelos sem cor personalizada nada muda, e as lojas que estão no ar
 * continuam exatamente como estão hoje.
 */
export function tokensDoTema(
  idModelo: string | null | undefined,
  primaria: Hsl | null,
  secundaria: Hsl | null,
  fundo: Hsl | null = null,
): TokensTema {
  const base = modelo(idModelo).tokens;

  // O fundo entra primeiro porque ele arrasta o resto: card, borda, área
  // apagada e cor do texto são calculados a partir dele. Escolher preto e
  // continuar com card branco e letra preta deixaria o cardápio ilegível.
  const doFundo: Partial<TokensTema> = fundo
    ? {
        bg: paraTripletoHsl(fundo),
        fg: paraTripletoHsl(textoPrincipalSobre(fundo)),
        card: paraTripletoHsl(superficieSobre(fundo)),
        muted: paraTripletoHsl(apagadoSobre(fundo)),
        mutedFg: paraTripletoHsl(textoApagadoSobre(fundo)),
        border: paraTripletoHsl(bordaSobre(fundo)),
        headerBg: paraTripletoHsl(superficieSobre(fundo)),
        headerFg: paraTripletoHsl(textoPrincipalSobre(fundo)),
      }
    : {};

  return {
    ...base,
    ...doFundo,
    primary: primaria ? paraTripletoHsl(primaria) : base.primary,
    primaryFg: primaria ? paraTripletoHsl(textoLegivelSobre(primaria)) : base.primaryFg,
    secondary: secundaria ? paraTripletoHsl(secundaria) : base.secondary,
  };
}

/**
 * As mesmas variáveis de CSS que o site público declara, para a prévia.
 *
 * Os nomes curtos (`--background`, `--surface`, `--foreground`, `--primary`,
 * `--secondary`) saem junto, apontando para os mesmos valores. Eles deixam a
 * separação de papéis explícita — fundo da página, card, texto, marca — sem
 * precisar renomear as variáveis `--site-*` que todo componente do cardápio
 * já usa hoje. Renomear tudo de uma vez seria trocar a fiação da casa
 * inteira para instalar uma tomada.
 */
export function variaveisCss(tokens: TokensTema): Record<string, string> {
  return {
    "--site-bg": tokens.bg,
    "--site-fg": tokens.fg,
    "--site-card": tokens.card,
    "--site-border": tokens.border,
    "--site-muted": tokens.muted,
    "--site-muted-fg": tokens.mutedFg,
    "--site-primary": tokens.primary,
    "--site-primary-fg": tokens.primaryFg,
    "--site-secondary": tokens.secondary,
    "--site-header-bg": tokens.headerBg,
    "--site-header-fg": tokens.headerFg,

    "--background": tokens.bg,
    "--surface": tokens.card,
    "--foreground": tokens.fg,
    "--primary": tokens.primary,
    "--secondary": tokens.secondary,
  };
}
