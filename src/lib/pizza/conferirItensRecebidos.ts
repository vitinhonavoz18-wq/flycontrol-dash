/**
 * Segunda conferência das pizzas, agora no FlyControl, quando o pedido chega.
 *
 * QUEM CONFERE O QUÊ
 *
 * O preço "de cardápio" é conferido no SiteCreatorFly, que tem o cardápio
 * público oficial: ele refaz a conta e só deixa o pedido seguir com o preço
 * certo. Aqui no FlyControl não refazemos a conta do cardápio (os IDs dos
 * produtos são outros nos dois sistemas). O que conferimos é a FOTOGRAFIA da
 * pizza (`item.pizza`) que vem junto:
 *
 *   - se as peças fecham a conta (sabores + borda + adicionais = preço
 *     unitário; preço unitário × quantidade = total);
 *   - se a regra declarada foi seguida (maior preço / média proporcional);
 *   - se o preço do item e a quantidade batem com a fotografia;
 *   - se o subtotal do pedido é a soma dos itens.
 *
 * É como a cozinha conferir a comanda: não sabe o preço de tudo de cabeça,
 * mas percebe se a soma da comanda não fecha.
 *
 * Itens sem fotografia (bebidas, combos, pizzas do formato antigo) passam
 * como antes — exatamente o comportamento de hoje.
 */

import { conferirRegistroDaPizza, reaisParaCentavos, type RegistroDaPizza } from "./motorDePreco";

export type ProblemaNaPizza = { indice: number; nome: string; erros: string[] };

export type ResultadoDaConferenciaRecebida =
  | { ok: true; pizzas: number }
  | { ok: false; motivo: "pizza_inconsistente"; problemas: ProblemaNaPizza[] }
  | {
      ok: false;
      motivo: "subtotal_inconsistente";
      subtotal_enviado_centavos: number;
      soma_dos_itens_centavos: number;
    };

function temRegistro(item: unknown): item is { pizza: RegistroDaPizza } & Record<string, unknown> {
  return !!item && typeof item === "object" && !!(item as { pizza?: unknown }).pizza;
}

export function conferirItensRecebidos(args: {
  itens: unknown[];
  subtotalEnviado: unknown;
}): ResultadoDaConferenciaRecebida {
  const problemas: ProblemaNaPizza[] = [];
  let pizzas = 0;

  args.itens.forEach((item, indice) => {
    if (!temRegistro(item)) return;
    pizzas += 1;
    const r = item.pizza;
    const erros = conferirRegistroDaPizza(r);
    if (erros.length === 0) {
      if (reaisParaCentavos(item.unit_price) !== r.preco_unitario_centavos) {
        erros.push("o preço do item é diferente do preço da pizza");
      }
      if (Number(item.quantity) !== r.quantidade) {
        erros.push("a quantidade do item é diferente da quantidade da pizza");
      }
    }
    if (erros.length > 0) problemas.push({ indice, nome: String(item.name ?? "Pizza"), erros });
  });

  if (problemas.length > 0) return { ok: false, motivo: "pizza_inconsistente", problemas };
  if (pizzas === 0) return { ok: true, pizzas };

  // Com pizza do configurador no pedido, o subtotal precisa ser a soma dos
  // itens. Senão bastaria mandar itens certos com subtotal menor — e é o
  // subtotal que vira cobrança.
  const soma = args.itens.reduce<number>((s, it) => {
    const i = (it ?? {}) as Record<string, unknown>;
    const total =
      i.total_price !== undefined && i.total_price !== null
        ? i.total_price
        : Number(i.unit_price ?? 0) * Number(i.quantity ?? 1);
    return s + reaisParaCentavos(total);
  }, 0);
  const enviado = reaisParaCentavos(args.subtotalEnviado);
  if (Math.abs(soma - enviado) > 1) {
    return {
      ok: false,
      motivo: "subtotal_inconsistente",
      subtotal_enviado_centavos: enviado,
      soma_dos_itens_centavos: soma,
    };
  }
  return { ok: true, pizzas };
}
