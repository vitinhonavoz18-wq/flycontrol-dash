import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireOwnerOrAdmin } from "@/integrations/supabase/adminGuard.server";
import { storeAddressInSF } from "@/integrations/sitecreatorfly/storeAddress.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

/**
 * Endereço da loja no cardápio online — campo "Endereço da loja" em Minha Loja.
 *
 * Corpo: { action: "check" | "set", address: string }
 *
 * A PORTARIA VEM PRIMEIRO
 *
 * Antes de perguntar qualquer coisa ao SiteCreatorFly, confere se quem chama
 * é o dono DESTA loja (ou administrador da plataforma). Sem isso, qualquer
 * pessoa logada trocaria o endereço da loja dos outros só mudando o número na
 * URL — é o garçom que confere se a comanda é mesmo daquela mesa antes de
 * fechar a conta.
 *
 * A loja é identificada lá do outro lado pelo id DESTA loja (o vínculo
 * `flycontrol_id` que o cadastro automático criou), lido aqui no banco — e
 * não por algo que o navegador mande.
 */
export const Route = createFileRoute("/api/pizzerias/$id/address")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),

      POST: async ({ request, params }) => {
        const id = String(params.id || "").trim();
        if (!id) return json({ success: false, error: "missing_id" }, 400);

        try {
          await requireOwnerOrAdmin(request, cors, id, supabaseAdmin as any);
        } catch (guardResponse) {
          if (guardResponse instanceof Response) return guardResponse;
          throw guardResponse;
        }

        let body: { action?: unknown; address?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ success: false, error: "invalid_json" }, 400);
        }
        const action = body?.action === "set" ? "set" : body?.action === "check" ? "check" : null;
        const address = typeof body?.address === "string" ? body.address.slice(0, 200) : "";
        if (!action) return json({ success: false, error: "invalid_action" }, 400);

        const { data: pz, error: pzErr } = await supabaseAdmin
          .from("pizzerias")
          .select("id, api_key")
          .eq("id", id)
          .maybeSingle();
        if (pzErr || !pz) return json({ success: false, error: "pizzeria_not_found" }, 404);

        const resposta = await storeAddressInSF({
          flycontrol_id: pz.id,
          api_key: (pz as { api_key?: string | null }).api_key ?? null,
          action,
          address,
        });

        if (!resposta.ok) {
          // 409 = alguém chegou primeiro; 422 = nome não permitido; 404 = a
          // loja ainda não está no ar lá; o resto é falha de comunicação.
          const status = [404, 409, 422].includes(resposta.httpStatus) ? resposta.httpStatus : 502;
          return json(
            {
              success: false,
              error: resposta.httpStatus === 404 ? "store_not_online" : resposta.error,
              status: resposta.status ?? null,
              address: resposta.address ?? null,
              suggestions: resposta.suggestions ?? [],
            },
            status,
          );
        }

        if (action === "set" && resposta.public_url) {
          // O link mostrado no painel (QR Code, "copiar link", lista do
          // administrador) passa a ser o novo. Se esta gravação falhar, o site
          // já está com o endereço novo e o antigo continua funcionando — só
          // o painel fica mostrando o link antigo até a próxima troca.
          const { error: updErr } = await supabaseAdmin
            .from("pizzerias")
            .update({ public_url: resposta.public_url } as never)
            .eq("id", id);
          if (updErr) console.error("[StoreAddress] public_url persist error:", updErr);
        }

        return json({
          success: true,
          status: resposta.status,
          address: resposta.address,
          suggestions: resposta.suggestions,
          public_url: resposta.public_url ?? null,
          previous_address: resposta.previous_address ?? null,
          changed: resposta.changed ?? false,
        });
      },
    },
  },
});
