import { createFileRoute } from "@tanstack/react-router";
import { DocsContent } from "@/components/docs/DocsContent";

/**
 * A documentação saiu do menu: agora ela é a aba "Documentos" dentro de
 * Configurações.
 *
 * Esta rota continua existindo de propósito. Quem salvou /docs nos favoritos,
 * ou recebeu o link por mensagem, continua chegando ao mesmo conteúdo — tirar
 * a rota transformaria esses links em erro 404 sem ganho nenhum.
 */
export const Route = createFileRoute("/_app/docs")({ component: DocsPage });

function DocsPage() {
  return <DocsContent />;
}
