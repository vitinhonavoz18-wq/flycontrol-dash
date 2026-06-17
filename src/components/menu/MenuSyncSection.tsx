import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, RefreshCw, Save, CheckCircle2, AlertCircle, Link, Trash2 } from "lucide-react";

interface MenuSyncSectionProps {
  pizzeriaId: string;
  onSyncSuccess?: () => void;
}

export function MenuSyncSection({ pizzeriaId, onSyncSuccess }: MenuSyncSectionProps) {
  const [syncEndpoint, setSyncEndpoint] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pizzeria, setPizzeria] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<{
    lastSync?: string;
    status?: 'success' | 'error';
    errorDetails?: string;
    counts?: {
      categories: number;
      products: number;
    };
  }>({});

  useEffect(() => {
    loadPizzeria();
  }, [pizzeriaId]);

  async function loadPizzeria() {
    setLoading(true);
    const { data, error } = await supabase
      .from("pizzerias")
      .select("id, name, slug, api_key, sync_endpoint")
      .eq("id", pizzeriaId)
      .single();

    if (error) {
      toast.error("Erro ao carregar dados da pizzaria: " + error.message);
    } else if (data) {
      setPizzeria(data);
      setSyncEndpoint(data.sync_endpoint || "");
    }
    setLoading(false);
  }

  const validateLink = (url: string) => {
    if (!url) return { valid: false };
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { valid: false };
      
      const isOldFormat = url.includes("/api/public/pizzarias/") && url.includes("/menu-sync");
      if (isOldFormat) {
        return { valid: false, old: true };
      }

      return { valid: true };
    } catch {
      return { valid: false };
    }
  };

  async function handleSaveLink() {
    const validation = validateLink(syncEndpoint);
    if (syncEndpoint && !validation.valid) {
      if (validation.old) {
        toast.error("Este é o formato antigo do link. Copie novamente o link de sincronização no SiteCreatorFly.");
      } else {
        toast.error("Link de sincronização inválido. Verifique o link gerado no SiteCreatorFly.");
      }
      return;
    }

    setSaving(true);
    console.log("MENU_SYNC_SAVED_URL", syncEndpoint);
    
    const { error } = await supabase
      .from("pizzerias")
      .update({ sync_endpoint: syncEndpoint })
      .eq("id", pizzeriaId);

    if (error) {
      toast.error("Erro ao salvar link: " + error.message);
    } else {
      toast.success("Link de sincronização salvo com sucesso.");
      setPizzeria({ ...pizzeria, sync_endpoint: syncEndpoint });
    }
    setSaving(false);
  }

  async function handleClearLink() {
    setSaving(true);
    const { error } = await supabase
      .from("pizzerias")
      .update({ sync_endpoint: null })
      .eq("id", pizzeriaId);

    if (error) {
      toast.error("Erro ao limpar link: " + error.message);
    } else {
      setSyncEndpoint("");
      setPizzeria({ ...pizzeria, sync_endpoint: null });
      toast.success("Link removido com sucesso.");
    }
    setSaving(false);
  }

  async function handleTestConnection() {
    if (!syncEndpoint) {
      toast.error("Cole e salve o link de sincronização antes de testar.");
      return;
    }

    const validation = validateLink(syncEndpoint);
    if (!validation.valid) {
      if (validation.old) {
        toast.error("Este é o formato antigo do link. Copie novamente o link de sincronização no SiteCreatorFly.");
      } else {
        toast.error("Link de sincronização inválido.");
      }
      return;
    }

    setSyncing(true);
    const toastId = toast.loading("Testando conexão...");
    
    try {
      const testUrl = `/api/pizzerias/sync-menu?sync_url=${encodeURIComponent(syncEndpoint)}`;
      const tokenPreview = syncEndpoint.split('/').pop()?.substring(0, 10) + "...";
      
      console.log("MENU_SYNC_FETCH_URL_FINAL", syncEndpoint);
      console.log("MENU_SYNC_TOKEN_PREVIEW", tokenPreview);
      
      const response = await fetch(testUrl, { method: 'GET', headers: { 'Accept': 'application/json' } });
      console.log("MENU_SYNC_HTTP_STATUS", response.status);

      const text = await response.text();
      console.log("MENU_SYNC_RESPONSE_BODY", text.substring(0, 1000));
      
      let jsonResponse = null;
      try {
        jsonResponse = JSON.parse(text);
      } catch {
        // Not JSON
      }

      if (response.ok && jsonResponse?.success) {
        const categoriesCount = (jsonResponse.categories?.length || 0) + 
          (jsonResponse.normalized_products?.reduce((acc: any, p: any) => p.category_name ? acc.add(p.category_name) : acc, new Set()).size || 0);
        
        const productsCount = (jsonResponse.products?.length || 0) + 
          (jsonResponse.beverages?.length || 0) + 
          (jsonResponse.drinks?.length || 0) +
          (jsonResponse.normalized_products?.length || 0);

        const extrasCount = (jsonResponse.borders?.length || 0) + (jsonResponse.additionals?.length || 0);
        
        toast.success(`Conexão OK! Encontrado: ${categoriesCount} categorias, ${productsCount} produtos/bebidas e ${extrasCount} bordas/adicionais.`, { id: toastId });
      } else {
        if (response.status === 401 || (jsonResponse && !jsonResponse.success && (jsonResponse.error === "invalid_sync_token" || jsonResponse.message === "invalid_sync_token"))) {
          toast.error("Token inválido. Copie novamente o link no SiteCreatorFly ou regenere o token.", { id: toastId, duration: 5000 });
        } else {
          toast.error(`Falha na conexão. Status: ${response.status}. ${jsonResponse?.error || jsonResponse?.message || ""}`, { id: toastId });
        }
      }
    } catch (error: any) {
      console.error("MENU_SYNC_ERROR", error);
      toast.error(`Erro de conexão: ${error.message}`, { id: toastId });
    } finally {
      setSyncing(false);
    }
  }

  async function handleSync() {
    if (!syncEndpoint) {
      toast.error("Cole e salve o link de sincronização antes de sincronizar.");
      return;
    }

    const validation = validateLink(syncEndpoint);
    if (!validation.valid) {
      if (validation.old) {
        toast.error("Este é o formato antigo do link. Copie novamente o link de sincronização no SiteCreatorFly.");
      } else {
        toast.error("Link de sincronização inválido.");
      }
      return;
    }

    if (!pizzeria?.slug) {
      toast.error("Slug da pizzaria não encontrado.");
      return;
    }

    setSyncing(true);
    setSyncStatus({ ...syncStatus, status: undefined });
    const toastId = toast.loading("Sincronizando cardápio...");
    
    const proxyUrl = `/api/pizzerias/sync-menu?sync_url=${encodeURIComponent(syncEndpoint)}`;
    console.log("MENU_SYNC_FETCH_URL_FINAL", syncEndpoint);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(proxyUrl, { 
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      
      console.log("MENU_SYNC_HTTP_STATUS", response.status);
      
      const text = await response.text();
      console.log("MENU_SYNC_RESPONSE_BODY", text.substring(0, 1000));

      if (response.status !== 200) {
        let errorMsg = `Erro HTTP ${response.status}`;
        if (response.status === 401) {
          errorMsg = "Token inválido. Copie novamente o link no SiteCreatorFly ou regenere o token.";
        } else {
          try {
            const errorJson = JSON.parse(text);
            if (errorJson.error === "invalid_sync_token" || errorJson.message === "invalid_sync_token") {
              errorMsg = "Token inválido. Copie novamente o link no SiteCreatorFly ou regenere o token.";
            } else {
              errorMsg = `Erro: ${errorJson.error || errorJson.message || errorMsg}`;
            }
          } catch {
            // Keep original msg
          }
        }
        throw new Error(errorMsg);
      }

      let externalMenu;
      try {
        externalMenu = JSON.parse(text);
      } catch (e) {
        throw new Error("O link respondeu, mas não retornou um JSON válido.");
      }

      if (externalMenu.success === false) {
        if (externalMenu.error === "invalid_sync_token" || externalMenu.message === "invalid_sync_token") {
          throw new Error("Token inválido. Copie novamente o link no SiteCreatorFly ou regenere o token.");
        }
        throw new Error(externalMenu.message || externalMenu.error || "Erro retornado pela API do SiteCreatorFly");
      }

      // SiteCreatorFly returns { success, restaurant, menu: { categories, products, ... } }.
      // Unwrap the "menu" envelope when present so we look at the right level.
      const menuRoot: any = externalMenu.menu && typeof externalMenu.menu === "object"
        ? { ...externalMenu, ...externalMenu.menu }
        : externalMenu;

      const categoriesCount = (menuRoot.categories?.length || 0) +
        (menuRoot.normalized_products?.reduce((acc: any, p: any) => p.category_name ? acc.add(p.category_name) : acc, new Set()).size || 0);

      const productsCount = (menuRoot.products?.length || 0) +
        (menuRoot.beverages?.length || 0) +
        (menuRoot.drinks?.length || 0) +
        (menuRoot.combos?.length || 0) +
        (menuRoot.normalized_products?.length || 0);

      console.log("FL_SYNC_DETECTED", { categoriesCount, productsCount, hasMenuEnvelope: !!externalMenu.menu });

      if (categoriesCount === 0 && productsCount === 0) {
        throw new Error("O link respondeu, mas nenhum produto ou categoria foi encontrado.");
      }


      const syncResponse = await fetch("/api/pizzerias/sync-menu", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": pizzeria.api_key
        },
        body: JSON.stringify({
          pizzeria_id: pizzeriaId,
          api_key: pizzeria.api_key,
          menu: {
            ...externalMenu,
            extras: [
              ...(externalMenu.borders || []).map((b: any) => ({ ...b, extra_type: 'borda' })),
              ...(externalMenu.additionals || []).map((a: any) => ({ ...a, extra_type: 'adicional' }))
            ]
          }
        })
      });

      const syncResult = await syncResponse.json();
      
      if (syncResult.success) {
        setSyncStatus({
          lastSync: new Date().toLocaleString('pt-BR'),
          status: 'success',
          counts: {
            categories: syncResult.results.categories,
            products: syncResult.results.products + syncResult.results.beverages
          }
        });
        toast.success("Cardápio sincronizado com sucesso!", { id: toastId });
        if (onSyncSuccess) onSyncSuccess();
      } else {
        throw new Error(syncResult.error || "Erro no processamento interno do FlyControl");
      }
    } catch (error: any) {
      console.error("MENU_SYNC_ERROR", error.message);
      const errorMsg = error.message || "Erro desconhecido";
      setSyncStatus({
        lastSync: new Date().toLocaleString('pt-BR'),
        status: 'error',
        errorDetails: errorMsg
      });
      toast.error(errorMsg, { id: toastId });
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return null;

  return (
    <Card className="mb-6 border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <RefreshCw className={`h-5 w-5 text-primary ${syncing ? 'animate-spin' : ''}`} />
          Sincronização com SiteCreatorFly
        </CardTitle>
        <CardDescription>
          Mantenha seu cardápio do FlyControl atualizado com os dados do seu site.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="sync-link" className="flex items-center gap-2">
              <Link className="h-3.5 w-3.5" />
              Link de sincronização do SiteCreatorFly
            </Label>
            <div className="flex gap-2">
              <Input 
                id="sync-link"
                placeholder="Cole aqui o link de sincronização gerado no SiteCreatorFly"
                value={syncEndpoint}
                onChange={(e) => setSyncEndpoint(e.target.value)}
                className="bg-background"
              />
              <Button 
                variant="destructive" 
                size="icon"
                onClick={handleClearLink}
                disabled={saving || syncing || !syncEndpoint}
                title="Limpar link salvo"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="secondary" 
              onClick={handleSaveLink} 
              disabled={saving || syncing}
              className="gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Link
            </Button>
            <Button 
              variant="outline" 
              onClick={handleTestConnection} 
              disabled={saving || syncing}
              className="gap-2"
            >
              Testar Conexão
            </Button>
            <Button 
              onClick={handleSync} 
              disabled={saving || syncing || !syncEndpoint}
              className="gap-2 bg-primary hover:bg-primary/90"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sincronizar Cardápio
            </Button>
          </div>
        </div>

        {syncStatus.lastSync && (
          <div className={`mt-4 p-3 rounded-md border flex flex-col gap-2 ${
            syncStatus.status === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="flex items-center justify-between font-medium text-sm">
              <div className="flex items-center gap-2">
                {syncStatus.status === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                )}
                Status: {syncStatus.status === 'success' ? 'Sincronizado com sucesso' : 'Erro na sincronização'}
              </div>
              <span className="text-xs opacity-70">Última tentativa: {syncStatus.lastSync}</span>
            </div>
            
            {syncStatus.status === 'success' && syncStatus.counts && (
              <div className="text-xs grid grid-cols-2 gap-4">
                <div>Categorias importadas: <strong>{syncStatus.counts.categories}</strong></div>
                <div>Produtos importados: <strong>{syncStatus.counts.products}</strong></div>
              </div>
            )}
            
            {syncStatus.status === 'error' && (
              <div className="text-xs font-mono bg-white/50 p-2 rounded border border-red-100 mt-1 break-all">
                Detalhes do erro: {syncStatus.errorDetails}
              </div>
            )}
          </div>
        )}
        
        {!syncEndpoint && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-2">
            <AlertCircle className="h-3 w-3" />
            Cole e salve o link de sincronização antes de sincronizar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

