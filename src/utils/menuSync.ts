import { toast } from "sonner";

const DEFAULT_SYNC_ENDPOINT = "https://watjejwgtieqfkpebkfz.supabase.co/functions/v1/menu-sync";

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

export async function syncToExternal(params: SyncParams): Promise<{ success: boolean; externalId?: string; error?: string }> {
  const { type, action, externalId, data, pizzeriaSlug, pizzeriaApiKey, syncEndpoint } = params;
  
  // Mapping FlyControl types to SiteCreatorFly expectations
  let externalType: MenuType = 'product';
  
  if (type === 'category') externalType = 'category';
  else if (type === 'beverage') externalType = 'beverage';
  else if (type === 'combo') externalType = 'combo';
  else if (type === 'extra' || type === 'border' || type === 'borda') externalType = 'border';
  else if (type === 'additional' || type === 'adicional') externalType = 'additional';
  else if (type === 'standard' || type === 'product' || type === 'flavor') externalType = 'product';
  else if (type === 'pizza_size') externalType = 'pizza_size';
  else if (type === 'restaurant') externalType = 'restaurant';

  // Handle border/additional from 'extra' type
  if (type === 'extra' && data?.extra_type) {
    externalType = data.extra_type === 'borda' ? 'border' : 'additional';
  }

  const endpoint = (syncEndpoint || DEFAULT_SYNC_ENDPOINT).trim();
  
  console.log(`--- [SyncExternal] Início da Ação: ${action} ---`);
  console.log("Tipo do item:", externalType);
  console.log("Ação:", action);
  console.log("Slug usado:", pizzeriaSlug);
  console.log("ID/External ID usado:", externalId);
  console.log("Endpoint chamado:", endpoint);
  // Log partially redacted API key for safety
  console.log("Headers: { Content-Type: application/json, x-api-key: " + 
    (pizzeriaApiKey ? `${pizzeriaApiKey.substring(0, 4)}...${pizzeriaApiKey.substring(pizzeriaApiKey.length - 4)}` : "missing") + " }");

  try {
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": pizzeriaApiKey
    };

    let body: any = {
      action,
      type: externalType,
      slug: pizzeriaSlug,
    };

    if (externalId) {
      body.id = externalId;
    }

    if (action === 'status') {
      // In 'status' action, send the direct boolean in 'active' field
      body.active = data.value;
    } else if (action === 'create' || action === 'update') {
      body.data = prepareDataForExternal(externalType, data);
    }

    console.log("Payload enviado:", JSON.stringify(body, null, 2));

    // Nova regra: Usar POST para todas as ações de escrita
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    console.log("Status HTTP recebido:", response.status);
    
    if (response.status === 404) {
      console.error("[SyncExternal] 404 - Endpoint não encontrado");
      return { success: false, error: "404" };
    }
    
    if (response.status === 401 || response.status === 403) {
      console.error("[SyncExternal] 401/403 - Autorização negada");
      return { success: false, error: "auth_error" };
    }

    const contentType = response.headers.get("content-type");
    const text = await response.text();
    console.log("Resposta bruta recebida:", text);

    if (!contentType || !contentType.includes("application/json")) {
      console.error("[SyncExternal] Resposta não é JSON");
      return { success: false, error: "html_response" };
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      console.error("[SyncExternal] Erro ao parsear JSON");
      return { success: false, error: "invalid_json" };
    }

    console.log("Resposta JSON processada:", result);

    if (result.success) {
      return { 
        success: true, 
        externalId: result.data?.id || result.id || externalId 
      };
    } else {
      const errorMsg = result.message || result.error || "Erro desconhecido na API externa";
      console.error("[SyncExternal] Erro retornado pela API:", errorMsg);
      return { success: false, error: `api_error:${errorMsg}` };
    }
  } catch (error: any) {
    console.error("[SyncExternal] Erro na chamada:", error);
    // Detect CORS or Network error
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return { success: false, error: "cors_error" };
    }
    return { success: false, error: error.message || "network_error" };
  } finally {
    console.log(`--- [SyncExternal] Fim da Ação: ${action} ---`);
  }
}

function prepareDataForExternal(type: MenuType, data: any) {
  if (type === 'category') {
    return {
      name: data.name,
      active: data.active !== undefined ? data.active : true,
      sort_order: data.order_index // FlyControl uses order_index, SiteCreatorFly expects sort_order
    };
  }
  
  if (type === 'product') {
    return {
      name: data.name,
      description: data.description,
      price: data.price,
      image_url: data.image_url,
      active: data.active !== undefined ? data.active : true,
      category_id: data.external_category_id
    };
  }

  if (type === 'beverage') {
    return {
      name: data.name,
      price: data.price,
      image_url: data.image_url,
      active: data.active !== undefined ? data.active : true
    };
  }

  if (type === 'border' || type === 'additional') {
    return {
      name: data.name,
      price: data.price,
      active: data.active !== undefined ? data.active : true
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
      items: data.items 
    };
  }

  if (type === 'pizza_size') {
    return {
      name: data.name,
      price: data.price,
      max_flavors: data.max_flavors,
      slices: data.slices,
      active: data.active !== undefined ? data.active : true,
      sort_order: data.sort_order
    };
  }

  if (type === 'restaurant') {
    return {
      name: data.name,
      is_open: data.is_open,
      status: data.status,
      opening_hours: data.opening_hours
    };
  }

  return data;
}
