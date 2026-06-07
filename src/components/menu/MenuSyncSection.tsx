import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, RefreshCw, Save, CheckCircle2, AlertCircle, Link } from "lucide-react";

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
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  };

  async function handleSaveLink() {
    if (syncEndpoint && !validateLink(syncEndpoint)) {
      toast.error("Link de sincronização inválido. Verifique o link gerado no SiteCreatorFly.");
      return;
    }

    setSaving(true);
    console.log("MENU_SYNC_LINK_SAVED", { pizzeriaId, endpoint: syncEndpoint });
    
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

  async function handleTestConnection() {
    if (!syncEndpoint) {
      toast.error("Cole e salve o link de sincronização antes de testar.");
      return;
    }

    if (!validateLink(syncEndpoint)) {
      toast.error("Link de sincronização inválido.");
      return;
    }

    // Validação de token conforme solicitado
    const hasToken = syncEndpoint.includes("sync_token=") || syncEndpoint.includes("token=");
    if (!hasToken) {
      toast.error("O link não contém token de sincronização. Copie novamente no SiteCreatorFly.");
      return;
    }

    setSyncing(true);
    const toastId = toast.loading("Testando conexão...");
    
    try {
      const testUrl = syncEndpoint;
      
      // Logs obrigatórios solicitados
      console.log("MENU_SYNC_SAVED_URL", syncEndpoint);
      console.log("MENU_SYNC_FETCH_URL_FINAL", testUrl);
      console.log("MENU_SYNC_HAS_SYNC_TOKEN", hasToken);
      
      const response = await fetch(testUrl, { method: 'GET', headers: { 'Accept': 'application/json' } });
      
      console.log("MENU_SYNC_HTTP_STATUS", response.status);

      if (response.ok) {
        toast.success("Conexão estabelecida com sucesso!", { id: toastId });
      } else {
        const text = await response.text();
        console.log("MENU_SYNC_RAW_RESPONSE", text.substring(0, 500));

        if (response.status === 401) {
          let detail = "Token inválido ou expirado.";
          try {
            const errorJson = JSON.parse(text);
            detail = errorJson.error || errorJson.message || detail;
          } catch {}
          toast.error(`Erro de autorização (401): ${detail}`, { id: toastId });
        } else if (response.status === 404) {
          toast.error("Link de sincronização não encontrado (404).", { id: toastId });
        } else {
          toast.error(`Falha na conexão. Status: ${response.status}.`, { id: toastId });
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

    // Validação de token conforme solicitado
    const hasToken = syncEndpoint.includes("sync_token=") || syncEndpoint.includes("token=");
    if (!hasToken) {
      toast.error("O link não contém token de sincronização. Copie novamente no SiteCreatorFly.");
      return;
    }

    if (!pizzeria?.slug) {
      toast.error("Slug da pizzaria não encontrado.");
      return;
    }

    setSyncing(true);
    setSyncStatus({ ...syncStatus, status: undefined });
    const toastId = toast.loading("Sincronizando cardápio...");
    
    // Garantir que a URL seja usada exatamente como salva, preservando query string inteira
    const endpoint = syncEndpoint;
    
    // Logs obrigatórios solicitados
    console.log("MENU_SYNC_SAVED_URL", syncEndpoint);
    console.log("MENU_SYNC_FETCH_URL_FINAL", endpoint);
    console.log("MENU_SYNC_HAS_SYNC_TOKEN", hasToken);
    
    // Preview do token para debug (primeiros 10 caracteres)
    const tokenMatch = endpoint.match(/[?&](?:sync_token|token)=([^&]+)/);
    const tokenValue = tokenMatch ? tokenMatch[1] : "not_found";
    console.log("MENU_SYNC_TOKEN_PREVIEW", tokenValue.substring(0, 10) + "...");

    console.log("MENU_SYNC_STARTED", { pizzeriaId, slug: pizzeria.slug });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(endpoint, { 
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      
      console.log("MENU_SYNC_HTTP_STATUS", response.status);
      
      const contentType = response.headers.get("content-type");
      const text = await response.text();
      console.log("MENU_SYNC_RAW_RESPONSE", text.substring(0, 500));

      if (response.status !== 200) {
        let errorMsg = `Erro HTTP ${response.status}`;
        
        if (response.status === 401) {
          // Tentar parsear a resposta para ver o motivo real (missing_sync_token, invalid_sync_token, etc)
          try {
            const errorJson = JSON.parse(text);
            const detail = errorJson.error || errorJson.message || "api_key_required";
            errorMsg = `Erro de autorização (401): ${detail}`;
          } catch {
            errorMsg = "Erro de autorização (401): Token inválido ou expirado.";
          }
        } else if (response.status === 404) {
          errorMsg = "Link de sincronização não encontrado (404). Verifique o slug no link.";
        } else {
          errorMsg = `Falha na sincronização (Status ${response.status}).`;
        }
        
        throw new Error(errorMsg);
      }

      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Resposta inválida: Esperado JSON, recebido " + (contentType || "vazio"));
      }

      let externalMenu;
      try {
        externalMenu = JSON.parse(text);
        console.log("MENU_SYNC_JSON_RESPONSE", !!externalMenu);
      } catch (e) {
        console.log("MENU_SYNC_JSON_ERROR", e);
        throw new Error("O link respondeu, mas não retornou um cardápio válido.");
      }

      if (externalMenu.success === false) {
        throw new Error(externalMenu.message || externalMenu.error || "Erro retornado pela API do SiteCreatorFly");
      }

      const categoriesCount = externalMenu.categories?.length || 0;
      const productsCount = (externalMenu.products?.length || 0) + (externalMenu.beverages?.length || 0);
      
      console.log("MENU_SYNC_CATEGORIES_FOUND", categoriesCount);
      console.log("MENU_SYNC_PRODUCTS_FOUND", productsCount);

      if (categoriesCount === 0 && productsCount === 0) {
        throw new Error("O link respondeu, mas nenhum produto ou categoria foi encontrado.");
      }

      // 2. Local Sync
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
        console.log("MENU_SYNC_SUCCESS", syncResult.results);
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
      console.error("MENU_SYNC_ERROR", error);
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
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto_auto] items-end">
          <div className="space-y-2">
            <Label htmlFor="sync-link" className="flex items-center gap-2">
              <Link className="h-3.5 w-3.5" />
              Link de sincronização do SiteCreatorFly
            </Label>
            <Input 
              id="sync-link"
              placeholder="Cole aqui o link de sincronização gerado no SiteCreatorFly"
              value={syncEndpoint}
              onChange={(e) => setSyncEndpoint(e.target.value)}
              className="bg-background"
            />
          </div>
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
