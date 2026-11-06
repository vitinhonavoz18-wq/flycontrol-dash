import { createFileRoute } from "@tanstack/react-router";
import { atenderRotaDaMaya } from "@/lib/maya/portaria";
import { prepararTurno } from "@/lib/maya/orquestrador";
import { repositorioSupabase } from "@/lib/maya/repositorioSupabase";

/**
 * MAYA 2.0 — passo 2: o cliente parou de digitar; hora de pensar.
 *
 *   POST /api/maya/turno   { "mensagem_id": "<o que /entrada devolveu>" }
 *   Cabeçalho: Authorization: Bearer <MAYA_N8N_SECRET>
 *
 * Respostas (campo "acao"):
 *   agrupada      → chegou mensagem mais nova; o turno dela responde. Parar.
 *   silenciar     → equipe assumiu durante a espera, ou proteção anti-loop.
 *   ja_processado → este turno já foi aberto (o n8n repetiu). Parar.
 *   chamar_ia     → chamar a IA com `prompt_sistema` (mensagem de sistema) e
 *                   `mensagens` (a conversa), pedindo resposta em JSON, e
 *                   mandar o resultado para /api/maya/resposta com `turno_id`.
 */
export const Route = createFileRoute("/api/maya/turno")({
  server: {
    handlers: {
      POST: ({ request }) =>
        atenderRotaDaMaya(request, async (corpo, modo) => {
          const id = typeof corpo.mensagem_id === "string" ? corpo.mensagem_id : "";
          if (!id) return { acao: "agrupada", motivo: "sem_mensagem_id" };
          return prepararTurno(repositorioSupabase, id, { modo, agora: new Date() });
        }),
    },
  },
});
