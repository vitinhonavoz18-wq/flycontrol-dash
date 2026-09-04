/**
 * "Prepare sua loja" — a lista de primeiros passos do painel.
 *
 * A REGRA QUE MANDA AQUI: NADA É INVENTADO
 *
 * Cada item desta lista é marcado a partir de um dado REAL do sistema. Não
 * existe passo que se marca sozinho, nem passo bonito que não corresponde a
 * nada — seria o boletim que dá nota para matéria que ninguém deu.
 *
 * Por isso a lista é curta: ela cresce quando existir mais coisa de verdade
 * para conferir, não antes.
 *
 * A lista some quando tudo estiver feito. Ela é um andaime, não um móvel.
 */

export type SinaisDaLoja = {
  onboardingConcluido: boolean;
  produtos: number;
  /** Nome, telefone e endereço preenchidos. */
  lojaIdentificada: boolean;
  /** Alguma forma de pagamento escolhida. */
  temPagamento: boolean;
  /** O cardápio público existe e está no ar. */
  cardapioPublicado: boolean;
  pedidos: number;
};

export type Passo = {
  id: string;
  rotulo: string;
  feito: boolean;
  /** Para onde levar quem clicar. */
  para?: string;
};

export function primeirosPassos(s: SinaisDaLoja): Passo[] {
  return [
    {
      id: "conhecemos",
      rotulo: "Conhecemos seu estabelecimento",
      feito: s.onboardingConcluido,
    },
    {
      id: "produtos",
      rotulo: "Adicione seus produtos",
      feito: s.produtos > 0,
      para: "/menu",
    },
    {
      id: "loja",
      rotulo: "Configure sua loja",
      feito: s.lojaIdentificada,
      para: "/my-store",
    },
    {
      id: "pagamentos",
      rotulo: "Configure pagamentos",
      feito: s.temPagamento,
      para: "/my-store",
    },
    {
      id: "publicar",
      rotulo: "Publique seu cardápio",
      feito: s.cardapioPublicado,
      para: "/my-store",
    },
    {
      id: "primeiro_pedido",
      rotulo: "Receba seu primeiro pedido",
      feito: s.pedidos > 0,
    },
  ];
}

export function tudoFeito(s: SinaisDaLoja): boolean {
  return primeirosPassos(s).every((p) => p.feito);
}

export function quantosFeitos(s: SinaisDaLoja): { feitos: number; total: number } {
  const passos = primeirosPassos(s);
  return { feitos: passos.filter((p) => p.feito).length, total: passos.length };
}
