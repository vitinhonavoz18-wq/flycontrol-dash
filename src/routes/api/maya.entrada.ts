import { createFileRoute } from "@tanstack/react-router";
import { atenderRotaDaMaya } from "@/lib/maya/portaria";
import { eventoDaUazapi, processarEntrada } from "@/lib/maya/orquestrador";
import { repositorioSupabase } from "@/lib/maya/repositorioSupabase";
import { extrairDaUazapi } from "@/lib/crm/uazapiEvento";

/**
 * MAYA 2.0 — passo 1: chegou uma mensagem no WhatsApp do FlyControl.
 *
 *   Método:    POST
 *   URL:       https://<seu-dominio>/api/maya/entrada
 *   Cabeçalho: Authorization: Bearer <MAYA_N8N_SECRET>
 *   Corpo:     o evento da UAZAPI CRU (como chegou no Webhook do n8n), e,
 *              para áudio/imagem, o campo extra "texto" com a transcrição.
 *
 * Respostas (campo "acao"):
 *   desligado  → MAYA 2.0 desligada (MAYA_V2_MODO). O fluxo não faz nada.
 *   ignorar    → grupo, repetida, eco da própria MAYA.
 *   silenciar  → equipe conduzindo / pausa / opt-out sem resposta.
 *   enviar     → mandar `enviar` ao cliente (vazio em modo sombra) e, se
 *                vier `avisar_equipe`, avisar a equipe.
 *   aguardar   → esperar `aguardar_segundos` e chamar /api/maya/turno com
 *                `mensagem_id` (é a espera que junta mensagens picadas).
 */
export const Route = createFileRoute("/api/maya/entrada")({
  server: {
    handlers: {
      POST: ({ request }) =>
        atenderRotaDaMaya(request, async (corpo, modo) => {
          const evento = eventoDaUazapi(corpo);
          const nome = extrairDaUazapi(corpo)?.nome ?? null;
          return processarEntrada(repositorioSupabase, evento, {
            modo,
            agora: new Date(),
            canal: "whatsapp",
            nome,
          });
        }),
    },
  },
});
