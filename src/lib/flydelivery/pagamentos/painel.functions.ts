/**
 * Ações dos painéis que precisam do servidor.
 *
 * Quase tudo nos painéis financeiros fala direto com o banco, e o próprio
 * banco confere quem pede (dono da loja ou administrador) — ver as funções
 * `flydelivery_store_*` e `flydelivery_admin_*` na migração. Aqui ficam só as
 * ações que precisam de algo que mora no servidor:
 *
 *   - salvar a conta recebedora: compara com a conta da PLATAFORMA (que só o
 *     servidor conhece) para ninguém cadastrar a conta do FlyDelivery como se
 *     fosse a da loja;
 *   - situação da integração: diz QUAIS configurações faltam (nunca os valores);
 *   - reconferir/conciliar agora: fala com a SyncPay.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { lerConfigDoPix, pendenciasDeConfiguracao } from "./config.server";
import { bancoDoPix, dependenciasReais } from "./banco.server";
import { conciliarPendentes, reconferir } from "./pix.server";
import { semTipos } from "./ponte";

async function exigirAdmin(supabase: unknown): Promise<void> {
  const { data, error } = await semTipos(supabase).rpc("is_admin");
  if (error || data !== true) throw new Error("Apenas administradores da plataforma.");
}

const FORMATO_DO_ID = /^[A-Za-z0-9._:-]{6,128}$/;

export const salvarContaRecebedora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string; syncpayUserId: string }) => {
    if (!d?.storeId) throw new Error("Loja não informada.");
    const id = String(d.syncpayUserId ?? "").trim();
    if (id && !FORMATO_DO_ID.test(id)) {
      throw new Error(
        "O Client ID tem formato inválido. Copie exatamente como aparece no painel da SyncPay.",
      );
    }
    return { storeId: d.storeId, syncpayUserId: id };
  })
  .handler(async ({ data, context }) => {
    const config = lerConfigDoPix();
    if (
      data.syncpayUserId &&
      config.clientId &&
      data.syncpayUserId.toLowerCase() === config.clientId.toLowerCase()
    ) {
      throw new Error(
        "Este é o Client ID da conta do FlyDelivery, não o da sua loja. Informe o da SUA conta SyncPay.",
      );
    }

    // Chamado COMO o usuário: o banco confere se ele é dono da loja.
    const { data: conta, error } = await semTipos(context.supabase).rpc(
      "flydelivery_store_set_recipient",
      { p_store_id: data.storeId, p_syncpay_user_id: data.syncpayUserId || null },
    );
    if (error) {
      if (String(error.message).includes("recebedor_em_uso")) {
        throw new Error("Esta conta SyncPay já está ligada a outro estabelecimento.");
      }
      if (error.code === "42501") throw new Error("Você não tem permissão para alterar esta loja.");
      throw new Error("Não foi possível salvar a conta. Tente de novo.");
    }
    const salvo = (conta ?? {}) as { status?: string; syncpay_user_id?: string | null };
    return { status: String(salvo.status ?? ""), syncpayUserId: salvo.syncpay_user_id ?? null };
  });

export const situacaoDaIntegracaoPix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context.supabase);
    const config = lerConfigDoPix();
    return {
      ligado: config.ligado,
      faltando: pendenciasDeConfiguracao(config),
      urlDoAviso: config.urlDoAviso,
      conciliacaoAutomatica: !!config.segredoDaConciliacao,
    };
  });

export const reconferirPagamentoAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { paymentId: string }) => {
    if (!d?.paymentId) throw new Error("Pagamento não informado.");
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase);
    const pagamento = await bancoDoPix.pagamentoPorId(data.paymentId);
    if (!pagamento) throw new Error("Pagamento não encontrado.");
    if (!pagamento.provider_reference) {
      return { resultado: "sem_referencia" as const };
    }
    return reconferir(pagamento, dependenciasReais());
  });

export const conciliarPixAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context.supabase);
    const deps = dependenciasReais();
    if (!deps.config.clientId || !deps.config.clientSecret) {
      throw new Error("A SyncPay ainda não está configurada no servidor.");
    }
    return conciliarPendentes(deps);
  });
