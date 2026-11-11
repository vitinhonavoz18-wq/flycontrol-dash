import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, X } from "lucide-react";
import { BrandLogo, BrandSymbol } from "@/components/brand/BrandLogo";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { BrandTransitionNotice } from "@/components/brand/BrandTransitionNotice";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/mobile/BottomNav";
import { GuiaDeConfiguracao } from "@/components/onboarding/guia/GuiaDeConfiguracao";
import { FaturaEmAbertoPopup } from "@/components/billing/FaturaEmAbertoPopup";
import { PlanProvider, usePlan } from "@/lib/plan-context";
import { itemEstaAtivo, montarMenu } from "@/lib/navegacao";

/** Chave no navegador que lembra se o menu lateral está recolhido. */
const CHAVE_MENU_RECOLHIDO = "flydelivery.menu-recolhido";

export const Route = createFileRoute("/_app")({ component: AppLayout });

function AppLayout() {
  return (
    <PlanProvider>
      <AppLayoutInner />
    </PlanProvider>
  );
}

function AppLayoutInner() {
  const { user, loading, isSuperAdmin, signOut } = useAuth();
  const { hasFeature } = usePlan();
  const { theme, setTheme } = useTheme();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Menu lateral recolhido (só ícones) — vale para o computador. Quem trabalha
  // com o quadro de pedidos aberto o dia inteiro ganha a largura de uma
  // coluna a mais. A escolha fica guardada no aparelho.
  const [menuRecolhido, setMenuRecolhido] = useState(false);
  useEffect(() => {
    try {
      setMenuRecolhido(localStorage.getItem(CHAVE_MENU_RECOLHIDO) === "1");
    } catch {
      // Sem armazenamento: o menu simplesmente começa aberto.
    }
  }, []);
  useEffect(() => {
    // A faixa fixa de "Finalizar pedido" precisa saber onde o menu termina.
    // Este atributo troca o token `--sidebar-width` no CSS (ver styles.css).
    const raiz = document.documentElement;
    if (menuRecolhido) raiz.dataset.menu = "recolhido";
    else delete raiz.dataset.menu;
    return () => {
      delete raiz.dataset.menu;
    };
  }, [menuRecolhido]);
  function alternarMenu() {
    setMenuRecolhido((atual) => {
      const novo = !atual;
      try {
        localStorage.setItem(CHAVE_MENU_RECOLHIDO, novo ? "1" : "0");
      } catch {
        // Sem armazenamento: vale só até recarregar a página.
      }
      return novo;
    });
  }
  const [pizzeriaStatus, setPizzeriaStatus] = useState<{
    // O `id` entrou junto porque o guia de configuração precisa saber QUAL
    // loja é, para montar o pedido de treino com um produto do cardápio dela.
    id: string;
    is_active: boolean;
    subscription_status: string;
  } | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [loading, user, nav]);

  // Load pizzeria status ONCE per authenticated session. Do NOT depend on
  // `path` — re-running on every navigation used to force the whole layout
  // into a "Carregando..." early-return, unmounting realtime providers.
  useEffect(() => {
    let cancelled = false;
    async function checkPizzeriaStatus() {
      if (!user || isSuperAdmin || loading) return;

      const params = new URLSearchParams(window.location.search);
      const pizzeriaId = params.get("pizzeriaId");

      let query = supabase.from("pizzerias").select("id, is_active, subscription_status");

      if (pizzeriaId) {
        query = query.eq("id", pizzeriaId);
      } else {
        query = query
          .eq("owner_id", user.id)
          .neq("status", "deleted")
          .neq("status", "inactive")
          .order("created_at")
          .limit(1);
      }

      const { data, error } = await query.maybeSingle();
      if (cancelled) return;

      if (!error && data) {
        setPizzeriaStatus({
          id: data.id,
          is_active: data.is_active ?? true,
          subscription_status: data.subscription_status ?? "active",
        });
      }
    }

    void checkPizzeriaStatus();
    return () => {
      cancelled = true;
    };
  }, [user, isSuperAdmin, loading]);

  // ── O QUESTIONÁRIO ANTIGO FOI APOSENTADO ─────────────────────────────────
  //
  // Aqui existia uma porta que mandava todo lojista novo para `/preparar`
  // antes de ver o painel: um questionário de sete perguntas sobre o negócio.
  //
  // Quem faz esse trabalho agora é o GUIA DE CONFIGURAÇÃO, e ele faz melhor:
  // em vez de perguntar "que tipo de negócio você tem?", ele leva o lojista
  // até a tela e confere no banco se a loja ficou configurada de verdade.
  //
  // Manter os dois era pedir a mesma coisa duas vezes de jeitos diferentes —
  // o formulário na portaria e a mesma pergunta de novo na recepção.
  //
  // O que sumiu foi a PORTA, não a tela: `/preparar` continua de pé para quem
  // tiver o endereço, e sozinha manda para o painel quando não há nada
  // pendente. E as respostas de quem já respondeu continuam guardadas.

  if (loading || !user) {
    return <BrandLoader />;
  }

  // Block access if inactive and not super admin
  const isHardcodedAdmin = user?.email === "vitinhonavoz18@gmail.com";
  const isSuspended =
    pizzeriaStatus &&
    (pizzeriaStatus.subscription_status === "suspended" || !pizzeriaStatus.is_active);
  const isBlocked = isSuspended && !isSuperAdmin && !isHardcodedAdmin;

  // We block if inactive, not super admin, and trying to access anything other than docs or if explicitly blocked
  // "/billing" também escapa do bloqueio: é lá que a fatura em atraso tem o
  // botão de pagamento. Bloquear essa página junto trancaria quem foi
  // suspenso por falta de pagamento numa tela sem nenhum jeito de pagar.
  const shouldBlock =
    isBlocked && !path.startsWith("/admin") && path !== "/docs" && path !== "/billing";

  if (shouldBlock) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
          <X className="h-10 w-10 text-destructive" />
        </div>
        <h1 className="mb-2 text-2xl font-bold">Loja Suspensa</h1>
        <p className="mb-8 max-w-md text-muted-foreground">
          Esta loja está temporariamente suspensa. Se for por falta de pagamento, regularize na tela
          de cobrança. Se não for, entre em contato com o suporte.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => nav({ to: "/billing" })}>Ver cobrança e pagar</Button>
          <Button
            variant="outline"
            onClick={async () => {
              await signOut();
              nav({ to: "/login" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sair da conta
          </Button>
        </div>
      </div>
    );
  }

  if (loading || !user) {
    return <BrandLoader />;
  }

  const showAdmin = isSuperAdmin || isHardcodedAdmin;
  // O desenho do menu (grupos, itens, quem vê o quê) mora em `lib/navegacao`.
  const grupos = montarMenu({ temRecurso: hasFeature, ehAdminDaPlataforma: showAdmin });

  /**
   * A lista de itens. `compacto` é o menu recolhido do computador: só ícones.
   *
   * No celular deitado o menu já vira um trilho de ícones por conta própria
   * (as classes `landscape-compact:`), com ou sem `compacto`.
   */
  const NavItems = ({ compacto = false }: { compacto?: boolean }) => (
    <nav
      aria-label="Menu principal"
      className={`flex-1 space-y-5 px-3 py-4 landscape-compact:space-y-2 landscape-compact:p-1.5 ${compacto ? "md:space-y-2 md:px-2" : ""}`}
    >
      {grupos.map((grupo, indice) => (
        <div key={grupo.id} role="group" aria-label={grupo.titulo}>
          <div
            className={`px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground landscape-compact:hidden ${compacto ? "md:hidden" : ""}`}
          >
            {grupo.titulo}
          </div>
          {/* Sem o título (menu recolhido), um risco fino separa os grupos. */}
          {indice > 0 && (
            <div
              aria-hidden="true"
              className={`mx-2 mb-2 hidden border-t border-sidebar-border landscape-compact:block ${compacto ? "md:block" : ""}`}
            />
          )}
          <ul className="space-y-0.5">
            {grupo.itens.map((it) => {
              const ativo = itemEstaAtivo(it, path);
              return (
                <li key={it.to}>
                  <Link
                    to={it.to}
                    onClick={() => setIsMobileMenuOpen(false)}
                    // `title` e `aria-label` mantêm o item identificável quando
                    // o rótulo some — um ícone sozinho não diz nada a um leitor
                    // de tela.
                    title={it.label}
                    aria-label={it.label}
                    aria-current={ativo ? "page" : undefined}
                    className={`group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary landscape-compact:h-11 landscape-compact:justify-center landscape-compact:px-0 ${compacto ? "md:h-11 md:justify-center md:px-0" : ""} ${
                      ativo
                        ? "bg-primary/10 font-semibold text-primary-ink"
                        : "font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    {/* A barrinha laranja à esquerda marca "você está aqui"
                        sem depender só da cor do fundo. */}
                    {ativo && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary"
                      />
                    )}
                    <it.icon
                      aria-hidden="true"
                      className={`h-[18px] w-[18px] shrink-0 landscape-compact:h-5 landscape-compact:w-5 ${compacto ? "md:h-5 md:w-5" : ""} ${ativo ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-accent-foreground"}`}
                    />
                    <span
                      className={`truncate landscape-compact:hidden ${compacto ? "md:hidden" : ""}`}
                    >
                      {it.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const temaEscuro = theme === "dark";
  const nomeDoUsuario = user.email?.split("@")[0] ?? "";

  return (
    <div className="flex min-h-screen bg-background">
      {/* Menu lateral — computador */}
      {/* Em paisagem de celular o menu vira um trilho de ícones: 288px de
          largura consumiam metade de uma tela de 360px. `overflow-y-auto`
          garante que os itens continuem alcançáveis quando a altura é
          mínima. O mesmo trilho é usado quando o lojista recolhe o menu no
          computador. */}
      <aside
        data-recolhido={menuRecolhido ? "sim" : undefined}
        className={`sticky top-0 z-20 hidden h-screen w-72 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex landscape-compact:w-[var(--landscape-rail-width)] ${menuRecolhido ? "md:w-[var(--landscape-rail-width)]" : ""}`}
      >
        <div
          className={`flex h-16 shrink-0 items-center border-b border-sidebar-border px-4 landscape-compact:h-12 landscape-compact:justify-center landscape-compact:px-2 ${menuRecolhido ? "md:justify-center md:px-2" : "justify-between"}`}
        >
          <Link
            to="/dashboard"
            aria-label="FlyDelivery — ir para os pedidos"
            className="flex items-center text-foreground"
          >
            {/* Recolhido ou deitado: só o símbolo. Aberto: símbolo e letreiro. */}
            <BrandSymbol
              eager
              className={`h-7 landscape-compact:block ${menuRecolhido ? "md:block" : "hidden"}`}
            />
            <BrandLogo
              eager
              className={`h-9 landscape-compact:hidden ${menuRecolhido ? "md:hidden" : ""}`}
            />
          </Link>
          <button
            type="button"
            onClick={alternarMenu}
            aria-label="Recolher o menu"
            title="Recolher o menu"
            className={`grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary landscape-compact:hidden ${menuRecolhido ? "md:hidden" : ""}`}
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {menuRecolhido && (
          <button
            type="button"
            onClick={alternarMenu}
            aria-label="Abrir o menu"
            title="Abrir o menu"
            className="mx-auto mt-2 hidden h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary md:grid landscape-compact:hidden"
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        <NavItems compacto={menuRecolhido} />

        <div className="mt-auto shrink-0 space-y-1 border-t border-sidebar-border p-3 landscape-compact:p-1.5">
          {/* O seletor de tema não cabe no trilho — continua acessível no
              menu aberto e no menu do celular. */}
          <div
            className={`flex h-10 items-center justify-between rounded-lg px-3 landscape-compact:hidden ${menuRecolhido ? "md:hidden" : ""}`}
          >
            <label
              htmlFor="theme-toggle"
              className="flex cursor-pointer items-center gap-3 text-sm font-medium text-sidebar-foreground"
            >
              {temaEscuro ? (
                <Moon className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
              ) : (
                <Sun className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
              )}
              Modo escuro
            </label>
            <Switch
              id="theme-toggle"
              checked={temaEscuro}
              onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            />
          </div>

          <div
            className={`flex items-center gap-3 rounded-lg px-2 py-2 landscape-compact:justify-center landscape-compact:px-0 ${menuRecolhido ? "md:justify-center md:px-0" : ""}`}
          >
            <span
              aria-hidden="true"
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold uppercase text-primary-ink landscape-compact:hidden ${menuRecolhido ? "md:hidden" : ""}`}
            >
              {nomeDoUsuario.charAt(0) || "?"}
            </span>
            <div
              className={`min-w-0 flex-1 landscape-compact:hidden ${menuRecolhido ? "md:hidden" : ""}`}
            >
              <div className="truncate text-sm font-semibold text-foreground">{nomeDoUsuario}</div>
              <div className="truncate text-xs text-muted-foreground">{user.email}</div>
            </div>
            <button
              type="button"
              title="Sair"
              aria-label="Sair da conta"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline focus-visible:outline-2 focus-visible:outline-destructive landscape-compact:h-11 landscape-compact:w-11"
              onClick={async () => {
                await signOut();
                nav({ to: "/" });
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {/* Cabeçalho e menu do celular */}
      {/* `min-w-0` não é enfeite: sem ele, esta coluna cresce junto com o
          conteúdo mais largo da tela e empurra a página inteira para o lado.
          Era isso que fazia o painel deslizar na horizontal no celular — o
          Dashboard chegava a 1067px de largura numa tela de 390px. O
          `overflow-x-hidden` que já existia no <main> não resolvia, porque
          quem estava esticando era esta caixa aqui de fora. */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Cabeçalho mais baixo com o aparelho deitado: 64px de altura em uma
            tela de 360px é 18% do espaço vertical. `safe-x` afasta o conteúdo
            de recortes laterais, que só existem em paisagem. */}
        <header className="safe-x sticky top-0 z-[var(--z-bottom-nav)] flex h-14 items-center justify-between border-b border-border bg-background px-4 md:hidden landscape-compact:h-[var(--landscape-header-height)]">
          <Link
            to="/dashboard"
            aria-label="FlyDelivery — ir para os pedidos"
            className="flex items-center text-foreground"
          >
            <BrandLogo eager className="h-8" />
          </Link>

          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir o menu">
                <Menu className="h-6 w-6" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[288px] border-sidebar-border bg-sidebar p-0">
              <div className="flex h-full flex-col overflow-y-auto">
                <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4 text-foreground">
                  <BrandLogo className="h-8" />
                </div>
                <NavItems />
                <div className="mt-auto shrink-0 space-y-2 border-t border-sidebar-border p-3">
                  <div className="flex h-11 items-center justify-between rounded-lg px-3">
                    <label
                      htmlFor="theme-toggle-mobile"
                      className="flex items-center gap-3 text-sm font-medium text-sidebar-foreground"
                    >
                      {temaEscuro ? (
                        <Moon
                          className="h-[18px] w-[18px] text-muted-foreground"
                          aria-hidden="true"
                        />
                      ) : (
                        <Sun
                          className="h-[18px] w-[18px] text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                      Modo escuro
                    </label>
                    <Switch
                      id="theme-toggle-mobile"
                      checked={temaEscuro}
                      onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={async () => {
                      await signOut();
                      nav({ to: "/" });
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sair
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </header>

        {/* `pb-bottom-nav` reserva a altura da barra inferior + safe area a
            partir do token global. Este é o ÚNICO lugar que aplica esse
            padding — telas filhas não devem repeti-lo. */}
        <main className="pb-bottom-nav relative flex-1 overflow-x-hidden">
          {/* "O FlyControl evoluiu. Agora somos FlyDelivery." — só para quem
              já era cliente, dispensável, e some sozinho depois do período de
              transição. */}
          <BrandTransitionNotice userCreatedAt={user.created_at} />
          <Outlet />
        </main>
        <BottomNav />
      </div>

      {/* ── O GUIA DE CONFIGURAÇÃO ──────────────────────────────────────────
          Fica aqui fora, no nível do painel inteiro, porque ele escurece e
          bloqueia TODAS as telas — não só a que está aberta. Dentro do
          <main> ele não alcançaria o menu lateral nem a barra de baixo, e o
          lojista escaparia do guia pelo próprio menu.

          Quem decide se ele aparece é o servidor, a cada leitura, olhando a
          loja de verdade. Administrador da plataforma não tem loja para
          configurar e nunca vê o guia. */}
      <GuiaDeConfiguracao habilitado={!isSuperAdmin} tenantId={pizzeriaStatus?.id ?? null} />

      {/* Aviso de fatura do plano: aparece no dia em que o mês fecha e a
          fatura é emitida, em qualquer tela do painel — menos na de cobrança,
          onde o botão de pagar já está à vista. */}
      <FaturaEmAbertoPopup
        companyId={isSuperAdmin ? null : (pizzeriaStatus?.id ?? null)}
        oculto={path === "/billing"}
      />
    </div>
  );
}
