import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { waiterLogin } from "@/lib/waiterAuth.functions";
import { setWaiterSession } from "@/lib/waiterSession";

export const Route = createFileRoute("/waiter-login")({ component: WaiterLoginPage });

function WaiterLoginPage() {
  const nav = useNavigate();
  const login = useServerFn(waiterLogin);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login({ data: { username, password } });
      setWaiterSession(res);
      toast.success(`Bem-vindo, ${res.waiter.fullName}!`);
      nav({ to: "/waiter-portal" });
    } catch (e: any) {
      toast.error(e.message || "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 grid place-items-center">
            <UtensilsCrossed className="h-7 w-7 text-primary" />
          </div>
          <CardTitle>Acesso do Garçom</CardTitle>
          <p className="text-sm text-muted-foreground">Entre com seu usuário e senha cadastrados pelo gestor.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="u">Usuário</Label>
              <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p">Senha</Label>
              <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
