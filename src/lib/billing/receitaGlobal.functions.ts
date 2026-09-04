/**
 * O total que a FlyControl faturou com a cobrança por pedido, somando todas as
 * lojas. Roda no servidor, atrás de login e de verificação de administrador.
 *
 * POR QUE NÃO É CALCULADO NO NAVEGADOR
 *
 * Duas razões. A primeira é de peso: puxar todos os pedidos de todas as lojas
 * para o celular do administrador somar seria carregar o estoque inteiro do
 * depósito até o caixa para conferir o preço de um produto. Aqui o servidor lê
 * uma linha por CICLO (algumas dezenas), não uma por pedido.
 *
 * A segunda é de confiança: quem manda no dinheiro é o servidor. Se a conta
 * fosse feita na tela, bastaria mexer no que a tela recebe para o número
 * mudar.
 *
 * QUEM PODE VER
 *
 * Só administrador da plataforma. A verificação usa `is_admin()`, a mesma
 * função que as regras do banco usam — assim a permissão da tela e a do banco
 * nunca discordam. Para qualquer outra pessoa a resposta é nula: nenhum
 * lojista enxerga o faturamento de outro, nem o total.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPlanPricing, isPublicPlanCode } from "./plans";
import { somarReceitaGlobal, type CicloParaSomaGlobal, type ReceitaGlobal } from "./receitaGlobal";

type CicloBruto = {
  company_id: string;
  status: string;
  cents_policy: string | null;
  unit_price_cents: number | null;
  billable_order_count: number | null;
  gross_usage_amount_cents: number | null;
  subscriptions: { billing_model: string | null; plans: { code: string | null } | null } | null;
};

/**
 * O plano cobra por pedido?
 *
 * A resposta preferida vem da própria assinatura (`billing_model`), que é o
 * que o motor de cobrança usa. Quando ela não veio junto, cai para a tabela de
 * planos — nunca para um palpite.
 */
function cobraPorPedido(ciclo: CicloBruto): boolean {
  const modelo = ciclo.subscriptions?.billing_model;
  if (modelo) return modelo === "usage_per_order";
  const code = ciclo.subscriptions?.plans?.code;
  return code && isPublicPlanCode(code)
    ? getPlanPricing(code).billingModel === "usage_per_order"
    : false;
}

export const receitaGlobalPorPedido = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReceitaGlobal | null> => {
    const { data: ehAdmin, error: erroPermissao } = await context.supabase.rpc("is_admin");
    if (erroPermissao || !ehAdmin) return null;

    // A leitura em si usa a chave mestra de propósito: o total é justamente a
    // soma de lojas que o administrador não "possui". Quem autoriza é a
    // verificação acima, não a regra de linha do banco.
    const { data, error } = await supabaseAdmin
      .from("billing_cycles")
      .select(
        "company_id, status, cents_policy, unit_price_cents, billable_order_count, " +
          "gross_usage_amount_cents, subscriptions(billing_model, plans(code))",
      );

    if (error) {
      console.error("[insights/receita-global] falha ao ler os ciclos:", error.message);
      return null;
    }

    const ciclos = (data ?? []) as unknown as CicloBruto[];
    const empresas = [...new Set(ciclos.map((c) => c.company_id))];

    // Nome da loja só para o detalhamento da tela. Uma consulta, não uma por
    // ciclo.
    const nomePorEmpresa = new Map<string, string>();
    if (empresas.length > 0) {
      const { data: lojas } = await supabaseAdmin
        .from("pizzerias")
        .select("id, name")
        .in("id", empresas);
      for (const loja of lojas ?? []) {
        nomePorEmpresa.set((loja as { id: string }).id, (loja as { name: string }).name ?? "—");
      }
    }

    const paraSomar: CicloParaSomaGlobal[] = ciclos.map((c) => ({
      companyId: c.company_id,
      companyName: nomePorEmpresa.get(c.company_id) ?? "Loja sem nome",
      status: String(c.status ?? ""),
      usageBased: cobraPorPedido(c),
      centsPolicy: c.cents_policy,
      unitPriceCents: Number(c.unit_price_cents ?? 0),
      billableOrderCount: Number(c.billable_order_count ?? 0),
      grossUsageAmountCents:
        c.gross_usage_amount_cents === null ? null : Number(c.gross_usage_amount_cents),
    }));

    return somarReceitaGlobal(paraSomar);
  });
