import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/authMiddleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { asBillingDb } from "./supabaseBridge";
import {
  POLITICA_CENTS_V2,
  politicaPorVersao,
  progressoCents,
  marcosDaTrilha,
  type MarcoDaTrilha,
  type PedacoDaConta,
} from "./centsTiers";

/**
 * A progressão do CENTS, calculada NO SERVIDOR.
 *
 * POR QUE NÃO NO NAVEGADOR
 *
 * O número que aparece na tela é o mesmo que vai virar fatura. Se o navegador
 * fizesse a conta, bastaria alguém mexer no que ele mostra para a tela contar
 * uma história e a cobrança contar outra — e a diferença só apareceria no dia
 * do boleto. Aqui a conta sai do mesmo arquivo que o motor de faturamento usa
 * (`centsTiers.ts`), lendo os mesmos eventos de pedido.
 *
 * ISOLAMENTO ENTRE EMPRESAS
 *
 * O navegador NÃO informa de qual loja quer os números. A loja é descoberta
 * a partir de quem está logado. É a diferença entre o caixa perguntar "qual é
 * a sua conta?" e o caixa olhar a comanda que está na mão do cliente.
 */

export type FaixaNaTela = {
  nivel: number;
  rotulo: string;
  de: number;
  ate: number | null;
  precoCents: number;
  quantidade: number;
  subtotalCents: number;
};

export type ProgressoNaTela = {
  /** `false` quando esta loja ainda não está na política de faixas. */
  comFaixas: boolean;
  politica: string;
  pedidos: number;
  nivel: number;
  rotuloDoNivel: string;
  precoDoProximoPedidoCents: number;
  proxima: { meta: number; faltam: number; precoCents: number } | null;
  percentDaFase: number;
  posicaoNaTrilha: number;
  marcos: MarcoDaTrilha[];
  faixas: FaixaNaTela[];
  totalCents: number;
  noMaximo: boolean;
  cicloInicio: string | null;
  cicloFim: string | null;
  /** O melhor ciclo já fechado desta loja. Só motivação, nunca cobrança. */
  recorde: { pedidos: number; nivel: number } | null;
};

function paraTela(pedacos: PedacoDaConta[]): FaixaNaTela[] {
  return pedacos.map((p) => ({
    nivel: p.faixa.nivel,
    rotulo: p.faixa.rotulo,
    de: p.faixa.de,
    ate: p.faixa.ate,
    precoCents: p.faixa.precoCents,
    quantidade: p.quantidade,
    subtotalCents: p.subtotalCents,
  }));
}

export const progressoDoCents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProgressoNaTela | null> => {
    // A loja sai de quem está logado. Nunca de um id vindo do navegador.
    const { data: empresa } = await supabaseAdmin
      .from("pizzerias")
      .select("id")
      .eq("owner_id", context.userId)
      .neq("status", "deleted")
      .neq("status", "inactive")
      .limit(1)
      .maybeSingle();

    if (!empresa) return null;
    const companyId = (empresa as { id: string }).id;

    const db = asBillingDb(supabaseAdmin);

    const { data: assinatura } = await db
      .from("subscriptions")
      .select(
        "id, plans(code), billing_cycles!subscriptions_current_cycle_fkey(id, cycle_start, cycle_end, billable_order_count, cents_policy)",
      )
      .eq("company_id", companyId)
      .maybeSingle();

    const linha = assinatura as {
      id: string;
      plans: { code: string } | null;
      billing_cycles: {
        id: string;
        cycle_start: string;
        cycle_end: string;
        billable_order_count: number;
        cents_policy: string | null;
      } | null;
    } | null;

    if (!linha || linha.plans?.code !== "cents") return null;

    const ciclo = linha.billing_cycles;
    // O carimbo do próprio ciclo. A tela mostra a tabela pela qual este
    // ciclo vai ser cobrado, e não a que estiver vigente hoje.
    const politica = politicaPorVersao(ciclo?.cents_policy);

    // A contagem vem da soma dos eventos de uso, e não do contador da linha:
    // se os dois divergirem, os eventos é que são a verdade auditável — é a
    // mesma fonte que o fechamento do ciclo usa para gerar a fatura.
    let pedidos = ciclo?.billable_order_count ?? 0;
    if (ciclo?.id) {
      const { data: contagem } = await db.rpc("billing_cycle_true_count", {
        p_cycle_id: ciclo.id,
      });
      const real = Number(contagem ?? NaN);
      if (Number.isSafeInteger(real) && real >= 0) pedidos = real;
    }

    const progresso = progressoCents(politica, pedidos);
    const comFaixas = politica.versao === POLITICA_CENTS_V2.versao;

    return {
      comFaixas,
      politica: politica.versao,
      pedidos: progresso.pedidos,
      nivel: progresso.faixaAtual.nivel,
      rotuloDoNivel: progresso.faixaAtual.rotulo,
      precoDoProximoPedidoCents: progresso.precoDoProximoPedidoCents,
      proxima: progresso.proxima
        ? {
            meta: progresso.proxima.meta,
            faltam: progresso.proxima.faltam,
            precoCents: progresso.proxima.faixaSeguinte.precoCents,
          }
        : null,
      percentDaFase: progresso.percentDaFase,
      posicaoNaTrilha: progresso.posicaoNaTrilha,
      marcos: comFaixas ? marcosDaTrilha(politica, pedidos) : [],
      faixas: paraTela(progresso.pedacos),
      totalCents: progresso.totalCents,
      noMaximo: progresso.noMaximo,
      cicloInicio: ciclo?.cycle_start ?? null,
      cicloFim: ciclo?.cycle_end ?? null,
      recorde: comFaixas ? await recordeDaLoja(db, companyId, politica) : null,
    };
  });

/**
 * O melhor ciclo já fechado da loja.
 *
 * É informação motivacional — nunca entra em cobrança. Sai dos ciclos que já
 * fecharam, e não do ciclo em andamento: enquanto o mês corre, o recorde
 * ficaria mudando a cada pedido e perderia a graça.
 */
async function recordeDaLoja(
  db: ReturnType<typeof asBillingDb>,
  companyId: string,
  politica: Parameters<typeof progressoCents>[0],
): Promise<{ pedidos: number; nivel: number } | null> {
  // A ponte de cobrança expõe um subconjunto do cliente do Supabase, sem
  // `limit`. Pegar todos os ciclos fechados e escolher o maior aqui é barato:
  // são poucos por loja, um por mês.
  const { data } = await db
    .from("billing_cycles")
    .select("billable_order_count")
    .eq("company_id", companyId)
    .eq("status", "closed");

  const fechados = (data ?? []) as Array<{ billable_order_count?: number }>;
  const pedidos = fechados.reduce(
    (maior, c) => Math.max(maior, Number(c.billable_order_count ?? 0)),
    0,
  );
  if (!Number.isSafeInteger(pedidos) || pedidos <= 0) return null;

  return { pedidos, nivel: progressoCents(politica, pedidos).faixaAtual.nivel };
}
