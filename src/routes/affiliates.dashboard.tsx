import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { LogoDoPortal } from "@/components/afiliados/portal/Casca";
import { EstadoDaConta } from "@/components/afiliados/portal/EstadoDaConta";
import { PerfilContexto } from "@/components/afiliados/portal/perfilContexto";
import { MenuDeBaixo, MenuLateral } from "@/components/afiliados/portal/MenuDoPortal";
import { Carregando, Erro } from "@/components/afiliados/portal/Pecas";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePerfilDoAfiliado } from "@/lib/afiliados/portal";
import { mensagemDeErro } from "@/lib/afiliados/validacao";

export const Route = createFileRoute("/affiliates/dashboard")({ component: PainelDoParceiro });

/**
 * A portaria do painel. Na ordem:
 *
 * 1. não entrou → vai para "entrar";
 * 2. entrou mas não é parceiro → convite para se cadastrar;
 * 3. parceiro em análise, suspenso ou bloqueado → explicação, sem números
 *    (em análise e suspenso ainda podem ajustar os próprios dados);
 * 4. parceiro ativo → painel completo.
 *
 * A portaria é CONFORTO, não segurança: quem decide o que cada um vê é o
 * banco. Mesmo que alguém pulasse esta tela, as funções do banco recusam
 * qualquer número para quem não é parceiro ativo.
 */
function PainelDoParceiro() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const caminho = useRouterState({ select: (s) => s.location.pathname });
  const perfil = usePerfilDoAfiliado(user?.id);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/affiliates/login" });
  }, [loading, user, nav]);

  async function sair() {
    await supabase.auth.signOut();
    // O que ficou guardado na memória do navegador é do parceiro que saiu.
    // Quem entrar depois no mesmo aparelho não pode ver nem por um segundo.
    queryClient.removeQueries({ queryKey: ["afiliado"] });
    nav({ to: "/affiliates/login" });
  }

  if (loading || !user || perfil.isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Carregando linhas={4} altura="h-24" />
      </div>
    );
  }

  if (perfil.isError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Erro mensagem={mensagemDeErro(perfil.error)} tentarDeNovo={() => perfil.refetch()} />
      </div>
    );
  }

  if (!perfil.data) {
    return <EstadoDaConta situacao="sem_cadastro" email={user.email} aoSair={sair} />;
  }

  const dados = perfil.data;
  const naConfiguracao = caminho.replace(/\/+$/, "") === "/affiliates/dashboard/settings";

  if (dados.status !== "active") {
    // Em análise e suspenso podem cuidar dos próprios dados (Pix, telefone).
    // Bloqueado não entra em lugar nenhum.
    if (naConfiguracao && dados.status !== "blocked") {
      return (
        <PerfilContexto.Provider value={dados}>
          <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">
            <button
              type="button"
              onClick={() => nav({ to: "/affiliates/dashboard" })}
              className="mb-4 text-sm text-white/55 hover:text-white"
            >
              ← Voltar
            </button>
            <Outlet />
          </main>
        </PerfilContexto.Provider>
      );
    }
    return <EstadoDaConta situacao={dados.status} email={user.email} aoSair={sair} />;
  }

  return (
    <PerfilContexto.Provider value={dados}>
      <div className="flex min-h-dvh">
        <MenuLateral nome={dados.nome} aoSair={sair} />
        <main className="min-w-0 flex-1 px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
          <div className="mx-auto w-full max-w-6xl">
            <div className="mb-5 lg:hidden">
              <LogoDoPortal />
            </div>
            <Outlet />
          </div>
        </main>
        <MenuDeBaixo aoSair={sair} />
      </div>
    </PerfilContexto.Provider>
  );
}
