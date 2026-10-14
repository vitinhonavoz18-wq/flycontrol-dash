// Consulta e troca do endereço público da loja no SiteCreatorFly
// (conectfly.com.br/<endereço>). Só roda no servidor: usa a senha de servidor
// SITECREATORFLY_INTERNAL_TOKEN, a mesma do cadastro automático.
//
// Quem confere se o usuário logado é dono da loja é a rota que chama esta
// função (`/api/pizzerias/$id/address`), ANTES de chamar.

export type StoreAddressAction = "check" | "set";

export type StoreAddressResponse =
  | {
      ok: true;
      httpStatus: number;
      status: string;
      address: string;
      suggestions: string[];
      public_url?: string;
      previous_address?: string | null;
      changed?: boolean;
    }
  | {
      ok: false;
      httpStatus: number;
      error: string;
      status?: string;
      address?: string;
      suggestions?: string[];
    };

export async function storeAddressInSF(params: {
  flycontrol_id: string;
  api_key?: string | null;
  action: StoreAddressAction;
  address: string;
}): Promise<StoreAddressResponse> {
  const base = (process.env.SITECREATORFLY_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) {
    console.error("[StoreAddress] SITECREATORFLY_BASE_URL not configured");
    return { ok: false, httpStatus: 503, error: "missing_sf_base_url" };
  }
  const internalToken = (process.env.SITECREATORFLY_INTERNAL_TOKEN || "").trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (internalToken) headers["Authorization"] = `Bearer ${internalToken}`;

  try {
    const resp = await fetch(`${base}/api/internal/store-address`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        flycontrol_id: params.flycontrol_id,
        // Lojas ligadas antes do vínculo automático só são achadas lá pela
        // chave de API.
        api_key: params.api_key || undefined,
        action: params.action,
        address: params.address,
      }),
      // A tela está esperando: sem teto, um SiteCreatorFly lento travaria o
      // campo. 10 s bastam para uma consulta curta.
      signal: AbortSignal.timeout(10_000),
    });
    const text = await resp.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      return { ok: false, httpStatus: 502, error: "sf_invalid_json_response" };
    }
    const sugestoes = Array.isArray(parsed?.suggestions)
      ? (parsed!.suggestions as unknown[]).filter((s): s is string => typeof s === "string")
      : [];

    if (!resp.ok || !parsed?.success) {
      return {
        ok: false,
        httpStatus: resp.status,
        error: String(parsed?.error ?? `sf_http_${resp.status}`),
        status: typeof parsed?.status === "string" ? parsed.status : undefined,
        address: typeof parsed?.address === "string" ? parsed.address : undefined,
        suggestions: sugestoes,
      };
    }
    return {
      ok: true,
      httpStatus: resp.status,
      status: String(parsed.status ?? ""),
      address: String(parsed.address ?? ""),
      suggestions: sugestoes,
      public_url: typeof parsed.public_url === "string" ? parsed.public_url : undefined,
      previous_address:
        typeof parsed.previous_address === "string" ? parsed.previous_address : null,
      changed: parsed.changed === true,
    };
  } catch (err) {
    console.error("[StoreAddress] fetch error:", err);
    return {
      ok: false,
      httpStatus: 502,
      error: err instanceof Error ? err.message : "network_error",
    };
  }
}
