import { createFileRoute } from "@tanstack/react-router";
import { conferirChaveMestra, respostaNegadaCrm } from "@/lib/crm/n8nAuth";
import { autenticarLoja } from "@/lib/crm/n8nTenant";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { montarCatalogo } from "@/lib/crm/catalogo";

/**
 * O cardápio da loja, do jeito que uma IA consegue ler.
 *
 * POR QUE ISTO EXISTE
 *
 * Uma atendente automática que não sabe o cardápio é pior do que nenhuma. Ela
 * inventa prato que não existe, promete preço errado e oferece o que acabou no
 * estoque — e quem paga o pato é o restaurante, que precisa desdizer o próprio
 * atendimento na frente do cliente.
 *
 * Este endereço devolve, para UMA loja, o que ela vende AGORA: categorias,
 * produtos, preços, tamanhos de pizza, combos no ar e adicionais. E marca o
 * que está indisponível — inclusive por falta de ingrediente no estoque.
 *
 * Vem em dois formatos de propósito:
 *
 *   `cardapio` (estruturado)  → para o fluxo fazer contas ou filtros
 *   `texto` (pronto para ler) → para colar direto no prompt da IA
 *
 * O `texto` existe porque pedir para um modelo de linguagem interpretar JSON
 * cru gasta mais e erra mais do que entregar a lista já escrita em português.
 *
 * PARA CONFIGURAR NO N8N
 *
 *   Método:    POST
 *   URL:       https://<seu-dominio>/api/crm/catalog
 *   Cabeçalho: Authorization: Bearer <CRM_N8N_SECRET>
 *   Corpo:     { "tenant_id": "...", "token": "..." }
 */

const cabecalhos = { "Content-Type": "application/json" };

export const Route = createFileRoute("/api/crm/catalog")({
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

        try {
          const catalogo = await montarCatalogo(supabaseAdmin, loja.tenantId);
          return new Response(JSON.stringify({ success: true, ...catalogo }), {
            status: 200,
            headers: cabecalhos,
          });
        } catch (e) {
          console.error("[crm/catalog] falha ao montar o cardápio:", e);
          return new Response(JSON.stringify({ success: false, error: "erro_interno" }), {
            status: 500,
            headers: cabecalhos,
          });
        }
      },
    },
  },
});
