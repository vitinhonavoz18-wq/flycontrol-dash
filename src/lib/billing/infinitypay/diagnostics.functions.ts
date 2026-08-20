/**
 * Diagnóstico da integração automática com a InfinityPay. Servidor apenas.
 *
 * Existe para responder, com um clique no painel, a pergunta "por que o
 * cadastro não está ativando sozinho?" — sem precisar ler log de servidor,
 * que quem administra esta conta não tem como abrir.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { asBillingDb, type BillingDb } from "@/lib/billing/supabaseBridge";
import { checkInfinityPayPayment, infinityPayHandle } from "./api";

async function assertGlobalAdmin(supabase: BillingDb): Promise<void> {
  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error) throw new Error("Não foi possível verificar suas permissões.");
  if (!isAdmin) throw new Error("Esta ação é restrita a administradores da plataforma.");
}

export type InfinityPayDiagnostics = {
  handleConfigured: boolean;
  handlePreview: string | null;
  publicUrlConfigured: boolean;
  publicUrl: string | null;
  webhookUrl: string | null;
  connectionTest: { ok: true; detail: string } | { ok: false; detail: string } | null;
};

/** Mostra só o começo e o fim — o suficiente pra reconhecer sem expor tudo. */
function maskHandle(handle: string): string {
  if (handle.length <= 6) return handle;
  return `${handle.slice(0, 3)}…${handle.slice(-3)}`;
}

export const getInfinityPayDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InfinityPayDiagnostics> => {
    await assertGlobalAdmin(asBillingDb(context.supabase));

    const handle = infinityPayHandle();
    const publicUrl = (process.env.FLYCONTROL_PUBLIC_URL || "").trim().replace(/\/+$/, "") || null;

    let connectionTest: InfinityPayDiagnostics["connectionTest"] = null;

    if (handle) {
      // Pergunta pela situação de um pedido que não existe. A InfinityPay
      // responde diferente conforme o motivo: 404 quando não reconhece a
      // InfiniteTag, "sucesso:false" comum quando reconhece a tag mas não
      // acha o pedido (o esperado aqui, já que o pedido é inventado). É essa
      // diferença que revela se a tag configurada é válida.
      const result = await checkInfinityPayPayment({
        orderNsu: `diagnostico-${Date.now()}`,
      });

      if (result.ok) {
        connectionTest = {
          ok: true,
          detail: "A InfinityPay respondeu normalmente à sua InfiniteTag.",
        };
      } else if (result.error === "infinitypay_check_failed") {
        connectionTest = {
          ok: true,
          detail: "A InfinityPay reconhece sua InfiniteTag e respondeu normalmente.",
        };
      } else if (result.error.startsWith("infinitypay_http_404")) {
        connectionTest = {
          ok: false,
          detail:
            'A InfinityPay respondeu "não encontrada" para esta InfiniteTag. Confira se o valor ' +
            "colado em INFINITYPAY_HANDLE é exatamente igual ao que aparece no app da InfinityPay " +
            '(sem o "$" na frente).',
        };
      } else {
        connectionTest = { ok: false, detail: result.error };
      }
    }

    return {
      handleConfigured: !!handle,
      handlePreview: handle ? maskHandle(handle) : null,
      publicUrlConfigured: !!publicUrl,
      publicUrl,
      webhookUrl: publicUrl ? `${publicUrl}/api/webhooks/infinitypay` : null,
      connectionTest,
    };
  });
