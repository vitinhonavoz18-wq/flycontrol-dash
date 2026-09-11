import { createFileRoute } from "@tanstack/react-router";
import { conferirChaveMestra, respostaNegadaCrm } from "@/lib/crm/n8nAuth";
import { autenticarLoja } from "@/lib/crm/n8nTenant";
import { crm } from "@/lib/crm/db";

/**
 * O "estou vivo" do fluxo de cada loja.
 *
 * POR QUE EXISTE UM ENDEREÇO SÓ PARA ISSO
 *
 * Uma loja pode passar a manhã inteira sem nenhuma mensagem entrando ou
 * saindo — e isso é normal num dia parado. Sem um sinal de vida próprio, o
 * sistema não conseguiria distinguir "hoje ninguém escreveu" de "o WhatsApp
 * caiu às 7 da manhã". São coisas muito diferentes para quem depende do
 * atendimento.
 *
 * Basta o fluxo do n8n chamar este endereço de tempos em tempos (a cada 5 ou
 * 10 minutos). É o vigia batendo o ponto de hora em hora: enquanto ele bate,
 * está tudo bem.
 *
 *   Método:    POST
 *   URL:       https://<seu-dominio>/api/crm/ping
 *   Cabeçalho: Authorization: Bearer <CRM_N8N_SECRET>
 *   Corpo:     { "tenant_id": "...", "token": "...", "error": "(opcional)" }
 */

const cabecalhos = { "Content-Type": "application/json" };

export const Route = createFileRoute("/api/crm/ping")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mestra = conferirChaveMestra(request);
        if (!mestra.ok) return respostaNegadaCrm(mestra);

        let corpo: Record<string, unknown>;
        try {
          corpo = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response(JSON.stringify({ success: false, error: "corpo_invalido" }), {
            status: 400,
            headers: cabecalhos,
          });
        }

        const loja = await autenticarLoja(corpo);
        if (!loja.ok) return respostaNegadaCrm(loja);

        // O fluxo pode aproveitar a batida de ponto para contar um problema
        // que ele mesmo detectou ("o aparelho desconectou"). Isso aparece na
        // tarja da tela do lojista.
        const erro = corpo.error ? String(corpo.error).slice(0, 500) : null;

        await crm("crm_n8n_links")
          .update({
            last_seen_at: new Date().toISOString(),
            last_error: erro,
            updated_at: new Date().toISOString(),
          })
          .eq("tenant_id", loja.tenantId);

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: cabecalhos,
        });
      },
    },
  },
});
