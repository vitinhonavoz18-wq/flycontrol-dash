import { toast } from "sonner";

type MenuType = 'category' | 'product' | 'beverage' | 'border' | 'additional' | 'combo' | 'pizza_size' | 'restaurant';

interface SyncParams {
  type: string;
  action: 'create' | 'update' | 'delete' | 'status';
  id?: string;
  externalId?: string;
  data?: any;
  pizzeriaSlug: string;
  pizzeriaApiKey: string;
  syncEndpoint?: string;
}

type Protocol = 'rest' | 'legacy';

// Map FlyControl resource type → REST URL segment.
// SiteCreatorFly REST routes use kebab-case (e.g. /pizza-size).
const REST_RESOURCE_PATH: Record<MenuType, string> = {
  product: 'product',
  category: 'category',
  beverage: 'beverage',
  border: 'border',
  additional: 'additional',
  combo: 'combo',
  pizza_size: 'pizza-size',
  restaurant: 'restaurant',
};

/**
 * Detect which synchronization protocol the configured endpoint supports.
 * REST: any URL whose path ends with /api/menu-sync (optionally with trailing slash).
 * Legacy: anything else (old Supabase Function, old /api/public/pizzarias/.../menu-sync, etc.).
 */
function detectProtocol(endpoint: string): Protocol {
  try {
    const u = new URL(endpoint);
    const pathname = u.pathname.replace(/\/+$/, '');
    // REST: explicit /api/menu-sync, or any public read-only endpoint
    // (/api/public/menu-sync/{slug}/{token}) — writes will be redirected
    // to the authenticated REST base derived from the same origin.
    if (/\/api\/menu-sync$/i.test(pathname)) return 'rest';
    if (/\/api\/public\/menu-sync(\/|$)/i.test(pathname)) return 'rest';
    return 'legacy';
  } catch {
    return 'legacy';
  }
}

/**
 * Derive the authenticated REST base URL (…/api/menu-sync) from any
 * configured endpoint. Public read-only URLs
 * (…/api/public/menu-sync/{slug}/{token}) are automatically rewritten so
 * writes never hit the read-only SPA shell.
 */
function deriveRestBase(endpoint: string): string {
  try {
    const u = new URL(endpoint);
    let pathname = u.pathname.replace(/\/+$/, '');
    const publicMatch = pathname.match(/^(.*)\/api\/public\/menu-sync(?:\/.*)?$/i);
    if (publicMatch) {
      pathname = `${publicMatch[1]}/api/menu-sync`;
    } else if (!/\/api\/menu-sync$/i.test(pathname)) {
      // Fall back to appending /api/menu-sync at the origin.
      pathname = `${pathname}`.replace(/\/api\/menu-sync\/.*$/i, '/api/menu-sync');
      if (!/\/api\/menu-sync$/i.test(pathname)) {
        pathname = '/api/menu-sync';
      }
    }
    return `${u.origin}${pathname}`;
  } catch {
    return endpoint.replace(/\/+$/, '');
  }
}

function mapExternalType(type: string, data?: any): MenuType {
  if (type === 'category') return 'category';
  if (type === 'beverage') return 'beverage';
  if (type === 'combo') return 'combo';
  if (type === 'pizza_size') return 'pizza_size';
  if (type === 'restaurant') return 'restaurant';
  if (type === 'additional' || type === 'adicional') return 'additional';
  if (type === 'extra' || type === 'border' || type === 'borda') {
    if (type === 'extra' && data?.extra_type) {
      return data.extra_type === 'borda' ? 'border' : 'additional';
    }
    return 'border';
  }
  // standard | product | flavor | unknown
  return 'product';
}

export async function syncToExternal(params: SyncParams): Promise<{ success: boolean; externalId?: string; error?: string }> {
  const { type, action, externalId, data, pizzeriaSlug, pizzeriaApiKey, syncEndpoint } = params;

  const externalType = mapExternalType(type, data);

  const rawEndpoint = (syncEndpoint || '').trim();

  // Endpoint validation — no fallback to obsolete Supabase Function.
  if (!rawEndpoint) {
    console.error('[SyncExternal] Missing SiteCreatorFly sync endpoint.');
    return { success: false, error: 'Missing SiteCreatorFly sync endpoint.' };
  }

  const protocol = detectProtocol(rawEndpoint);

  console.log(`--- [SyncExternal] Início da Ação: ${action} ---`);
  console.log('Protocolo selecionado:', protocol);
  console.log('Endpoint base:', rawEndpoint);
  console.log('Tipo do item:', externalType);
  console.log('Ação:', action);
  console.log('Slug usado:', pizzeriaSlug);
  console.log('ID/External ID usado:', externalId);
  console.log(
    'Headers: { Content-Type: application/json, x-api-key: ' +
      (pizzeriaApiKey
        ? `${pizzeriaApiKey.substring(0, 4)}...${pizzeriaApiKey.substring(pizzeriaApiKey.length - 4)}`
        : 'missing') +
      ', Authorization: Bearer <api_key> }'
  );

  // Dual auth headers throughout migration period.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': pizzeriaApiKey,
    Authorization: `Bearer ${pizzeriaApiKey}`,
  };

  try {
    let url: string;
    let method: string;
    let bodyObj: any | undefined;

    if (protocol === 'rest') {
      const resourcePath = REST_RESOURCE_PATH[externalType] ?? externalType;
      const base = rawEndpoint.replace(/\/+$/, '');

      if (action === 'create') {
        url = `${base}/${resourcePath}`;
        method = 'POST';
        bodyObj = prepareDataForExternal(externalType, data);
      } else if (action === 'update') {
        if (!externalId) {
          console.error('[SyncExternal] REST update requer externalId.');
          return { success: false, error: 'missing_external_id' };
        }
        url = `${base}/${resourcePath}/${encodeURIComponent(externalId)}`;
        method = 'PUT';
        bodyObj = prepareDataForExternal(externalType, data);
      } else if (action === 'status') {
        if (!externalId) {
          console.error('[SyncExternal] REST status requer externalId.');
          return { success: false, error: 'missing_external_id' };
        }
        url = `${base}/${resourcePath}/${encodeURIComponent(externalId)}`;
        method = 'PATCH';
        bodyObj = { active: data?.value };
      } else {
        // delete
        if (!externalId) {
          console.error('[SyncExternal] REST delete requer externalId.');
          return { success: false, error: 'missing_external_id' };
        }
        url = `${base}/${resourcePath}/${encodeURIComponent(externalId)}`;
        method = 'DELETE';
        bodyObj = undefined;
      }
    } else {
      // ============ LEGACY (unchanged behavior) ============
      url = rawEndpoint;
      method = 'POST';
      const legacyBody: any = {
        action,
        type: externalType,
        slug: pizzeriaSlug,
      };
      if (externalId) legacyBody.id = externalId;
      if (action === 'status') {
        legacyBody.active = data?.value;
      } else if (action === 'create' || action === 'update') {
        legacyBody.data = prepareDataForExternal(externalType, data);
      }
      bodyObj = legacyBody;
    }

    console.log('URL final:', url);
    console.log('Método HTTP:', method);
    console.log('Payload enviado:', bodyObj ? JSON.stringify(bodyObj, null, 2) : '<no body>');

    const init: RequestInit = { method, headers };
    if (bodyObj !== undefined) init.body = JSON.stringify(bodyObj);

    const response = await fetch(url, init);
    console.log('Status HTTP recebido:', response.status);

    if (response.status === 404) {
      console.error('[SyncExternal] 404 - Endpoint não encontrado');
      return { success: false, error: '404' };
    }
    if (response.status === 401 || response.status === 403) {
      console.error('[SyncExternal] 401/403 - Autorização negada');
      return { success: false, error: 'auth_error' };
    }

    // 204 No Content — common for DELETE/PATCH in REST.
    if (response.status === 204) {
      console.log('Resposta: 204 No Content');
      return { success: true, externalId };
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    console.log('Resposta bruta recebida:', text);

    // Any successful 2xx response is considered a sync success.
    if (response.ok) {
      let parsed: any = null;
      if (contentType.includes('application/json') && text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          // Not JSON despite content-type — still treat 2xx as success.
          parsed = null;
        }
      }

      if (protocol === 'legacy') {
        // Legacy contract historically returns { success, data:{ id } }.
        // Preserve old semantics when explicit success:false is returned.
        if (parsed && parsed.success === false) {
          const errorMsg = parsed.message || parsed.error || 'Erro desconhecido na API externa';
          console.error('[SyncExternal] Erro retornado pela API legacy:', errorMsg);
          return { success: false, error: `api_error:${errorMsg}` };
        }
        const newId = parsed?.data?.id ?? parsed?.id ?? externalId;
        return { success: true, externalId: newId };
      }

      // REST: any 2xx = success. Extract id from common shapes if present.
      const newId =
        parsed?.id ??
        parsed?.data?.id ??
        parsed?.[externalType]?.id ??
        externalId;
      return { success: true, externalId: newId };
    }

    // Non-2xx that isn't 401/403/404 — try to surface API error message.
    if (contentType.includes('application/json') && text) {
      try {
        const parsed = JSON.parse(text);
        const errorMsg = parsed.message || parsed.error || `HTTP ${response.status}`;
        console.error('[SyncExternal] Erro HTTP:', errorMsg);
        return { success: false, error: `api_error:${errorMsg}` };
      } catch {
        // fallthrough
      }
    }
    if (!contentType.includes('application/json')) {
      console.error('[SyncExternal] Resposta não é JSON');
      return { success: false, error: 'html_response' };
    }
    return { success: false, error: `api_error:HTTP ${response.status}` };
  } catch (error: any) {
    console.error('[SyncExternal] Erro na chamada:', error);
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return { success: false, error: 'cors_error' };
    }
    return { success: false, error: error.message || 'network_error' };
  } finally {
    console.log(`--- [SyncExternal] Fim da Ação: ${action} ---`);
  }
}

function prepareDataForExternal(type: MenuType, data: any) {
  if (type === 'category') {
    return {
      name: data.name,
      active: data.active !== undefined ? data.active : true,
      sort_order: data.order_index, // FlyControl uses order_index, SiteCreatorFly expects sort_order
    };
  }

  if (type === 'product') {
    return {
      name: data.name,
      description: data.description,
      price: data.price,
      image_url: data.image_url,
      active: data.active !== undefined ? data.active : true,
      category_id: data.external_category_id,
    };
  }

  if (type === 'beverage') {
    return {
      name: data.name,
      price: data.price,
      image_url: data.image_url,
      active: data.active !== undefined ? data.active : true,
    };
  }

  if (type === 'border' || type === 'additional') {
    return {
      name: data.name,
      price: data.price,
      active: data.active !== undefined ? data.active : true,
    };
  }

  if (type === 'combo') {
    return {
      name: data.name,
      description: data.description,
      original_price: data.original_price,
      combo_price: data.combo_price,
      image_url: data.image_url,
      active: data.active !== undefined ? data.active : true,
      highlight: data.highlight,
      available_days: data.available_days,
      start_time: data.start_time,
      end_time: data.end_time,
      items: data.items,
    };
  }

  if (type === 'pizza_size') {
    return {
      name: data.name,
      price: data.price,
      max_flavors: data.max_flavors,
      slices: data.slices,
      active: data.active !== undefined ? data.active : true,
      sort_order: data.sort_order,
    };
  }

  if (type === 'restaurant') {
    return {
      name: data.name,
      is_open: data.is_open,
      status: data.status,
      opening_hours: data.opening_hours,
    };
  }

  return data;
}
