import { createFileRoute } from "@tanstack/react-router";
import { VitrineDoSiteAdmin } from "@/components/admin/vitrine/VitrineDoSiteAdmin";

/**
 * Vitrine do site: os alimentos que flutuam no topo da página inicial.
 * Fica dentro de /admin, que já barra quem não é administrador da plataforma.
 */
export const Route = createFileRoute("/_app/admin/vitrine-site")({
  component: VitrineDoSiteAdmin,
});
