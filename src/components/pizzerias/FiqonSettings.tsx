import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Zap, History, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface FiqonSettingsProps {
  pizzeria: any;
  onUpdated: (patch: any) => void;
}

export function FiqonSettings({ pizzeria, onUpdated }: FiqonSettingsProps) {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const loadLogs = async () => {
    const { data } = await supabase
      .from("flycontrol_fiqon_logs")
      .select("*")
      .eq("restaurant_id", pizzeria.id)
      .order("created_at", { ascending: false })
      .limit(5);
    setLogs(data || []);
  };

  useEffect(() => {
    if (showLogs) loadLogs();
  }, [showLogs, pizzeria.id]);

  const handleUpdate = async (patch: any) => {
    setLoading(true);
    const { error } = await supabase
      .from("pizzerias")
      .update(patch)
      .eq("id", pizzeria.id);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success("Configurações FIQON atualizadas");
      onUpdated(patch);
    }
    setLoading(false);
  };

  const handleTest = async () => {
    if (!pizzeria.fiqon_webhook_url) {
      toast.error("Preencha a URL do Webhook primeiro");
      return;
    }

    setTesting(true);
    try {
      const payload = {
        event: "order.created",
        source: "flycontrol_manual_test",
        restaurant: {
          slug: pizzeria.slug,
          name: pizzeria.name
        },
        order: {
          id: "TEST-" + Math.random().toString(36).substring(7).toUpperCase(),
          customer_name: "Teste FIQON",
          customer_phone: "(11) 99999-9999",
          address: "Rua Teste, 123",
          items: [{ name: "Pizza Teste", quantity: 1, price: 50.0 }],
          subtotal: 50.0,
          delivery_fee: 5.0,
          total: 55.0,
          payment_method: "Cartão",
          notes: "Pedido de teste manual via painel FlyControl",
          status: "novo",
          created_at: new Date().toISOString()
        }
      };

      const response = await fetch(pizzeria.fiqon_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const respText = await response.text();
      const isSuccess = response.status >= 200 && response.status < 300;

      // Salvar log do teste
      await supabase.from("flycontrol_fiqon_logs").insert({
        restaurant_id: pizzeria.id,
        fiqon_url: pizzeria.fiqon_webhook_url,
        payload: payload,
        status_http: response.status,
        response_body: respText,
        success: isSuccess,
        error_message: isSuccess ? null : `Status ${response.status}: ${respText.substring(0, 100)}`
      });

      if (isSuccess) {
        toast.success("Teste enviado com sucesso!");
      } else {
        toast.error(`Falha no envio: Status ${response.status}`);
      }
      loadLogs();
    } catch (err: any) {
      toast.error("Erro na conexão: " + err.message);
      await supabase.from("flycontrol_fiqon_logs").insert({
        restaurant_id: pizzeria.id,
        fiqon_url: pizzeria.fiqon_webhook_url,
        payload: {},
        success: false,
        error_message: err.message
      });
      loadLogs();
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mt-6 border-t border-border pt-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500" />
          <h3 className="text-lg font-semibold">Automação FIQON</h3>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="fiqon-toggle" className="text-sm cursor-pointer">Ativar integração</Label>
          <Switch 
            id="fiqon-toggle"
            checked={pizzeria.fiqon_enabled} 
            onCheckedChange={(checked) => handleUpdate({ fiqon_enabled: checked })}
            disabled={loading}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs font-medium uppercase text-muted-foreground">URL do Webhook FIQON</Label>
          <div className="flex gap-2">
            <Input 
              placeholder="https://webhook.fiqon.com.br/..." 
              defaultValue={pizzeria.fiqon_webhook_url || ""}
              onBlur={(e) => handleUpdate({ fiqon_webhook_url: e.target.value })}
              className="flex-1"
            />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleTest} 
              disabled={testing || !pizzeria.fiqon_webhook_url}
              className="gap-2"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Testar
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Sempre que um pedido for recebido no FlyControl, ele será enviado para esta URL.
          </p>
        </div>

        <div className="pt-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-xs gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowLogs(!showLogs)}
          >
            <History className="h-4 w-4" />
            {showLogs ? "Ocultar logs recentes" : "Ver logs recentes"}
          </Button>

          {showLogs && (
            <div className="mt-3 space-y-2">
              {logs.length === 0 ? (
                <p className="text-xs text-center py-4 text-muted-foreground italic">Nenhum log de envio encontrado.</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="text-[11px] border border-border rounded-md p-2 bg-muted/30">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {log.success ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : (
                          <AlertCircle className="h-3 w-3 text-red-500" />
                        )}
                        <span className="font-semibold">
                          {log.status_http ? `Status ${log.status_http}` : "Erro de Conexão"}
                        </span>
                      </div>
                      <span className="text-muted-foreground">
                        {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: pt_BR })}
                      </span>
                    </div>
                    {log.error_message && (
                      <div className="text-red-500 font-mono mt-1 break-all">
                        {log.error_message}
                      </div>
                    )}
                    {!log.success && log.response_body && (
                      <div className="bg-background/50 p-1 mt-1 rounded text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                        Resp: {log.response_body}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
