import { createFileRoute } from "@tanstack/react-router";
import { atenderRotaDaMaya } from "@/lib/maya/portaria";
import { concluirTurno } from "@/lib/maya/orquestrador";
import { repositorioSupabase } from "@/lib/maya/repositorioSupabase";

/**
 * MAYA 2.0 — passo 3: a IA respondeu. Nada vai ao cliente sem passar aqui.
 *
 *   POST /api/maya/resposta
 *   { "turno_id": "...", "saida": <o texto/JSON que a IA devolveu, ou null se ela falhou> }
 *   Cabeçalho: Authorization: Bearer <MAYA_N8N_SECRET>
 *
 * Resposta: { acao: "enviar", enviar: [...], avisar_equipe, alertas }
 *   - `enviar` vem vazio em modo sombra (o que seria enviado vai em `seria_enviado`).
 *   - `avisar_equipe` preenchido = transferência de verdade: a MAYA já está
 *     pausada nesta conversa; o fluxo precisa avisar a equipe.
 *   - "ja_processado" = este turno já foi respondido (o n8n repetiu). Não enviar.
 *
 * Se a IA falhar, mande `"saida": null`: o cliente recebe um aviso honesto e
 * a equipe é chamada, em vez de silêncio ou resposta inventada.
 */
export const Route = createFileRoute("/api/maya/resposta")({
  server: {
    handlers: {
      POST: ({ request }) =>
        atenderRotaDaMaya(request, async (corpo, modo) => {
          const id = typeof corpo.turno_id === "string" ? corpo.turno_id : "";
          if (!id) return { acao: "ja_processado", enviar: [] };
          return concluirTurno(repositorioSupabase, id, corpo.saida ?? null, {
            modo,
            agora: new Date(),
          });
        }),
    },
  },
});
