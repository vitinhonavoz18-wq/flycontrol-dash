/**
 * As palavras que o PAINEL usa para falar do cardápio, conforme o nicho.
 *
 * O PROBLEMA QUE ISTO RESOLVE
 *
 * O FlyControl nasceu para pizzaria, e o vocabulário ficou. Uma farmácia
 * abria a tela Cardápio e via "Sabores", "Bordas Recheadas" e "Máx. de
 * Sabores" — como entrar numa drogaria e o atendente perguntar qual o recheio
 * da borda. Não estava errado tecnicamente; estava errado para quem lê.
 *
 * Aqui não muda NADA de funcionamento: as mesmas telas, os mesmos campos, os
 * mesmos dados. Muda só a placa em cima da prateleira.
 *
 * DE ONDE SAI O NICHO
 *
 * A mesma ordem que o cardápio público já usa para escolher o layout:
 *
 * 1. o layout que o lojista escolheu na mão, se escolheu;
 * 2. o layout recomendado para o tipo de estabelecimento (`business_type`);
 * 3. o padrão, que é o vocabulário neutro.
 *
 * Assim, trocar "Pizzaria" por "Farmácia" no cadastro da loja já troca as
 * palavras da tela — sem precisar configurar nada em outro lugar.
 *
 * ESTE ARQUIVO NÃO É ESPELHADO
 *
 * Ele é só do painel. O site público tem os textos dele em outro lugar
 * (`lib/site/menuTexts.ts`), que o lojista edita à mão em Minha Loja.
 */

import { layoutPorId, layoutRecomendadoPara, type LayoutId } from "./layouts";

export type VocabularioDoCardapio = {
  /** Nome da aba e título da lista dos produtos principais. */
  abaProdutos: string;
  tituloProdutos: string;
  /** A opção "Sabor" no seletor de tipo de produto. */
  tipoSabor: string;
  /** Aba e título da lista de tamanhos. */
  abaTamanhos: string;
  tituloTamanhos: string;
  /** Como esta loja chama "sabor" dentro de um tamanho. */
  sabor: string;
  sabores: string;
  rotuloMaxSabores: string;
  /** Aba, título e grupos da lista de complementos. */
  abaExtras: string;
  tituloExtras: string;
  grupoBordas: string;
  grupoAdicionais: string;
  /** Exemplos que aparecem em cinza dentro dos campos vazios. */
  exemploNomeCategoria: string;
  exemploDescricaoCategoria: string;
};

/**
 * O vocabulário neutro: serve para qualquer negócio e é o ponto de partida de
 * todos os outros. Mexer aqui muda a tela de quem não tem nicho reconhecido.
 */
const NEUTRO: VocabularioDoCardapio = {
  abaProdutos: "Produtos",
  tituloProdutos: "Produtos do Cardápio",
  tipoSabor: "Variação",
  abaTamanhos: "Tamanhos",
  tituloTamanhos: "Tamanhos & Preços",
  sabor: "opção",
  sabores: "opções",
  rotuloMaxSabores: "Máx. de Opções",
  abaExtras: "Adicionais",
  tituloExtras: "Adicionais & Variações",
  grupoBordas: "Variações",
  grupoAdicionais: "Adicionais",
  exemploNomeCategoria: "Ex: Destaques, Bebidas, etc.",
  exemploDescricaoCategoria: "Ex: uma frase curta que aparece no cardápio.",
};

export const VOCABULARIOS: Readonly<Record<LayoutId, VocabularioDoCardapio>> = {
  generic: NEUTRO,

  // A pizzaria mantém EXATAMENTE as palavras de hoje. Nenhuma pizzaria no ar
  // vê a tela mudar por causa desta funcionalidade.
  pizza: {
    ...NEUTRO,
    abaProdutos: "Sabores",
    tituloProdutos: "Sabores & Produtos",
    tipoSabor: "Sabor",
    tituloTamanhos: "Tamanhos & Preços de Pizza",
    sabor: "sabor",
    sabores: "sabores",
    rotuloMaxSabores: "Máx. de Sabores",
    abaExtras: "Bordas/Adic.",
    tituloExtras: "Bordas & Adicionais",
    grupoBordas: "Bordas Recheadas",
    exemploNomeCategoria: "Ex: Pizzas Tradicionais, Bebidas, etc.",
    exemploDescricaoCategoria: "Ex: todas as pizzas acompanham molho de tomate.",
  },

  burger: {
    ...NEUTRO,
    abaProdutos: "Lanches",
    tituloProdutos: "Lanches & Produtos",
    grupoBordas: "Pães e Variações",
    exemploNomeCategoria: "Ex: Smash, Artesanais, Porções, etc.",
    exemploDescricaoCategoria: "Ex: todos os lanches acompanham batata.",
  },

  acai: {
    ...NEUTRO,
    tituloProdutos: "Produtos & Tamanhos",
    tipoSabor: "Sabor",
    tituloTamanhos: "Tamanhos & Preços dos Copos",
    sabor: "sabor",
    sabores: "sabores",
    rotuloMaxSabores: "Máx. de Sabores",
    abaExtras: "Complementos",
    tituloExtras: "Complementos & Coberturas",
    grupoBordas: "Tamanhos e Potes",
    grupoAdicionais: "Complementos",
    exemploNomeCategoria: "Ex: Açaí, Sorvetes, Coberturas, etc.",
    exemploDescricaoCategoria: "Ex: escolha até 5 complementos sem custo.",
  },

  restaurant: {
    ...NEUTRO,
    abaProdutos: "Pratos",
    tituloProdutos: "Pratos & Produtos",
    tituloExtras: "Acompanhamentos & Adicionais",
    grupoBordas: "Acompanhamentos",
    exemploNomeCategoria: "Ex: Entradas, Pratos Principais, Sobremesas",
    exemploDescricaoCategoria: "Ex: os pratos servem duas pessoas.",
  },

  japanese: {
    ...NEUTRO,
    abaProdutos: "Pratos",
    tituloProdutos: "Pratos & Combinados",
    exemploNomeCategoria: "Ex: Combinados, Temakis, Hot Rolls",
    exemploDescricaoCategoria: "Ex: peças montadas na hora do pedido.",
  },

  bakery: {
    ...NEUTRO,
    tituloProdutos: "Produtos da Padaria",
    exemploNomeCategoria: "Ex: Pães, Salgados, Cafés, etc.",
    exemploDescricaoCategoria: "Ex: assados na hora, todos os dias.",
  },

  beverage: {
    ...NEUTRO,
    tituloProdutos: "Produtos da Adega",
    exemploNomeCategoria: "Ex: Cervejas, Destilados, Refrigerantes",
    exemploDescricaoCategoria: "Ex: bebidas geladas, prontas para levar.",
  },

  pharmacy: {
    ...NEUTRO,
    tituloProdutos: "Catálogo de Produtos",
    tituloTamanhos: "Apresentações & Preços",
    abaExtras: "Relacionados",
    tituloExtras: "Apresentações & Itens Relacionados",
    grupoBordas: "Apresentações",
    grupoAdicionais: "Itens Relacionados",
    exemploNomeCategoria: "Ex: Medicamentos, Higiene, Dermocosméticos",
    exemploDescricaoCategoria: "Ex: confira a apresentação e a dosagem.",
  },

  market: {
    ...NEUTRO,
    tituloProdutos: "Catálogo de Produtos",
    exemploNomeCategoria: "Ex: Mercearia, Frios, Limpeza, etc.",
    exemploDescricaoCategoria: "Ex: produtos selecionados do dia.",
  },
};

/** O que a loja tem gravado e que interessa para escolher as palavras. */
type LojaParaVocabulario =
  | {
      business_type?: unknown;
      site_settings?: { menu_layout?: unknown } | null;
    }
  | null
  | undefined;

/**
 * As palavras desta loja.
 *
 * Nunca lança e nunca devolve nada vazio: uma tela do painel não pode ficar
 * sem rótulo porque alguém digitou um tipo de estabelecimento que o sistema
 * ainda não conhece — nesse caso valem as palavras neutras.
 */
export function vocabularioDaLoja(loja: LojaParaVocabulario): VocabularioDoCardapio {
  const escolhido = layoutPorId(loja?.site_settings?.menu_layout);
  if (escolhido) return VOCABULARIOS[escolhido.id];

  const recomendado = layoutRecomendadoPara(loja?.business_type);
  if (recomendado) return VOCABULARIOS[recomendado];

  return NEUTRO;
}

/** "1 sabor" / "3 sabores", com a palavra certa para o nicho. */
export function contarSabores(quantidade: number, vocabulario: VocabularioDoCardapio): string {
  return `${quantidade} ${quantidade === 1 ? vocabulario.sabor : vocabulario.sabores}`;
}
