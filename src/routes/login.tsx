import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import { toast } from "sonner";
import logo from "@/assets/flycontrol-logo.png";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { signIn, signInWithGoogle } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Bem-vindo!");
    nav({ to: "/dashboard" });
  }

  async function onGoogleClick() {
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    // Sem erro, o navegador já está saindo para o Google — não há mais o que
    // fazer aqui. Erro aqui só acontece antes desse redirecionamento.
    if (error) {
      setGoogleLoading(false);
      toast.error(error);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-glow)]">
        <div className="mb-12 flex justify-center">
          <Link to="/">
            <img
              src={logo}
              alt="FlyControl"
              className="h-48 w-auto object-contain drop-shadow-[0_0_30px_rgba(255,122,0,0.75)]"
            />
          </Link>
        </div>
        <h1 className="text-2xl font-bold">Entrar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Acesse o painel da sua pizzaria.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <PasswordInput
              id="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">ou</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="h-11 w-full gap-2"
          onClick={onGoogleClick}
          disabled={googleLoading}
        >
          <GoogleIcon />
          {googleLoading ? "Redirecionando..." : "Continuar com Google"}
        </Button>

        {/* A conversão passa a começar pelos planos, e não pelo formulário:
            quem ainda não é cliente precisa comparar preço antes de decidir. */}
        <div className="mt-6 space-y-3 border-t border-border pt-5 text-center">
          <p className="text-sm text-muted-foreground">Ainda não possui uma conta?</p>
          <Button asChild variant="outline" className="h-11 w-full">
            <Link to="/plans">Conheça os planos</Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            <Link
              to="/signup"
              search={{ plan: undefined }}
              className="text-primary hover:underline"
            >
              Criar minha conta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
