import { createFileRoute } from "@tanstack/react-router";
import { crm } from "@/lib/crm/db";
import { taxaDoBairro, emReais } from "@/lib/crm/ferramentas";
import { rotaDoCrm, respostaCrm, textoOpcional } from "@/lib/crm/rotaCrm";

/**
 * FERRAMENTA DA IA: quanto custa entregar naquele bairro.
 *
 * As taxas são as que o lojista já cadastrou no painel (Minha Loja → zonas de
 * entrega). Nada aqui é inventado.
 *
 * BAIRRO DESCONHECIDO NÃO VIRA CHUTE. Se não está na tabela, a resposta diz
 * isso com todas as letras e manda a IA chamar um humano. Chutar a taxa é
 * prometer ao cliente um preço que a loja não vai honrar — e quem desdiz na
 * porta é o entregador.
 *
 * PARA O N8N (nó de ferramenta — HTTP Request Tool)
 *   POST https://<dominio>/api/crm/delivery-fee
 *   Authorization: Bearer <CRM_N8N_SECRET>
 *   { "tenant_id": "...", "token": "...", "bairro": "Brotas" }
 */

export const Route = createFileRoute("/api/crm/delivery-fee")({
  server: {
    handlers: {
      POST: rotaDoCrm("delivery-fee", async ({ tenantId, corpo }) => {
        const bairro = textoOpcional(corpo.bairro ?? corpo.neighborhood ?? corpo.endereco, 160);

        const { data: zonas, error } = await crm("delivery_zones")
          .select("neighborhood, fee")
          .eq("pizzeria_id", tenantId);

        if (error) throw error;

        const lista = (zonas ?? []) as Array<{ neighborhood: string | null; fee: unknown }>;

        if (!bairro) {
          return respostaCrm({
            success: true,
            encontrado: false,
            texto:
              "Nenhum bairro informado. Pergunte ao cliente em qual bairro é a entrega " +
              (lista.length
                ? `(atendemos: ${lista
                    .map((z) => z.neighborhood)
                    .filter(Boolean)
                    .slice(0, 15)
                    .join(", ")}).`
                : "."),
          });
        }

        const achada = taxaDoBairro(lista, bairro);

        if (!achada) {
          return respostaCrm({
            success: true,
            encontrado: false,
            bairro_perguntado: bairro,
            texto:
              `Não existe taxa cadastrada para "${bairro}". NÃO invente um valor. ` +
              "Diga ao cliente que vai confirmar a taxa de entrega e chame um atendente.",
          });
        }

        return respostaCrm({
          success: true,
          encontrado: true,
          bairro: achada.bairro,
          taxa_cents: achada.taxa_cents,
          taxa: emReais(achada.taxa_cents),
          correspondencia_exata: achada.exata,
          texto:
            achada.taxa_cents === 0
              ? `Entrega em ${achada.bairro}: grátis.`
              : `Taxa de entrega para ${achada.bairro}: ${emReais(achada.taxa_cents)}.`,
        });
      }),
    },
  },
});
