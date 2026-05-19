import { toast } from "sonner";

const DEFAULT_SYNC_ENDPOINT = "https://watjejwgtieqfkpebkfz.supabase.co/functions/v1/menu-sync";

type MenuType = 'category' | 'product' | 'beverage' | 'border' | 'additional' | 'combo';

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
  else if (type === 'standard' || type === 'product') externalType = 'product';

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
      body.active = data.value;
    } else if (action === 'create' || action === 'update') {
      body.data = prepareDataForExternal(externalType, data);
    }

    console.log("Payload enviado:", JSON.stringify(body, null, 2));

    let method = "POST";
    if (action === 'update') method = "PUT";
    else if (action === 'delete') method = "DELETE";
    else if (action === 'status') method = "PATCH";

    const response = await fetch(endpoint, {
      method,
      headers,
      body: JSON.stringify(body)
    });

    console.log("Status HTTP recebido:", response.status);
    
    const text = await response.text();
    console.log("Resposta bruta recebida:", text);

    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      console.error("Resposta não é JSON válido");
      return { success: false, error: "O endpoint respondeu HTML, mas era esperado JSON. Verifique a Edge Function no SiteCreatorFly." };
    }

    console.log("Resposta JSON processada:", result);

    if (result.success) {
      return { 
        success: true, 
        externalId: result.data?.id || result.id || externalId 
      };
    } else {
      const errorMsg = result.message || result.error || "Erro desconhecido na API externa";
      console.error("[SyncExternal] Erro retornado:", errorMsg);
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    console.error("[SyncExternal] Erro na chamada:", error);
    return { success: false, error: "Não foi possível atualizar o cardápio público. Verifique a conexão com o SiteCreatorFly." };
  } finally {
    console.log(`--- [SyncExternal] Fim da Ação: ${action} ---`);
  }
}

function prepareDataForExternal(type: MenuType, data: any) {
  if (type === 'category') {
    return {
      name: data.name,
      description: data.description,
      active: data.active !== undefined ? data.active : true,
    };
  }
  
  if (type === 'product' || type === 'beverage' || type === 'border' || type === 'additional') {
    return {
      name: data.name,
      description: data.description,
      price: data.price,
      image_url: data.image_url,
      active: data.active !== undefined ? data.active : true,
      category_id: data.external_category_id
    };
  }

  return data;
}
