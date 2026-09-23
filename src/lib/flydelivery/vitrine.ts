/**
 * Produtos em Vitrine do FlyDelivery — as regras que o painel mostra.
 *
 * QUEM MANDA DE VERDADE É O BANCO
 *
 * A regra de quem pode entrar na vitrine mora no banco
 * (`flydelivery_showcase_issues_of`, migração do repositório FlyDelivery). O
 * banco recusa o que não cumpre, mesmo que alguém burle esta tela. Aqui só
 * traduzimos os códigos que o banco devolve em frases que o lojista entende —
 * é o porteiro (banco) e a placa na porta (painel): a placa explica, quem
 * barra é o porteiro.
 */

/** Quantos produtos cada loja pode ter na vitrine. Igual à trava do banco. */
export const LIMITE_DA_VITRINE = 3;

/** Os códigos de pendência que o banco devolve, na ordem em que aparecem. */
export const PENDENCIAS = [
  "product_inactive",
  "product_unavailable",
  "no_name",
  "no_photo",
  "no_price",
  "no_promo",
  "promo_not_lower",
  "store_not_listed",
] as const;

export type Pendencia = (typeof PENDENCIAS)[number];

/**
 * A lista de conferência que o lojista vê: cada requisito com ✓ ou ✕.
 *
 * "promo_not_lower" não tem linha própria: ele é o motivo do ✕ na linha do
 * preço promocional, com a frase explicando o porquê.
 */
export function checklist(
  issues: readonly string[],
): { rotulo: string; ok: boolean; motivo?: string }[] {
  const tem = (c: Pendencia) => issues.includes(c);
  const promoOk = !tem("no_promo") && !tem("promo_not_lower");
  return [
    { rotulo: "Produto ativo", ok: !tem("product_inactive") },
    { rotulo: "Disponível hoje", ok: !tem("product_unavailable") },
    { rotulo: "Nome", ok: !tem("no_name") },
    { rotulo: "Foto cadastrada", ok: !tem("no_photo") },
    {
      rotulo: "Preço normal",
      ok: !tem("no_price"),
      motivo: tem("no_price")
        ? "Produto sem preço próprio (ex.: sabor cobrado pelo tamanho)."
        : undefined,
    },
    {
      rotulo: "Preço promocional",
      ok: promoOk,
      motivo: tem("promo_not_lower")
        ? "A promoção precisa ser menor que o preço normal."
        : tem("no_promo")
          ? "Cadastre o preço promocional no FlyDelivery."
          : undefined,
    },
    {
      rotulo: "Loja aparecendo no FlyDelivery",
      ok: !tem("store_not_listed"),
      motivo: tem("store_not_listed")
        ? "Ligue “Aparecer no aplicativo” na aba Presença."
        : undefined,
    },
  ];
}

export type LeituraDaPromocao = { ok: true; valor: number | null } | { ok: false; erro: string };

/**
 * Lê o campo "Preço promocional no FlyDelivery" do formulário do produto.
 *
 * Vazio = sem promoção (vale). Preenchido precisa ser um número maior que
 * zero e MENOR que o preço normal — promoção igual ou maior não é promoção.
 */
export function lerPrecoPromocional(texto: string, precoNormal: number): LeituraDaPromocao {
  const limpo = texto.trim();
  if (!limpo) return { ok: true, valor: null };

  const valor = Number(
    limpo
      .replace(/\s|R\$/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", "."),
  );
  if (!Number.isFinite(valor) || valor <= 0) {
    return { ok: false, erro: "Preço promocional inválido." };
  }
  // Centavos inteiros: evita 22.899999 virar outra coisa na comparação.
  const promoCentavos = Math.round(valor * 100);
  const normalCentavos = Math.round(precoNormal * 100);
  if (promoCentavos >= normalCentavos) {
    return { ok: false, erro: "O preço promocional precisa ser menor que o preço normal." };
  }
  return { ok: true, valor: promoCentavos / 100 };
}

/** Desconto em %, arredondado, para o selo "-20%". */
export function percentualDeDesconto(preco: number, promo: number): number {
  if (!(preco > 0) || !(promo > 0) || promo >= preco) return 0;
  return Math.round((1 - promo / preco) * 100);
}
