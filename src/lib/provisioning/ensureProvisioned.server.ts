/**
 * Provisionamento automático do cardápio no SiteCreatorFly. Servidor apenas.
 *
 * Este é o ÚNICO ponto de entrada. Todo caminho que conclui o onboarding
 * chama daqui — retorno do checkout, ativação pelo painel administrativo,
 * atalho de teste e a rotina de repescagem. Ter um só lugar é o que mantém a
 * regra de idempotência em um lugar só.
 *
 * Reutiliza o mecanismo que já existia: `provisionRestaurantInSF`, que fala
 * com POST /api/internal/provision-restaurant. Nada aqui cria tenant, site ou
 * cardápio por conta própria — isso é responsabilidade do SiteCreatorFly, que
 * já é multi-tenant.
 *
 * NUNCA lança. O cadastro do cliente não pode falhar porque o outro sistema
 * está fora do ar: o estabelecimento fica marcado como `failed` e a
 * repescagem tenta de novo.
 */

import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { provisionRestaurantInSF } from "@/integrations/sitecreatorfly/provision.server";
import {
  PROVISION_DONE,
  PROVISION_FAILED,
  PROVISION_PENDING,
  decideProvisioning,
  describeSubject,
} from "./provisioning";

/**
 * Endereço público deste FlyControl, para a loja saber para onde mandar pedido.
 *
 * Descoberto a partir da própria requisição em andamento — assim nasce certo
 * em qualquer ambiente, sem mais uma variável para alguém esquecer de
 * preencher. `FLYCONTROL_PUBLIC_URL` existe só como saída manual para o caso
 * de a origem da requisição não ser a pública (proxy à frente, por exemplo).
 */
function resolveOwnBaseUrl(): string | undefined {
  const configured = (process.env.FLYCONTROL_PUBLIC_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");

  try {
    const request = getRequest();
    if (request?.url) return new URL(request.url).origin;
  } catch {
    // Fora de um contexto de requisição (rotina agendada, por exemplo). O
    // SiteCreatorFly mantém o endereço que já tiver gravado.
  }
  return undefined;
}

export type EnsureResult =
  | { ok: true; skipped: true; reason: "already_provisioned"; publicUrl: string | null }
  | { ok: true; skipped: false; alreadyExisted: boolean; publicUrl: string | null }
  | { ok: false; error: string };

type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  api_key: string;
  owner_id: string | null;
  sf_restaurant_id: string | null;
  public_url: string | null;
  sync_endpoint: string | null;
  provision_status: string | null;
};

/**
 * Garante que o estabelecimento tenha tenant, cardápio e URL no
 * SiteCreatorFly. Seguro chamar quantas vezes for.
 */
export async function ensureRestaurantProvisioned(companyId: string): Promise<EnsureResult> {
  const id = String(companyId || "").trim();
  if (!id) return { ok: false, error: "missing_company_id" };

  const { data, error } = await supabaseAdmin
    .from("pizzerias")
    .select(
      "id, name, slug, api_key, owner_id, sf_restaurant_id, public_url, sync_endpoint, provision_status",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    console.error("[provisionamento] estabelecimento não encontrado:", id, error);
    return { ok: false, error: "company_not_found" };
  }

  const company = data as CompanyRow;
  const label = describeSubject(company.id, company.name);

  const decision = decideProvisioning(company);
  if (decision.action === "skip") {
    console.log(`[provisionamento] ${label}: já provisionado, nada a fazer.`);
    return {
      ok: true,
      skipped: true,
      reason: "already_provisioned",
      publicUrl: company.public_url,
    };
  }

  console.log(`[provisionamento] ${label}: iniciando (motivo: ${decision.reason}).`);

  await supabaseAdmin
    .from("pizzerias")
    .update({ provision_status: PROVISION_PENDING, provision_error: null })
    .eq("id", company.id);

  // Nome do responsável enriquece o registro no outro lado. É opcional: falha
  // aqui não pode impedir o provisionamento.
  let ownerName = "";
  if (company.owner_id) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", company.owner_id)
      .maybeSingle();
    ownerName = String((profile as { full_name?: string } | null)?.full_name ?? "");
  }

  const provision = await provisionRestaurantInSF({
    // O vínculo é sempre o id do estabelecimento. Nome, slug e telefone mudam;
    // o id, não.
    flycontrol_id: company.id,
    name: company.name,
    slug: company.slug,
    owner_name: ownerName,
    business_type: "pizzeria",
    selected_template: "default",
    api_key: company.api_key,
    flycontrol_base_url: resolveOwnBaseUrl(),
  });

  if (!provision.ok) {
    console.error(`[provisionamento] ${label}: FALHOU — ${provision.error}`);
    await supabaseAdmin
      .from("pizzerias")
      .update({ provision_status: PROVISION_FAILED, provision_error: provision.error })
      .eq("id", company.id);
    return { ok: false, error: provision.error };
  }

  // Só grava o que o outro lado devolveu. Campo ausente não apaga o que já
  // estava salvo — uma resposta parcial não pode piorar o estado atual.
  const update: {
    provision_status: string;
    provision_error: string | null;
    provisioned_at: string;
    sf_restaurant_id?: string;
    menu_sync_token?: string;
    public_url?: string;
    sync_endpoint?: string;
  } = {
    provision_status: PROVISION_DONE,
    provision_error: null,
    provisioned_at: new Date().toISOString(),
  };
  if (provision.sf_restaurant_id) update.sf_restaurant_id = provision.sf_restaurant_id;
  if (provision.menu_sync_token) update.menu_sync_token = provision.menu_sync_token;
  if (provision.public_url) update.public_url = provision.public_url;
  // Endereço de sincronização vem pronto do SiteCreatorFly. É o que antes o
  // cliente tinha de colar à mão no painel.
  if (provision.sync_endpoint) update.sync_endpoint = provision.sync_endpoint;

  const { error: persistError } = await supabaseAdmin
    .from("pizzerias")
    .update(update)
    .eq("id", company.id);

  if (persistError) {
    // O tenant existe do outro lado, mas o vínculo não ficou gravado aqui.
    // Marcar como falha é o certo: a repescagem chama de novo, o
    // SiteCreatorFly devolve o mesmo tenant e a gravação é refeita.
    console.error(`[provisionamento] ${label}: erro ao gravar vínculo`, persistError);
    await supabaseAdmin
      .from("pizzerias")
      .update({ provision_status: PROVISION_FAILED, provision_error: "persist_failed" })
      .eq("id", company.id);
    return { ok: false, error: "persist_failed" };
  }

  console.log(
    `[provisionamento] ${label}: CONCLUÍDO`,
    `tenant: ${provision.sf_restaurant_id ?? "(mantido)"}`,
    `reaproveitado: ${provision.already_existed}`,
    `url: ${provision.public_url ?? "(mantida)"}`,
  );

  return {
    ok: true,
    skipped: false,
    alreadyExisted: !!provision.already_existed,
    publicUrl: provision.public_url ?? company.public_url,
  };
}

/**
 * Provisiona e espera terminar, sem deixar erro vazar para quem chamou.
 *
 * NÃO troque por "dispara e esquece" (`void promise`). Nos Cloudflare Workers
 * o isolamento é encerrado assim que a resposta é enviada, e qualquer promessa
 * ainda pendente é descartada no meio — foi exatamente o que aconteceu na
 * primeira versão: o cadastro terminava, o provisionamento morria antes da
 * primeira gravação, e o estabelecimento ficava com tudo nulo, sem sequer uma
 * falha registrada.
 *
 * O jeito certo de não bloquear seria `ctx.waitUntil`, que não está disponível
 * aqui. Então esperamos mesmo — a chamada é uma só, tem prazo máximo de 20s, e
 * nunca lança.
 */
export async function provisionAndForget(companyId: string): Promise<void> {
  try {
    await ensureRestaurantProvisioned(companyId);
  } catch (err) {
    console.error("[provisionamento] erro não tratado:", companyId, err);
  }
}
