/**
 * Comandas de mentira, para a prévia e para os testes de impressão da
 * configuração. Nenhum dado de cliente real.
 */

import { type Linha, dadosDoPedido, montarComanda } from "./comanda";
import type { PerfilDeImpressao } from "./perfil";
import { centralizar, removerAcentos, separador } from "./texto";

export const PEDIDO_DE_EXEMPLO = {
  id: "00000000-exemplo",
  order_number: 1258,
  created_at: "2026-11-01T23:35:00.000Z",
  order_type: "delivery",
  source: "site",
  customer_name: "João Silva",
  customer_phone: "(71) 99999-9999",
  customer_address: "Rua Exemplo, 150, Apto 302, Bloco B",
  neighborhood: "Stella Maris",
  customer_reference: "Próximo à praça, portão azul",
  items: [
    {
      name: "Pizza Grande",
      quantity: 2,
      unit_price: 45,
      total_price: 90,
      size: "Grande",
      flavors: ["Calabresa"],
      additions: [{ name: "Queijo extra" }],
      notes: "Sem cebola\nBem assada, por favor",
    },
    { name: "Refrigerante 2L", quantity: 1, unit_price: 12, total_price: 12, notes: "Coca-Cola" },
  ],
  subtotal: 102,
  delivery_fee: 5,
  discount: 7,
  total: 100,
  payment_method: "dinheiro",
  payment_status: "pending",
  change_for: 150,
  notes: "Interfone quebrado: ligar quando chegar.",
};

export const LOJA_DE_EXEMPLO = { name: "Pizzaria Exemplo", phone: "(71) 3333-4444" };

export function comandaDeExemplo(perfil: PerfilDeImpressao, agora?: Date): Linha[] {
  return montarComanda(dadosDoPedido(PEDIDO_DE_EXEMPLO, LOJA_DE_EXEMPLO), {
    colunas: perfil.colunas,
    acentos: perfil.acentos,
    linhasNoFinal: perfil.linhasNoFinal,
    agora,
  });
}

/**
 * O teste de alinhamento: mostra NO PAPEL se as letras por linha estão certas.
 *
 * - A régua de números precisa sair numa linha só, de ponta a ponta. Se
 *   quebrou, são letras demais: diminua. Se sobrou papel à direita, aumente.
 * - As setas "<" e ">" precisam encostar nas duas beiradas.
 * - A linha de acentos mostra se a impressora entende as letras do português.
 */
export function testeDeAlinhamento(perfil: PerfilDeImpressao): Linha[] {
  const n = perfil.colunas;
  const ajustar = (t: string) => (perfil.acentos ? t : removerAcentos(t));
  const linhas: Linha[] = [];
  const por = (texto: string, estilo: Linha["estilo"] = "normal") => linhas.push({ texto, estilo });

  por(separador(n, "="));
  for (const l of centralizar(ajustar("TESTE DE ALINHAMENTO"), n)) por(l, "titulo");
  por(separador(n, "="));
  por("");
  let regua = "";
  for (let i = 1; i <= n; i++) regua += String(i % 10);
  por(regua);
  let dezenas = "";
  for (let i = 1; i <= n; i++) dezenas += i % 10 === 0 ? String((i / 10) % 10) : " ";
  por(dezenas.replace(/\s+$/, ""));
  por(`<${"-".repeat(Math.max(0, n - 2))}>`);
  const esq = "ESQUERDA";
  const dir = "DIREITA";
  por(esq + " ".repeat(Math.max(1, n - esq.length - dir.length)) + dir);
  for (const l of centralizar("CENTRO", n)) por(l);
  por("");
  por(ajustar(`Letras por linha: ${n}`), "negrito");
  por("");
  por(ajustar("Acentos:"), "negrito");
  por(ajustar("ÁÉÍÓÚ ÂÊÔ ÃÕ Ç À"));
  por(ajustar("áéíóú âêô ãõ ç à"));
  por(ajustar("Nº 1 - 2ª via - 25°C"));
  por("");
  const valor = "R$ 1.234,56";
  por("Total:" + " ".repeat(Math.max(1, n - 6 - valor.length)) + valor, "titulo");
  por("");
  for (const l of [
    "A linha de números deve caber inteira, sem pular para baixo.",
    "Quebrou? Diminua as letras por linha.",
    "Sobrou papel à direita? Aumente.",
  ]) {
    for (const parte of centralizar(ajustar(l), n)) por(parte);
  }
  por(separador(n, "="));
  for (let i = 0; i < perfil.linhasNoFinal; i++) por("");
  return linhas;
}
