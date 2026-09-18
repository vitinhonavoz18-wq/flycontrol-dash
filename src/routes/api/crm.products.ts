import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { montarCatalogo } from "@/lib/crm/catalogo";
import { procurarProdutos, listarCardapio, emReais } from "@/lib/crm/ferramentas";
import { rotaDoCrm, respostaCrm, textoOpcional } from "@/lib/crm/rotaCrm";

/**
 * FERRAMENTA DA IA: procurar produto no cardápio.
 *
 * POR QUE VIROU FERRAMENTA, EM VEZ DE CARDÁPIO COLADO NO TEXTO
 *
 * Antes, o cardápio inteiro ia grudado no prompt a cada mensagem. Funciona
 * numa loja com 20 pratos; numa com 300 fica caro, lento, e o modelo começa a
 * "perder" itens no meio do texto — como o garçom que decorou tudo de manhã e
 * às 20h já não lembra se a coxinha acabou.
 *
 * Agora ela pergunta só o que precisa, na hora, e recebe o preço de verdade.
 *
 * O `texto` já vem escrito em português para a IA ler direto. Pedir a um
 * modelo que interprete JSON cru gasta mais e erra mais.
 *
 * PARA O N8N (nó de ferramenta — HTTP Request Tool)
 *   POST https://<dominio>/api/crm/products
 *   Authorization: Bearer <CRM_N8N_SECRET>
 *   { "tenant_id": "...", "token": "...", "busca": "pastel de frango" }
 *
 * SEM `busca`, ELA RECEBE O CARDÁPIO INTEIRO. Isso é o conserto de um defeito
 * real: o cliente perguntava "qual é o cardápio?" e a atendente dizia que não
 * sabia, com 23 pratos cadastrados na loja. Ela só sabia responder se já
 * soubesse o nome do prato — o garçom que precisa que você adivinhe o menu.
 */

export const Route = createFileRoute("/api/crm/products")({
  server: {
    handlers: {
      POST: rotaDoCrm("products", async ({ tenantId, corpo }) => {
        const busca = textoOpcional(corpo.busca ?? corpo.termo ?? corpo.query, 120);

        const catalogo = await montarCatalogo(supabaseAdmin, tenantId);

        // SEM TERMO DE BUSCA, VAI O CARDÁPIO. "O que vocês têm?" é a primeira
        // pergunta de quase toda conversa, e ela precisa ter resposta.
        if (!busca) {
          const itens = catalogo.cardapio.flatMap((c) =>
            c.itens.map((i) => ({
              nome: i.nome,
              descricao: i.descricao,
              categoria: i.categoria,
              preco_cents: i.preco_cents,
              preco: emReais(i.preco_cents),
            })),
          );
          return respostaCrm({
            success: true,
            loja: catalogo.loja,
            cardapio_completo: true,
            encontrados: itens,
            texto: listarCardapio(catalogo),
          });
        }

        const achados = procurarProdutos(catalogo, busca, 8);

        const linhas = achados.map((p) => ({
          nome: p.nome,
          descricao: p.descricao,
          categoria: p.categoria,
          preco_cents: p.preco_cents,
          preco: emReais(p.preco_cents),
        }));

        const texto = achados.length
          ? [
              `Produtos encontrados para "${busca}":`,
              ...linhas.map(
                (l) => `- ${l.nome} — ${l.preco}${l.descricao ? ` (${l.descricao})` : ""}`,
              ),
              "",
              "Use EXATAMENTE estes nomes e preços. Não invente valor.",
            ].join("\n")
          : [
              `Nenhum produto encontrado para "${busca}".`,
              catalogo.indisponiveis.length
                ? `Fora do ar hoje: ${catalogo.indisponiveis.slice(0, 8).join("; ")}.`
                : "",
              "Diga ao cliente que hoje não tem esse item e ofereça algo parecido do cardápio.",
            ]
              .filter(Boolean)
              .join("\n");

        return respostaCrm({
          success: true,
          loja: catalogo.loja,
          busca,
          encontrados: linhas,
          texto,
        });
      }),
    },
  },
});
