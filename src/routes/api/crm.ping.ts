import { createFileRoute } from "@tanstack/react-router";
import { conferirChaveMestra, respostaNegadaCrm } from "@/lib/crm/n8nAuth";
import { autenticarLoja } from "@/lib/crm/n8nTenant";
import { crm } from "@/lib/crm/db";

/**
 * O "estou vivo" do fluxo de cada loja.
 *
 * ELE É OPCIONAL. A busca da fila (/api/crm/outbox) já conta como sinal de
 * vida: quem passa de minuto em minuto perguntando "tem algo para levar?" já
 * provou que está de pé. Um pedaço a menos para montar em cada loja é um
 * pedaço a menos para alguém esquecer de montar.
 *
 * Este endereço continua existindo para o caso em que o fluxo detecta um
 * problema POR CONTA PRÓPRIA e quer contar ("o aparelho desconectou"). Esse
 * texto aparece na tarja de aviso da tela do lojista, que é bem mais útil do
 * que um silêncio.
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
