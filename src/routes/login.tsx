import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/flycontrol-logo.png";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) { toast.error(error); return; }
    toast.success("Bem-vindo!");
    nav({ to: "/dashboard" });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-glow)]">
        <div className="mb-12 flex justify-center">
          <Link to="/">
            <img src={logo} alt="FlyControl" className="h-48 w-auto object-contain drop-shadow-[0_0_30px_rgba(255,122,0,0.75)]" />
          </Link>
        </div>
        <h1 className="text-2xl font-bold">Entrar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Acesse o painel da sua pizzaria.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>
        {/* A conversão passa a começar pelos planos, e não pelo formulário:
            quem ainda não é cliente precisa comparar preço antes de decidir. */}
        <div className="mt-6 space-y-3 border-t border-border pt-5 text-center">
          <p className="text-sm text-muted-foreground">Ainda não possui uma conta?</p>
          <Button asChild variant="outline" className="h-11 w-full">
            <Link to="/plans">Conheça os planos</Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            <Link to="/signup" search={{ plan: undefined }} className="text-primary hover:underline">
              Criar minha conta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
