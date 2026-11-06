import { createFileRoute } from "@tanstack/react-router";
import { conferirPortaMaya, lerCorpo, respostaJson } from "@/lib/maya/contexto";
import {
  MAX_PEDIDOS_SIMULACAO,
  lerQuantidadeDePedidos,
  simularPlanos,
} from "@/lib/maya/politicaComercial";

/**
 * A calculadora da MAYA (ferramenta `simular_planos` no n8n).
 *
 *   POST /api/maya/simular-planos
 *   Authorization: Bearer <MAYA_N8N_SECRET>
 *   { "pedidos_por_mes": 300 }
 *
 * A conta é a mesma da fatura: faixas do CENTS, sem retroativo, e o Premium
 * fixo. A IA só lê o `resumo` — ela não faz conta de dinheiro.
 */
export const Route = createFileRoute("/api/maya/simular-planos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const porta = conferirPortaMaya(request);
        if (!porta.ok) return respostaJson({ success: false, error: porta.erro }, porta.status);

        const corpo = await lerCorpo(request);
        if (!corpo) return respostaJson({ success: false, error: "corpo_invalido" }, 400);

        const pedidos = lerQuantidadeDePedidos(corpo.pedidos_por_mes);
        if (!Number.isSafeInteger(pedidos) || pedidos < 0 || pedidos > MAX_PEDIDOS_SIMULACAO) {
          return respostaJson(
            {
              success: false,
              error: "pedidos_invalido",
              message: `Informe um número inteiro de pedidos por mês, entre 0 e ${MAX_PEDIDOS_SIMULACAO}.`,
            },
            400,
          );
        }

        const s = simularPlanos(pedidos);
        return respostaJson({
          success: true,
          pedidos_por_mes: s.pedidosPorMes,
          mais_economico: s.maisEconomico,
          cents_total_cents: s.centsTotalCents,
          premium_mensal_cents: s.premiumMensalCents,
          premium_anual_equivalente_mensal_cents: s.premiumAnualEquivalenteMensalCents,
          cents_detalhe: s.centsDetalhe,
          resumo: s.resumo,
          premissas: s.premissas,
        });
      },
    },
  },
});
