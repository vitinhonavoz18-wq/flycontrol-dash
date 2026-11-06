import { createFileRoute } from "@tanstack/react-router";
import { conferirPortaMaya, lerCorpo, respostaJson } from "@/lib/maya/contexto";
import {
  politicaComercialVigente,
  simularPlanos,
  valoresDaPolitica,
  valoresDaSimulacao,
  MAX_PEDIDOS_SIMULACAO,
} from "@/lib/maya/politicaComercial";
import { MAYA_PROMPT_VERSAO } from "@/lib/maya/prompt";
import { prepararResposta } from "@/lib/maya/sinais";

/**
 * O último filtro antes do cliente.
 *
 *   POST /api/maya/resposta
 *   Authorization: Bearer <MAYA_N8N_SECRET>
 *   { "resposta": "<o que a IA escreveu>", "mensagem_cliente": "<o que o cliente escreveu>",
 *     "pedidos_simulados": [300] }   // opcional: volumes que a IA simulou neste turno
 *
 * Devolve os balões prontos para enviar e as decisões que o n8n executa:
 * transferir para a equipe? registrar que a pessoa não quer mais mensagens?
 *
 * Também aponta valores em R$ que não existem na política (`valores_fora_da_politica`).
 * Isso NÃO bloqueia o envio — é um alarme para a auditoria encontrar preço
 * inventado antes de virar reclamação.
 */
export const Route = createFileRoute("/api/maya/resposta")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const porta = conferirPortaMaya(request);
        if (!porta.ok) return respostaJson({ success: false, error: porta.erro }, porta.status);

        const corpo = await lerCorpo(request);
        if (!corpo) return respostaJson({ success: false, error: "corpo_invalido" }, 400);

        const politica = politicaComercialVigente();
        const permitidos = valoresDaPolitica(politica);
        const simulados = Array.isArray(corpo.pedidos_simulados) ? corpo.pedidos_simulados : [];
        for (const n of simulados.slice(0, 5)) {
          const v = Number(n);
          if (Number.isSafeInteger(v) && v >= 0 && v <= MAX_PEDIDOS_SIMULACAO) {
            permitidos.push(...valoresDaSimulacao(simularPlanos(v)));
          }
        }

        const pronta = prepararResposta(
          corpo.resposta === undefined || corpo.resposta === null ? "" : String(corpo.resposta),
          String(corpo.mensagem_cliente ?? ""),
          permitidos,
        );

        return respostaJson({
          success: true,
          versao_prompt: MAYA_PROMPT_VERSAO,
          versao_politica: politica.versao,
          partes: pronta.partes,
          transferir: pronta.transferir,
          motivo: pronta.motivo,
          opt_out: pronta.optOut,
          valores_fora_da_politica: pronta.valoresForaDaPolitica,
        });
      },
    },
  },
});
