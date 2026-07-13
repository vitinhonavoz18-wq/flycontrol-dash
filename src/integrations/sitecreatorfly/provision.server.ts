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

  console.log("[Provision] POST", url, "flycontrol_id:", payload.flycontrol_id, "slug:", payload.slug);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    console.log("[Provision] status:", resp.status, "body:", text.slice(0, 500));
    if (!resp.ok) {
      return { ok: false, error: `sf_http_${resp.status}: ${text.slice(0, 200)}` };
    }
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch {
      return { ok: false, error: "sf_invalid_json_response" };
    }
    return {
      ok: true,
      sf_restaurant_id: parsed?.sf_restaurant_id ?? parsed?.restaurant_id ?? parsed?.id,
      menu_sync_token: parsed?.menu_sync_token ?? parsed?.token,
      public_url: parsed?.public_url ?? parsed?.url,
      sync_endpoint: parsed?.sync_endpoint,
      already_existed: !!(parsed?.already_existed ?? parsed?.existed),
    };
  } catch (err: any) {
    console.error("[Provision] fetch error:", err);
    return { ok: false, error: err?.message || "network_error" };
  }
}
