/**
 * A conta da divisão do Pix entre o FlyDelivery e o estabelecimento.
 *
 * COMO A SYNCPAY DIVIDE
 *
 * A cobrança Pix é gerada pela conta da PLATAFORMA. No pedido de cobrança vai
 * uma lista "split" dizendo quem mais recebe e quanto, em percentual INTEIRO:
 *
 *     split: [{ user_id: <conta do estabelecimento>, percentage: 97 }]
 *
 * O que não foi destinado a ninguém fica com quem gerou a cobrança — a
 * plataforma. Pedido de R$ 100,00 com comissão de 3%: R$ 97,00 vão para a
 * conta da loja e R$ 3,00 ficam com o FlyDelivery. Valores BRUTOS: a tarifa da
 * SyncPay sai depois, de acordo com o contrato.
 *
 * AS REGRAS ESCRITAS (para ninguém precisar adivinhar)
 *
 * 1. Percentual sempre inteiro, de 1% a 50%. A SyncPay documenta percentual
 *    inteiro no Pix; 2,5% simplesmente não existe aqui. O teto de 50% pega
 *    erro de digitação (97 no lugar de 3).
 * 2. A comissão incide sobre o VALOR COBRADO inteiro (produtos + entrega −
 *    desconto). O split da SyncPay é um percentual da cobrança toda; não dá
 *    para aplicar 3% só sobre os produtos sem cair em percentual quebrado.
 * 3. Arredondamento: a parte da loja é arredondada PARA BAIXO no centavo e o
 *    centavo que sobra fica com a plataforma. R$ 33,33 × 97% = R$ 32,3301 →
 *    loja R$ 32,33, plataforma R$ 1,00. É uma PREVISÃO: quem divide de verdade
 *    é a SyncPay, e se o centavo dela cair diferente a conciliação mostra.
 * 4. Tudo em centavos inteiros. Nada de 0,1 + 0,2.
 *
 * A mesma regra está escrita no banco (`flydelivery_pix_reserve`), que é quem
 * decide de fato. Este arquivo serve para a tela e para os testes — e há um
 * teste que confere que os dois lados dão o mesmo resultado.
 */

export const COMISSAO_MINIMA = 1;
export const COMISSAO_MAXIMA = 50;
export const COMISSAO_PADRAO = 3;

export type Divisao = {
  totalCentavos: number;
  comissaoPercentual: number;
  percentualLoja: number;
  centavosLoja: number;
  centavosPlataforma: number;
};

export type ValidacaoDeComissao = { ok: true; valor: number } | { ok: false; motivo: string };

/** Confere uma comissão digitada ou vinda do banco. Nunca arredonda por conta própria. */
export function validarComissao(valor: unknown): ValidacaoDeComissao {
  const numero = typeof valor === "string" ? Number(valor.trim().replace(",", ".")) : valor;
  if (typeof numero !== "number" || !Number.isFinite(numero)) {
    return { ok: false, motivo: "Informe a comissão em número." };
  }
  if (!Number.isInteger(numero)) {
    return {
      ok: false,
      motivo: "No Pix a SyncPay só aceita percentual inteiro (ex.: 3%, não 2,5%).",
    };
  }
  if (numero < COMISSAO_MINIMA || numero > COMISSAO_MAXIMA) {
    return {
      ok: false,
      motivo: `A comissão precisa ficar entre ${COMISSAO_MINIMA}% e ${COMISSAO_MAXIMA}%.`,
    };
  }
  return { ok: true, valor: numero };
}

export function calcularDivisao(totalCentavos: number, comissaoPercentual: number): Divisao {
  if (!Number.isSafeInteger(totalCentavos) || totalCentavos <= 0) {
    throw new Error(
      `[split] total precisa ser inteiro positivo em centavos, recebido ${totalCentavos}`,
    );
  }
  const comissao = validarComissao(comissaoPercentual);
  if (!comissao.ok) throw new Error(`[split] ${comissao.motivo}`);

  const percentualLoja = 100 - comissao.valor;
  // Divisão inteira = arredonda para baixo (valores positivos).
  const centavosLoja = Math.floor((totalCentavos * percentualLoja) / 100);
  return {
    totalCentavos,
    comissaoPercentual: comissao.valor,
    percentualLoja,
    centavosLoja,
    centavosPlataforma: totalCentavos - centavosLoja,
  };
}

/**
 * Reais (como chegam do banco, `numeric` → número ou texto) para centavos,
 * sem passar por conta de ponto flutuante: "19.9" vira 1990 lendo os dígitos.
 * Mais de 2 casas decimais que não sejam zero é erro, não arredondamento.
 */
export function reaisParaCentavos(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  let texto: string;
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return null;
    // `toString` de número não gera notação científica para dinheiro realista.
    texto = String(valor);
  } else if (typeof valor === "string") {
    texto = valor.trim();
  } else {
    return null;
  }
  const casou = /^(-)?(\d+)(?:\.(\d+))?$/.exec(texto);
  if (!casou) return null;
  const [, sinal, inteiros, decimaisBrutos = ""] = casou;
  const decimais = decimaisBrutos.replace(/0+$/, "");
  if (decimais.length > 2) return null;
  const centavos = Number(inteiros) * 100 + Number(decimais.padEnd(2, "0"));
  if (!Number.isSafeInteger(centavos)) return null;
  return sinal ? -centavos : centavos;
}

/** Centavos para o "amount" da SyncPay (reais com até 2 casas, como número). */
export function centavosParaValorDaApi(centavos: number): number {
  if (!Number.isSafeInteger(centavos) || centavos <= 0) {
    throw new Error(`[split] valor inválido para cobrança: ${centavos}`);
  }
  // Inteiro / 100 sempre dá o número de duas casas mais próximo (1990 → 19.9).
  return centavos / 100;
}

/** "R$ 1.234,56" — só para mostrar. */
export function formatarCentavos(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined || !Number.isFinite(centavos)) return "—";
  const negativo = centavos < 0;
  const absoluto = Math.abs(Math.trunc(centavos));
  const reais = Math.floor(absoluto / 100).toLocaleString("pt-BR");
  const resto = String(absoluto % 100).padStart(2, "0");
  return `${negativo ? "- " : ""}R$ ${reais},${resto}`;
}
