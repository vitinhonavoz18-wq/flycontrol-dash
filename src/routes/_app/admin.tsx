import { createFileRoute, useNavigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/admin")({ component: AdminLayout });

function AdminLayout() {
  const { user, isSuperAdmin, loading: carregandoSessao, rolesLoading } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const isHardcodedAdmin = user?.email === "vitinhonavoz18@gmail.com";
  const hasAdminAccess = isSuperAdmin || isHardcodedAdmin;
  // Só decide "não é administrador" depois que os papéis chegaram. Antes
  // disso, quem abria um endereço /admin direto (favorito, página
  // recarregada) era mandado embora mesmo sendo administrador — os papéis
  // chegam uma fração de segundo depois da sessão.
  const loading = carregandoSessao || (!isHardcodedAdmin && rolesLoading);

  useEffect(() => {
    if (!loading && !hasAdminAccess) {
      nav({ to: "/dashboard" });
    }
  }, [loading, hasAdminAccess, nav]);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Verificando permissões...</div>;
  }

  if (!hasAdminAccess) {
    return null;
  }

  return <Outlet />;
}
