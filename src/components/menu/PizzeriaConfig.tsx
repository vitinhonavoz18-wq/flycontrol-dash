import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Clock, Truck, FileText } from "lucide-react";

interface PizzeriaConfigProps {
  pizzeriaId: string;
}

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
            <Truck className="h-4 w-4 text-primary" /> Taxas de Entrega
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delivery-fee">Taxa de Entrega Padrão (R$)</Label>
            <Input 
              id="delivery-fee"
              type="number" 
              step="0.01" 
              defaultValue={pizzeria?.delivery_fee || 0}
              onBlur={(e) => handleUpdate('delivery_fee', parseFloat(e.target.value) || 0)}
              placeholder="0,00"
            />
            <p className="text-[10px] text-muted-foreground">Valor cobrado por padrão em cada pedido.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Horários
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hours">Horário de Funcionamento</Label>
            <Input 
              id="hours"
              placeholder="Ex: Seg a Sex: 18h às 23h" 
              defaultValue={typeof pizzeria?.opening_hours === 'string' ? pizzeria?.opening_hours : JSON.stringify(pizzeria?.opening_hours)}
              onBlur={(e) => {
                let val = e.target.value;
                try {
                  if (val.startsWith('[') || val.startsWith('{')) {
                    handleUpdate('opening_hours', JSON.parse(val));
                  } else {
                    handleUpdate('opening_hours', val);
                  }
                } catch {
                  handleUpdate('opening_hours', val);
                }
              }}
            />
            <p className="text-[10px] text-muted-foreground">Exibido no rodapé do seu site.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Informações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Descrição do Site</Label>
            <textarea 
              id="description"
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Fale um pouco sobre a qualidade e tradição da sua pizzaria..."
              defaultValue={pizzeria?.description || ""}
              onBlur={(e) => handleUpdate('description', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
