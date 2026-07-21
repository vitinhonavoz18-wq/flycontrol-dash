import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus } from "lucide-react";
import { toast } from "sonner";

type PlanType = "premium" | "cents";

export function CreatePizzeriaDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [planType, setPlanType] = useState<PlanType>("premium");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/pizzerias/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          phone: fd.get("phone"),
          address: fd.get("address"),
          plan_type: planType,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        toast.error("Erro ao criar empresa: " + (data?.error ?? "erro desconhecido"));
      } else {
        toast.success("Empresa criada com sucesso!");
        setOpen(false);
        setPlanType("premium");
        onSuccess();
      }
    } catch (err: any) {
      toast.error("Erro ao criar empresa: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Plus className="h-4 w-4" /> Criar Nova Empresa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar Nova Empresa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Empresa</Label>
            <Input id="name" name="name" placeholder="Ex: Pizzaria do João" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" name="phone" placeholder="(00) 00000-0000" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Endereço</Label>
            <Input id="address" name="address" placeholder="Rua, número, bairro" />
          </div>
          <div className="space-y-2">
            <Label>Escolha do Plano</Label>
            <RadioGroup value={planType} onValueChange={(v) => setPlanType(v as PlanType)} className="gap-3">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 hover:bg-muted/50">
                <RadioGroupItem value="premium" id="plan-premium" className="mt-0.5" />
                <div>
                  <div className="font-medium">Plano Premium</div>
                  <div className="text-xs text-muted-foreground">Mensalidade fixa de R$ 375,00 — pedidos ilimitados, sem Clube CENTS.</div>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 hover:bg-muted/50">
                <RadioGroupItem value="cents" id="plan-cents" className="mt-0.5" />
                <div>
                  <div className="font-medium">Plano CENTS</div>
                  <div className="text-xs text-muted-foreground">Sem mensalidade — cobrança por pedido, participa do Clube CENTS.</div>
                </div>
              </label>
            </RadioGroup>
          </div>
          <DialogFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Criando..." : "Criar Empresa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
