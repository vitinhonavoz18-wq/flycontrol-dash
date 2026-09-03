import { createFileRoute } from "@tanstack/react-router";
import { DocsContent } from "@/components/docs/DocsContent";

export const Route = createFileRoute("/_app/docs")({ component: DocsPage });

// A documentação agora mora na aba "Documentação", dentro de Configurações.
// Esta página continua existindo porque é a única tela que uma loja suspensa
// consegue abrir — como o aviso na porta de uma loja fechada, que explica o
// que aconteceu.
function DocsPage() {
  return (
    <div className="p-6 pb-20 md:p-8">
      <h1 className="mb-6 max-w-4xl text-3xl font-bold">Documentação</h1>
      <DocsContent />
    </div>
  );
}
