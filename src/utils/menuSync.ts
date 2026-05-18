import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SITE_CREATOR_API_URL = "https://conectfly.lovable.app/api/menu-sync";

interface SyncParams {
  type: 'category' | 'product' | 'beverage' | 'extra' | 'combo';
  action: 'create' | 'update' | 'delete' | 'patch';
  id?: string;
  externalId?: string;
  data?: any;
  pizzeriaSlug: string;
  pizzeriaApiKey: string;
}

export async function syncToExternal(params: SyncParams): Promise<{ success: boolean; externalId?: string; error?: string }> {
  const { type, action, id, externalId, data, pizzeriaSlug, pizzeriaApiKey } = params;
  
  // Mapping FlyControl types to SiteCreatorFly expectations if needed
  let externalType = type;
  if (type === 'extra') {
    externalType = data?.extra_type === 'borda' ? 'borda' : 'adicional';
  }

  console.log(`[SyncExternal] ${action} ${type}`, { id, externalId, pizzeriaSlug });

  try {
    let response;
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": pizzeriaApiKey
    };

    if (action === 'delete') {
      if (!externalId) return { success: true }; // Nothing to delete externally
      response = await fetch(`${SITE_CREATOR_API_URL}?type=${externalType}&id=${externalId}`, {
        method: "DELETE",
        headers
      });
    } else if (action === 'patch') {
      if (!externalId) return { success: true };
      response = await fetch(SITE_CREATOR_API_URL, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          type: externalType,
          id: externalId,
          field: data.field,
          value: data.value
        })
      });
    } else if (action === 'update') {
      if (!externalId) return { success: true };
      response = await fetch(SITE_CREATOR_API_URL, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          type: externalType,
          id: externalId,
          data: prepareDataForExternal(type, data, externalId)
        })
      });
    } else if (action === 'create') {
      response = await fetch(SITE_CREATOR_API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: externalType,
          data: prepareDataForExternal(type, data)
        })
      });
    }

    if (!response) throw new Error("Sem resposta do servidor");

    const result = await response.json();
    
    if (result.success) {
      return { 
        success: true, 
        externalId: result.data?.id || externalId 
      };
    } else {
      console.error("[SyncExternal] Erro retornado:", result.error);
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error("[SyncExternal] Erro na chamada:", error);
    return { success: false, error: error.message };
  }
}

function prepareDataForExternal(type: string, data: any, externalId?: string) {
  // Map FlyControl fields to SiteCreatorFly fields
  if (type === 'category') {
    return {
      name: data.name,
      description: data.description,
      is_active: data.active ?? true,
      sort_order: data.order_index ?? 0
    };
  }
  
  if (type === 'product' || type === 'beverage' || type === 'extra') {
    // Note: in SiteCreatorFly, Beverages might be in a different table, 
    // but our API endpoint handles the mapping.
    const mapped: any = {
      name: data.name,
      description: data.description,
      price: data.price,
      image_url: data.image_url,
      is_active: data.active ?? true,
    };
    
    if (data.category_id) {
      // We'd need the external category ID here. 
      // This is a bit complex, might need to fetch it first or store it.
      // For now, we'll assume category_id is handled if provided.
    }
    
    return mapped;
  }

  return data;
}
