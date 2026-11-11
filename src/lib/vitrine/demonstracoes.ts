/**
 * Vitrine de Cardápios — quais demonstrações aparecem em /vitrine.
 *
 * A lista mora em `demonstracoes.json`, ao lado deste arquivo. Ela é escrita
 * de duas formas:
 *   - pelo gerador (`scripts/vitrine/gerar-demonstracoes.mjs`), que grava o
 *     vídeo e preenche o campo `video`;
 *   - à mão, para a decisão que é do dono e não da máquina: `publicar`.
 *
 * REGRA DE OURO: só aparece na vitrine o cardápio com `publicar: true` E com
 * vídeo gravado. Loja nova entra com `publicar: false`. É como a vitrine da
 * loja de roupa: a peça só vai para o manequim depois que o gerente aprova —
 * o estoque inteiro não aparece na calçada sozinho.
 *
 * Nada aqui é dado privado: nome, cidade, categoria e o endereço do cardápio
 * são as mesmas informações que o próprio site da loja mostra a qualquer um.
 */

import dados from "./demonstracoes.json";

export type VideoDemonstracao = {
  mp4: string;
  webm: string | null;
  poster: string;
  largura: number;
  altura: number;
  duracao: number;
  tamanhoKB: number;
  gravadoEm: string;
  versaoRoteiro: number;
  etapas: string[];
  lojaFechadaNaGravacao: boolean;
};

export type Demonstracao = {
  slug: string;
  nome: string;
  categoria: string;
  cidade: string | null;
  /** Endereço público do cardápio (site de pedidos da loja). */
  url: string;
  /** Cor da marca da loja, em CSS. */
  cor: string;
  logo: string | null;
  publicar: boolean;
  observacao?: string | null;
  video: VideoDemonstracao | null;
};

export type DemonstracaoPublica = Demonstracao & { video: VideoDemonstracao };

const TODAS = dados as Demonstracao[];

/** As que podem aparecer: aprovadas e com vídeo. Aberta e com pedido completo primeiro. */
export function demonstracoesPublicas(lista: Demonstracao[] = TODAS): DemonstracaoPublica[] {
  const peso = (d: DemonstracaoPublica) =>
    (d.video.lojaFechadaNaGravacao ? 0 : 2) + (d.video.etapas.includes("resumo do pedido") ? 1 : 0);
  return lista
    .filter((d): d is DemonstracaoPublica => d.publicar === true && !!d.video?.mp4)
    .sort((a, b) => peso(b) - peso(a));
}

/** Categorias com quantas demonstrações cada uma tem, em ordem de tamanho. */
export function categorias(lista: DemonstracaoPublica[]): { nome: string; total: number }[] {
  const contagem = new Map<string, number>();
  for (const d of lista) contagem.set(d.categoria, (contagem.get(d.categoria) ?? 0) + 1);
  return [...contagem.entries()]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

/**
 * Filtro só aparece quando ajuda de verdade: pelo menos 6 demonstrações e 3
 * categorias com 2 ou mais cada. Um filtro com uma loja por botão é só
 * enfeite que obriga a pessoa a clicar à toa.
 */
export function mostrarFiltros(lista: DemonstracaoPublica[]): boolean {
  return lista.length >= 6 && categorias(lista).filter((c) => c.total >= 2).length >= 3;
}
