import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/flycontrol-logo.png";

export const Route = createFileRoute("/signup")({ component: Signup });

function Signup() {
  const { signUp } = useAuth();
  const nav = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await signUp(email, password, fullName);
    if (error) {
      setLoading(false);
      toast.error(error);
      return;
    }
    toast.success("Conta criada com sucesso!");
    nav({ to: "/dashboard" });

  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-glow)]">
        <Link to="/" className="mb-6 flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md" style={{ background: "var(--gradient-primary)" }}>
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold">FlyControl</span>
        </Link>
        <h1 className="text-2xl font-bold">Criar conta</h1>
        <p className="mt-1 text-sm text-muted-foreground">Comece a receber pedidos em minutos.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Seu nome</Label>
            <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Criando..." : "Criar conta"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Já tem conta? <Link to="/login" className="text-primary hover:underline">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
