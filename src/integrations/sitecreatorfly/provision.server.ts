// Server-only helper to (re)provision a restaurant in SiteCreatorFly.
// Idempotent: SF endpoint keys on `flycontrol_id`; repeated calls update.

export type ProvisionPayload = {
  flycontrol_id: string;
  name: string;
  slug: string;
  owner_name: string;
  business_type: string;
  selected_template: string;
  api_key: string;
};

export type ProvisionResult =
  | {
      ok: true;
      sf_restaurant_id?: string;
      menu_sync_token?: string;
      public_url?: string;
      sync_endpoint?: string;
      already_existed?: boolean;
    }
  | { ok: false; error: string };

export async function provisionRestaurantInSF(payload: ProvisionPayload): Promise<ProvisionResult> {
  const base = (process.env.SITECREATORFLY_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) {
    console.error("[Provision] SITECREATORFLY_BASE_URL not configured");
    return { ok: false, error: "missing_sf_base_url" };
  }
  const url = `${base}/api/internal/provision-restaurant`;
  const internalToken = (process.env.SITECREATORFLY_INTERNAL_TOKEN || "").trim();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": payload.api_key,
  };
  if (internalToken) headers["Authorization"] = `Bearer ${internalToken}`;

  // O SiteCreatorFly precisa saber para onde mandar os pedidos de volta — é
  // o "endereço de entrega" que ele grava como flycontrol_base_url. Sem
  // isso, a loja é criada normalmente mas todo pedido falha com
  // "Configuração incompleta no painel", porque não existe endereço
  // nenhum salvo para enviar o pedido. Vem daqui, não de quem chama, para
  // não precisar repetir essa configuração em cada lugar que provisiona.
  const flycontrolBaseUrl = (process.env.FLYCONTROL_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  const outgoingPayload: ProvisionPayload & { flycontrol_base_url?: string } = flycontrolBaseUrl
    ? { ...payload, flycontrol_base_url: flycontrolBaseUrl }
    : payload;
  if (!flycontrolBaseUrl) {
    console.warn(
      "[Provision] FLYCONTROL_PUBLIC_URL not configured — a loja será criada, mas pedidos vão falhar até isso ser preenchido.",
    );
  }

  console.log(
    "[Provision] POST",
    url,
    "flycontrol_id:",
    payload.flycontrol_id,
    "slug:",
    payload.slug,
  );

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(outgoingPayload),
      // Quem chama está no meio de um cadastro e espera a resposta. Sem teto,
      // o outro sistema lento faria o cliente olhar para uma tela travada. A
      // repescagem cobre o que estourar o prazo.
      signal: AbortSignal.timeout(20_000),
    });
    const text = await resp.text();
    console.log("[Provision] status:", resp.status, "body:", text.slice(0, 500));
    if (!resp.ok) {
      return { ok: false, error: `sf_http_${resp.status}: ${text.slice(0, 200)}` };
    }
    // Resposta do outro sistema: campos opcionais e nomes que já variaram
    // entre versões. Tipar como desconhecido e ler com `?.` é mais honesto do
    // que fingir um contrato fixo.
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      return { ok: false, error: "sf_invalid_json_response" };
    }
    /** Lê o primeiro campo presente que seja texto. */
    const texto = (...chaves: string[]): string | undefined => {
      for (const chave of chaves) {
        const valor = parsed?.[chave];
        if (typeof valor === "string" && valor.trim()) return valor;
      }
      return undefined;
    };

    return {
      ok: true,
      sf_restaurant_id: texto("sf_restaurant_id", "restaurant_id", "id"),
      menu_sync_token: texto("menu_sync_token", "token"),
      public_url: texto("public_url", "url"),
      sync_endpoint: texto("sync_endpoint"),
      // O SiteCreatorFly responde `already_exists`. As outras grafias ficam
      // por compatibilidade com versões publicadas antes desta correção — o
      // valor errado aqui não quebra nada, mas confunde o log de auditoria.
      already_existed: !!(parsed?.already_exists ?? parsed?.already_existed ?? parsed?.existed),
    };
  } catch (err) {
    console.error("[Provision] fetch error:", err);
    return { ok: false, error: err instanceof Error ? err.message : "network_error" };
  }
}

export type DeprovisionAction = "deactivate" | "reactivate" | "delete";
export type DeprovisionResult =
  { ok: true; alreadyAbsent?: boolean } | { ok: false; error: string };

/**
 * Avisa o SiteCreatorFly que uma loja foi descadastrada, reativada ou
 * excluída definitivamente no FlyControl, para o cardápio público refletir
 * isso na hora (em vez de continuar no ar como se nada tivesse acontecido).
 * "delete" também invalida a chave de API daquela loja no SiteCreatorFly.
 */
export async function deprovisionRestaurantInSF(
  flycontrol_id: string,
  action: DeprovisionAction,
): Promise<DeprovisionResult> {
  const base = (process.env.SITECREATORFLY_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) {
    console.error("[Deprovision] SITECREATORFLY_BASE_URL not configured");
    return { ok: false, error: "missing_sf_base_url" };
  }
  const url = `${base}/api/internal/deprovision-restaurant`;
  const internalToken = (process.env.SITECREATORFLY_INTERNAL_TOKEN || "").trim();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (internalToken) headers["Authorization"] = `Bearer ${internalToken}`;

  console.log("[Deprovision] POST", url, "flycontrol_id:", flycontrol_id, "action:", action);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ flycontrol_id, action }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await resp.text();
    console.log("[Deprovision] status:", resp.status, "body:", text.slice(0, 300));
    if (!resp.ok) {
      return { ok: false, error: `sf_http_${resp.status}: ${text.slice(0, 200)}` };
    }
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      return { ok: false, error: "sf_invalid_json_response" };
    }
    if (!parsed?.success) {
      return { ok: false, error: String(parsed?.error ?? "sf_deprovision_failed") };
    }
    return { ok: true, alreadyAbsent: !!parsed.already_absent };
  } catch (err) {
    console.error("[Deprovision] fetch error:", err);
    return { ok: false, error: err instanceof Error ? err.message : "network_error" };
  }
}
