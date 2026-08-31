/**
 * O contrato único do COMPORTAMENTO do cardápio.
 *
 * ATENÇÃO — ESTE ARQUIVO É ESPELHADO
 *
 * Existe uma cópia idêntica em `src/lib/site/menuBehavior.ts` do SiteCreatorFly.
 * Os dois sistemas são separados e não compartilham código, então quem mexer
 * em um precisa mexer no outro. Os IDENTIFICADORES (`navigation`, `direct`,
 * `cards`, `auto`, `always`, `hide`) são o que viaja pela internet entre os
 * dois: nome e descrição podem divergir, identificador não.
 *
 * O QUE ISTO RESOLVE
 *
 * Antes, cada tela decidia sozinha o que fazer com `entry_mode`: uma escrevia
 * `"navigation"` na mão, outra lia `|| "navigation"`, outra ignorava. Era como
 * ter três cadernos de reserva no restaurante — cada garçom anotando no seu, e
 * ninguém sabendo qual mesa está de fato ocupada. Agora existe um caderno só.
 *
 * SEPARAÇÃO IMPORTANTE
 *
 * - LAYOUT (`menu_layout`) = a identidade da loja: pizzaria, farmácia, adega.
 *   Decide a ordem dos blocos, o tamanho do card, a cara.
 * - MODO DE NAVEGAÇÃO (`entry_mode`) = como o cliente ANDA pelo cardápio.
 *
 * Os dois são independentes de propósito: uma adega pode usar rolagem única e
 * continuar com a cara de adega. É a diferença entre a decoração da loja e o
 * caminho que o cliente faz entre as prateleiras.
 */

// ---------------------------------------------------------------------------
// Modo de navegação
// ---------------------------------------------------------------------------

export const MODOS_DE_NAVEGACAO = ["navigation", "direct", "cards"] as const;

export type ModoDeNavegacao = (typeof MODOS_DE_NAVEGACAO)[number];

/** A chave dentro de `site_settings`. Um lugar só, escrito uma vez só. */
export const CHAVE_DO_MODO = "entry_mode";

/**
 * O modo de quem nunca escolheu nada.
 *
 * É `direct` porque é EXATAMENTE o que todas as lojas já viam antes desta
 * correção: o cardápio inteiro numa rolagem só. Trocar este valor mudaria a
 * cara de todo mundo que nunca abriu essa tela — e ninguém pediu reforma.
 */
export const MODO_PADRAO_GLOBAL: ModoDeNavegacao = "direct";

export const MODOS_INFO: Readonly<Record<ModoDeNavegacao, { rotulo: string; descricao: string }>> =
  {
    navigation: {
      rotulo: "Navegação por Categorias",
      descricao:
        "O cliente vê primeiro as categorias e escolhe uma para ver os produtos, com uma barra para trocar de categoria depois.",
    },
    direct: {
      rotulo: "Exibição Direta (rolagem única)",
      descricao:
        "Todas as categorias aparecem uma abaixo da outra, com os produtos à vista. O cliente só rola a tela.",
    },
    cards: {
      rotulo: "Cards de Categoria",
      descricao:
        "Cards grandes com a foto de cada categoria. O cliente toca em um e entra na categoria, com botão de voltar.",
    },
  };

export function ehModoDeNavegacao(valor: unknown): valor is ModoDeNavegacao {
  return typeof valor === "string" && (MODOS_DE_NAVEGACAO as readonly string[]).includes(valor);
}

/**
 * Converte o que veio do banco em um modo válido — ou `null`.
 *
 * Devolver `null` em vez de chutar é de propósito: quem chama precisa saber a
 * diferença entre "a loja escolheu" e "a loja não escolheu", porque só no
 * segundo caso o padrão do layout entra em cena.
 */
export function normalizarModoDeNavegacao(valor: unknown): ModoDeNavegacao | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim().toLowerCase();
  return ehModoDeNavegacao(limpo) ? limpo : null;
}

type ConfiguracoesDaLoja = { [CHAVE_DO_MODO]?: unknown } | null | undefined;

/**
 * O modo que este cardápio deve usar.
 *
 * A ordem é a regra do negócio inteira, e ela importa:
 *
 * 1. A ESCOLHA DO LOJISTA, se ele fez alguma. Ela ganha de tudo — inclusive do
 *    layout do segmento. Se o dono da pizzaria escolheu rolagem única, é
 *    rolagem única, mesmo que o layout "Pizzaria" prefira outra coisa.
 * 2. O padrão do layout escolhido (mercado e farmácia pedem escolher a
 *    categoria antes; ninguém rola um mercado inteiro).
 * 3. O padrão global — a rolagem única, que é o que todo mundo já via.
 *
 * Nunca lança e nunca devolve valor inválido: cardápio no ar não pode quebrar
 * porque alguém gravou `entry_mode: "modo_novo"` na mão.
 */
export function resolverModoDeNavegacao(
  siteSettings: ConfiguracoesDaLoja,
  padraoDoLayout?: ModoDeNavegacao | null,
): ModoDeNavegacao {
  const escolhaDoLojista = normalizarModoDeNavegacao(
    siteSettings && typeof siteSettings === "object"
      ? (siteSettings as Record<string, unknown>)[CHAVE_DO_MODO]
      : undefined,
  );
  if (escolhaDoLojista) return escolhaDoLojista;

  const doLayout = normalizarModoDeNavegacao(padraoDoLayout);
  if (doLayout) return doLayout;

  return MODO_PADRAO_GLOBAL;
}

/** Se o valor gravado é uma escolha explícita do lojista (e não o padrão). */
export function lojistaEscolheuModo(siteSettings: ConfiguracoesDaLoja): boolean {
  return (
    normalizarModoDeNavegacao(
      siteSettings && typeof siteSettings === "object"
        ? (siteSettings as Record<string, unknown>)[CHAVE_DO_MODO]
        : undefined,
    ) !== null
  );
}

// ---------------------------------------------------------------------------
// Visibilidade dos combos
// ---------------------------------------------------------------------------

export const VISIBILIDADES_DE_COMBOS = ["auto", "always", "hide"] as const;

export type VisibilidadeDeCombos = (typeof VISIBILIDADES_DE_COMBOS)[number];

export const CHAVE_DOS_COMBOS = "combos_visibility";

export const VISIBILIDADE_PADRAO_DE_COMBOS: VisibilidadeDeCombos = "auto";

export const COMBOS_INFO: Readonly<Record<VisibilidadeDeCombos, string>> = {
  auto: "Automático (só se existir combo)",
  always: "Sempre mostrar",
  hide: "Ocultar",
};

export function normalizarVisibilidadeDeCombos(valor: unknown): VisibilidadeDeCombos {
  if (typeof valor !== "string") return VISIBILIDADE_PADRAO_DE_COMBOS;
  const limpo = valor.trim().toLowerCase();
  return (VISIBILIDADES_DE_COMBOS as readonly string[]).includes(limpo)
    ? (limpo as VisibilidadeDeCombos)
    : VISIBILIDADE_PADRAO_DE_COMBOS;
}

/**
 * Se a seção de combos aparece.
 *
 * "Sempre mostrar" mostra até sem combo cadastrado — é escolha do lojista, e
 * quem escolheu isso normalmente vai cadastrar combo em seguida. "Ocultar"
 * esconde mesmo tendo combo: serve para tirar do ar sem apagar o cadastro,
 * como cobrir uma vitrine em vez de esvaziá-la.
 */
export function deveMostrarCombos(valor: unknown, temCombo: boolean): boolean {
  const visibilidade = normalizarVisibilidadeDeCombos(valor);
  if (visibilidade === "hide") return false;
  if (visibilidade === "always") return true;
  return temCombo;
}

/** Lê a visibilidade direto das configurações da loja. */
export function visibilidadeDeCombosDe(siteSettings: unknown): VisibilidadeDeCombos {
  const configs = siteSettings as Record<string, unknown> | null | undefined;
  return normalizarVisibilidadeDeCombos(configs?.[CHAVE_DOS_COMBOS]);
}

// ---------------------------------------------------------------------------
// A borda: o que chega pela sincronização
// ---------------------------------------------------------------------------

/**
 * Limpa as configurações que chegam do FlyControl antes de gravar.
 *
 * DUAS COISAS ACONTECEM AQUI:
 *
 * 1. `null` quer dizer APAGAR. É assim que o painel desfaz uma escolha e
 *    devolve o cardápio ao automático. Sem isto, "voltar ao automático" não
 *    teria efeito nenhum: a gravação junta o que chega com o que já existe,
 *    então o que não chega é justamente o que fica para sempre.
 *
 * 2. Modo de navegação escrito errado é descartado. A porta da sincronização
 *    aceita quem chega com a chave da loja — e a chave pode vazar, ou a
 *    chamada pode ser montada à mão. Confiar só na conferência do painel seria
 *    o porteiro liberar quem diz "o segurança lá embaixo já me revistou".
 *
 * Descartar é melhor que recusar a sincronização inteira: uma configuração
 * estranha não pode impedir o lojista de trocar o preço de uma pizza.
 */
export function sanearConfiguracoesRecebidas(
  configs: Record<string, unknown>,
): Record<string, unknown> {
  const limpo: Record<string, unknown> = { ...configs };

  if (CHAVE_DO_MODO in limpo && normalizarModoDeNavegacao(limpo[CHAVE_DO_MODO]) === null) {
    delete limpo[CHAVE_DO_MODO];
  }

  for (const chave of Object.keys(limpo)) {
    if (limpo[chave] === null) delete limpo[chave];
  }

  return limpo;
}
