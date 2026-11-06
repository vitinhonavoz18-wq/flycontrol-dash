import { createFileRoute } from "@tanstack/react-router";
import {
  conferirPortaMaya,
  lerCorpo,
  lerEntradaContexto,
  montarContextoMaya,
  respostaJson,
} from "@/lib/maya/contexto";

/**
 * O n8n pergunta: "com que instruções a MAYA responde esta mensagem?"
 *
 *   POST /api/maya/contexto
 *   Authorization: Bearer <MAYA_N8N_SECRET>
 *   { "mensagem": "...", "canal": "whatsapp", "nome": "João",
 *     "primeiro_contato": true, "ferramentas": ["simular_planos"] }
 *
 * Devolve o prompt de sistema já com os preços vigentes, a versão dele e os
 * sinais lidos por regra fixa (pediu humano? pediu para sair?). Não grava nada.
 */
export const Route = createFileRoute("/api/maya/contexto")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const porta = conferirPortaMaya(request);
        if (!porta.ok) return respostaJson({ success: false, error: porta.erro }, porta.status);

        const corpo = await lerCorpo(request);
        if (!corpo) return respostaJson({ success: false, error: "corpo_invalido" }, 400);

        const ctx = montarContextoMaya(lerEntradaContexto(corpo), new Date());
        return respostaJson({
          success: true,
          versao_prompt: ctx.versaoPrompt,
          versao_politica: ctx.versaoPolitica,
          dentro_do_horario_humano: ctx.dentroDoHorarioHumano,
          sinais: ctx.sinais,
          system_prompt: ctx.systemPrompt,
        });
      },
    },
  },
});
