/**
 * DE QUAL WHATSAPP SAI A ATUALIZAÇÃO DO PEDIDO.
 *
 * O DEFEITO QUE ISTO CONSERTA
 *
 * O botão "Enviar ao cliente" caía sempre no modo manual — "Abrir conversa
 * (só texto)" — e a arte nunca ia junto. Não era falta de fluxo nem de
 * automação: o FlyStatus procurava o aparelho numa gaveta, e o WhatsApp que o
 * lojista ligou pelo QR Code do Chat estava guardado em OUTRA.
 *
 * É o garçom procurando a comanda na gaveta do caixa enquanto ela está na do
 * balcão: as duas são gavetas da mesma loja, e ele jurava que a comanda tinha
 * sumido.
 *
 * A ORDEM DE PREFERÊNCIA, E POR QUÊ
 *
 * 1. O APARELHO DA PRÓPRIA LOJA (o do QR Code do Chat). É o certo: cada loja
 *    fala pelo próprio número. E quando o dono religa o WhatsApp, o token
 *    muda sozinho ali — nada precisa ser reconfigurado à mão.
 *
 * 2. O aparelho geral do FlyControl, se estiver configurado no servidor. Fica
 *    como rede de segurança para uma loja que ainda não ligou o próprio.
 *
 * SEM ENDEREÇO DO FORNECEDOR, NADA SAI. Um token sem endereço é uma chave sem
 * porta: não adianta ter.
 */

export type AparelhoDeEnvio = {
  baseUrl: string;
  /** Vai no cabeçalho `token`. */
  token: string;
  /**
   * Vai no cabeçalho `instance`, e SÓ existe no aparelho geral. O token da
   * própria loja já aponta para o aparelho dela: mandar um `instance` junto
   * seria dizer o endereço errado para uma carta que já tem o certo.
   */
  instancia: string | null;
  /** Qual caminho foi usado — aparece no registro do servidor. */
  origem: "loja" | "geral";
};

function limpo(v: unknown): string {
  return String(v ?? "").trim();
}

export function escolherAparelho(entrada: {
  baseUrl: unknown;
  /** Token do aparelho desta loja (`whatsapp_instance_secrets`, o do QR Code). */
  tokenDaLoja: unknown;
  /** Token geral do FlyControl (`UAZAPI_TOKEN` no servidor). */
  tokenGeral: unknown;
  /** Identificação do aparelho geral (`marketing_whatsapp_instances`). */
  instanciaGeral: unknown;
}): AparelhoDeEnvio | null {
  const baseUrl = limpo(entrada.baseUrl).replace(/\/+$/, "");
  if (!baseUrl) return null;

  const daLoja = limpo(entrada.tokenDaLoja);
  if (daLoja) return { baseUrl, token: daLoja, instancia: null, origem: "loja" };

  const geral = limpo(entrada.tokenGeral);
  const instancia = limpo(entrada.instanciaGeral);
  // O aparelho geral precisa dos DOIS: o token diz quem fala, a instância diz
  // por qual número. Um sem o outro manda a mensagem para o lugar errado ou
  // não manda nada.
  if (geral && instancia) return { baseUrl, token: geral, instancia, origem: "geral" };

  return null;
}
