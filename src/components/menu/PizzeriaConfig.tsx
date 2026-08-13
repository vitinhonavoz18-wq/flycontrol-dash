import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Globe, Key } from "lucide-react";

interface PizzeriaConfigProps {
  pizzeriaId: string;
}

// Os campos de identidade, contato, aparência e comportamento do site
// (nome, WhatsApp, cores, capa, modos de atendimento etc.) moram em "Minha
// Loja" (src/routes/_app/my-store.tsx) — lá é onde o dono do estabelecimento
// espera encontrá-los. Esta tela guarda só o que é específico da conexão
// técnica de sincronização do cardápio, que não tem por que aparecer lá.
export function PizzeriaConfig({ pizzeriaId }: PizzeriaConfigProps) {
  const [pizzeria, setPizzeria] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPizzeria();
  }, [pizzeriaId]);

  async function loadPizzeria() {
    setLoading(true);
    const { data, error } = await supabase
      .from("pizzerias")
      .select("*")
      .eq("id", pizzeriaId)
      .single();

    if (error) {
      toast.error("Erro ao carregar dados: " + error.message);
    } else {
      setPizzeria(data);
    }
    setLoading(false);
  }

  async function handleUpdate(field: string, value: any) {
    setSaving(true);
    const { error } = await supabase
      .from("pizzerias")
      .update({ [field]: value } as any)
      .eq("id", pizzeriaId);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success("Configuração atualizada");
      loadPizzeria();
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" /> Identificação do Site
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slug">Slug do Site (identificador único)</Label>
            <Input
              id="slug"
              placeholder="ex: pizzaria-do-joao"
              defaultValue={pizzeria?.slug || ""}
              onBlur={(e) => handleUpdate("slug", e.target.value)}
              disabled={saving}
            />
            <p className="text-[10px] text-muted-foreground">
              O slug deve ser idêntico ao configurado no seu site público.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" /> Acesso à API
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api_key">Chave de API (x-api-key)</Label>
            <Input
              id="api_key"
              type="password"
              placeholder="Sua chave de API"
              defaultValue={pizzeria?.api_key || ""}
              onBlur={(e) => handleUpdate("api_key", e.target.value)}
              disabled={saving}
            />
            <p className="text-[10px] text-muted-foreground">
              Necessária para validar a sincronização segura dos dados.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
