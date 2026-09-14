/**
 * Liga a contagem do plano CENTS quando a loja termina de se preparar.
 *
 * O PROBLEMA QUE ISTO RESOLVE
 *
 * Uma loja no CENTS só é cobrada se tiver assinatura E um ciclo aberto — é o
 * ciclo que recebe a contagem dos pedidos. Lojas criadas fora do cadastro
 * normal (pelo painel do administrador, por exemplo) nasciam marcadas como
 * CENTS na ficha, mas sem assinatura nenhuma. Resultado: pedidos entravam, o
 * gatilho de consumo não achava onde lançar, e ninguém era cobrado.
 *
 * Era a comanda aberta que nunca foi levada ao caixa: o cliente comeu, o
 * garçom anotou, e no fim do dia não havia conta nenhuma para fechar.
 *
 * QUANDO A CONTAGEM COMEÇA
 *
 * Quando o lojista termina os passos do "Prepare sua loja" — conhecer o
 * estabelecimento, cadastrar produtos, configurar loja e pagamento, publicar o
 * cardápio. É o momento em que ele passa a poder vender de verdade, então é o
 * momento justo para a cobrança por pedido começar a valer: cobra quando ele
 * começa a ganhar, não antes.
 *
 * NUNCA COBRA O QUE PASSOU
 *
 * O ciclo abre a partir de AGORA. Pedido anterior à abertura não entra na
 * conta, nem que a loja já venha vendendo há meses. Fatura retroativa por
 * consumo que o dono nunca viu somando na tela é o tipo de surpresa que
 * destrói confiança — e vale bem mais do que o valor recuperado.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertOwnsTenant } from "@/lib/server/plan-guard";
import { openFirstCycle } from "@/lib/billing/activateSubscription.server";
import type { BillingDb } from "@/lib/billing/supabaseBridge";

export type ResultadoDaAtivacao = {
  /** true quando a contagem passou a valer agora, nesta chamada. */
  ativouAgora: boolean;
  /** Por que não ativou, quando não ativou. Serve para log, não para a tela. */
  motivo?: string;
};

const db = supabaseAdmin as unknown as BillingDb;

/**
 * Garante que a loja tenha assinatura CENTS ativa e ciclo aberto.
 *
 * Chamável quantas vezes for: quem já tem ciclo aberto sai no primeiro `if`.
 * A tela chama isso ao ver o checklist completo, e chamar de novo no próximo
 * carregamento não pode abrir um segundo ciclo — dois ciclos abertos fariam o
 * mesmo pedido ser contado duas vezes.
 */
export const garantirContagemCents = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ResultadoDaAtivacao> => {
    await assertOwnsTenant(context.supabase, context.userId, data.tenantId);

    const { data: loja } = await supabaseAdmin
      .from("pizzerias")
      .select("id, plan_type, status")
      .eq("id", data.tenantId)
      .maybeSingle();

    const ficha = loja as { id: string; plan_type: string | null; status: string } | null;
    if (!ficha) return { ativouAgora: false, motivo: "loja_nao_encontrada" };
    if (ficha.plan_type !== "cents") return { ativouAgora: false, motivo: "nao_e_cents" };
    if (ficha.status !== "active") return { ativouAgora: false, motivo: "loja_inativa" };

    const { data: assinaturaAtual } = await db
      .from("subscriptions")
      .select("id, status, current_cycle_id")
      .eq("company_id", data.tenantId)
      .maybeSingle();

    const atual = assinaturaAtual as {
      id: string;
      status: string;
      current_cycle_id: string | null;
    } | null;

    // Já está contando: nada a fazer. É a saída mais comum, e por isso vem
    // antes de qualquer escrita.
    if (atual?.current_cycle_id) return { ativouAgora: false, motivo: "ja_contando" };

    // Assinatura cancelada ou suspensa não é religada por um checklist. Voltar
    // a cobrar quem pediu para sair precisa de uma decisão humana, não de um
    // efeito colateral de tela.
    if (atual && !["active", "pending_activation"].includes(atual.status)) {
      return { ativouAgora: false, motivo: `assinatura_${atual.status}` };
    }

    const { data: plano } = await db
      .from("plans")
      .select("id, billing_model")
      .eq("code", "cents")
      .eq("is_active", true)
      .maybeSingle();

    const planoCents = plano as { id: string; billing_model: string } | null;
    if (!planoCents) return { ativouAgora: false, motivo: "plano_cents_ausente" };

    const { data: versao } = await db
      .from("plan_price_versions")
      .select("id")
      .eq("plan_id", planoCents.id)
      .eq("is_active", true)
      .maybeSingle();

    const versaoAtual = versao as { id: string } | null;
    if (!versaoAtual) return { ativouAgora: false, motivo: "tabela_de_preco_ausente" };

    const agora = new Date().toISOString();
    let assinaturaId = atual?.id;

    if (!assinaturaId) {
      const { data: criada, error } = await db
        .from("subscriptions")
        .insert({
          company_id: data.tenantId,
          plan_id: planoCents.id,
          plan_price_version_id: versaoAtual.id,
          // O CENTS não tem valor de entrada: não há pagamento a esperar, e
          // deixar em "pending_activation" seria travar a contagem esperando
          // uma cobrança que não existe.
          status: "active",
          billing_model: planoCents.billing_model,
          payment_provider: "manual",
          activated_at: agora,
          billing_anchor_day: new Date(agora).getUTCDate(),
        })
        .select("id")
        .maybeSingle();

      if (error || !criada) {
        console.error("[billing] falha ao criar assinatura CENTS:", error);
        return { ativouAgora: false, motivo: "falha_ao_criar_assinatura" };
      }
      assinaturaId = (criada as { id: string }).id;
    } else if (atual?.status === "pending_activation") {
      const { error } = await db
        .from("subscriptions")
        .update({ status: "active", activated_at: agora, updated_at: agora })
        .eq("id", assinaturaId);
      if (error) {
        console.error("[billing] falha ao ativar assinatura CENTS:", error);
        return { ativouAgora: false, motivo: "falha_ao_ativar" };
      }
    }

    await db.from("subscription_events").insert({
      subscription_id: assinaturaId,
      company_id: data.tenantId,
      event_type: "cents_counting_started",
      previous_status: atual?.status ?? null,
      new_status: "active",
      reason: "Loja concluiu os primeiros passos: contagem por pedido passa a valer",
      metadata: { origem: "prepare_sua_loja", retroativo: false },
    });

    await openFirstCycle(db, assinaturaId);

    return { ativouAgora: true };
  });
