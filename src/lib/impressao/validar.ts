/**
 * Conferência da comanda ANTES de ir para a impressora.
 *
 * Como o conferente da cozinha que olha a comanda antes de pendurar: "faltou
 * o endereço", "essa linha não cabe no papel", "a soma não fecha". Os avisos
 * aparecem na tela da comanda e no diagnóstico — nunca impedem a impressão
 * (comanda imperfeita na cozinha é melhor que comanda nenhuma).
 */

import type { DadosDaComanda, Linha } from "./comanda";
import type { PerfilDeImpressao } from "./perfil";
import { tamanhoDaLetraMm } from "./perfil";

export type Aviso = {
  nivel: "erro" | "atencao" | "info";
  codigo: string;
  mensagem: string;
};

/** Letras que a impressora em modo texto não tem como desenhar. */
const FORA_DO_BASICO = /[^ -~]/;
const FORA_DO_LATIN1 = /[^ -~¡-ÿ]/;

export function validarLinhas(linhas: Linha[], perfil: PerfilDeImpressao): Aviso[] {
  const avisos: Aviso[] = [];
  const largas = linhas.filter((l) => l.texto.length > perfil.colunas);
  if (largas.length > 0) {
    avisos.push({
      nivel: "erro",
      codigo: "linha-larga",
      mensagem: `${largas.length} linha(s) passam de ${perfil.colunas} letras e seriam cortadas no papel.`,
    });
  }
  const regraDeLetra = perfil.acentos ? FORA_DO_LATIN1 : FORA_DO_BASICO;
  if (linhas.some((l) => regraDeLetra.test(l.texto))) {
    avisos.push({
      nivel: "atencao",
      codigo: "letra-invalida",
      mensagem: "Há letras que a impressora pode não conseguir desenhar.",
    });
  }
  if (linhas.some((l) => /[\r\n\t]/.test(l.texto))) {
    avisos.push({
      nivel: "erro",
      codigo: "quebra-escondida",
      mensagem: "Uma linha carrega uma quebra de linha escondida e pode sair encavalada.",
    });
  }
  const letra = tamanhoDaLetraMm(perfil);
  if (letra < 1.8) {
    avisos.push({
      nivel: "atencao",
      codigo: "letra-pequena",
      mensagem: `Com ${perfil.colunas} letras por linha a letra fica bem pequena. Se ficar difícil de ler, diminua as letras por linha.`,
    });
  }
  return avisos;
}

export function validarDados(dados: DadosDaComanda): Aviso[] {
  const avisos: Aviso[] = [];
  if (dados.itens.length === 0) {
    avisos.push({
      nivel: "atencao",
      codigo: "sem-itens",
      mensagem: "O pedido não tem itens detalhados.",
    });
  }
  if (dados.pedido.tipo === "delivery" && !dados.cliente.endereco) {
    avisos.push({
      nivel: "atencao",
      codigo: "sem-endereco",
      mensagem: "Pedido de entrega sem endereço do cliente.",
    });
  }
  if (!dados.cliente.telefone && dados.pedido.tipo !== "table") {
    avisos.push({
      nivel: "info",
      codigo: "sem-telefone",
      mensagem: "Pedido sem telefone do cliente.",
    });
  }
  if (!dados.pagamento.forma) {
    avisos.push({
      nivel: "info",
      codigo: "sem-pagamento",
      mensagem: "Forma de pagamento não informada.",
    });
  }
  const somaDosItens = dados.itens.reduce((s, i) => s + i.totalCentavos, 0);
  if (
    dados.itens.length > 0 &&
    somaDosItens > 0 &&
    somaDosItens !== dados.valores.subtotalCentavos
  ) {
    avisos.push({
      nivel: "info",
      codigo: "soma-diferente",
      mensagem: "A soma dos itens é diferente do subtotal do pedido (pode ser combo ou promoção).",
    });
  }
  return avisos;
}
