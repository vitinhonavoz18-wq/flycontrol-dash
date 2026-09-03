import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PizzeriaSelector } from "@/components/pizzerias/PizzeriaSelector";
import { MenuManager } from "@/components/menu/MenuManager";
import type { LojaDoSeletor } from "@/components/pizzerias/PizzeriaSelector";

export const Route = createFileRoute("/_app/menu")({ component: MenuPage });

function MenuPage() {
  const { user, isSuperAdmin } = useAuth();
  const [pizzerias, setPizzerias] = useState<LojaDoSeletor[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadPizzerias();
  }, [user]);

  async function loadPizzerias() {
    setLoading(true);
    let query = supabase
      .from("pizzerias")
      .select("*")
      .neq("status", "deleted")
      .neq("status", "inactive")
      .order("name");

    if (!isSuperAdmin && user?.id) {
      query = query.eq("owner_id", user.id);
    }

    const { data, error } = await query;
    if (error) {
      toast.error("Erro ao carregar pizzarias: " + error.message);
      setLoading(false);
      return;
    }

    setPizzerias(data ?? []);
    if (data && data.length) {
      const params = new URLSearchParams(window.location.search);
      const pId = params.get("pizzeriaId");
      if (pId && data.some((p) => p.id === pId)) {
        setActiveId(pId);
      } else {
        setActiveId(data[0].id);
      }
    }
    setLoading(false);
  }

  if (loading) {
    // `min-h-[50dvh]` e não `min-h-screen`: este bloco vive dentro do <main>,
    // que já reserva a altura da barra inferior. A tela cheia criava uma
    // segunda rolagem e empurrava o indicador para fora da área visível.
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!pizzerias.length) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold">Nenhuma loja encontrada</h1>
        <p className="text-muted-foreground mt-2">
          Sua conta ainda não tem nenhuma loja cadastrada. Cadastre uma em Configurações para
          começar a montar o cardápio.
        </p>
        <Button asChild className="mt-4">
          <Link to="/settings">Cadastrar loja</Link>
        </Button>
      </div>
    );
  }

  return (
    // Padding lateral menor no celular (16px) e animação de entrada mais curta:
    // 500ms era tempo suficiente para o usuário ver a página "chegando".
    <div className="space-y-6 p-4 duration-200 animate-in fade-in sm:p-6 md:space-y-8 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Cardápio</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Gerencie as categorias, produtos e preços da sua loja.
          </p>
        </div>
        {/* O seletor ocupa a largura toda no celular e encolhe no desktop. */}
        <div className="w-full min-w-0 md:w-auto md:shrink-0">
          <PizzeriaSelector pizzerias={pizzerias} activeId={activeId} onSelect={setActiveId} />
        </div>
      </div>

      {activeId && <MenuManager pizzeriaId={activeId} />}
    </div>
  );
}
