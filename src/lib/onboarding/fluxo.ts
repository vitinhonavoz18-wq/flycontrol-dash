/**
 * O motor do onboarding: quais perguntas aparecem, em que ordem, e quanto
 * falta.
 *
 * POR QUE ISSO NÃO ESTÁ ESPALHADO NA TELA
 *
 * A alternativa seria a tela decidir "se for a etapa 3, pular a 4". Esse tipo
 * de conta espalhada é onde nasce o defeito clássico: o cliente muda uma
 * resposta lá atrás e o resto do questionário continua acreditando na resposta
 * antiga — como o garçom que já anotou a bebida e não ouve o cliente mudar de
 * ideia.
 *
 * Aqui a lista de etapas visíveis é RECALCULADA a partir das respostas, toda
 * vez. Mudou a resposta, mudou o caminho.
 *
 * O NÚMERO DE ETAPAS NÃO É FIXO
 *
 * Quem não faz entrega responde menos perguntas que quem faz. Por isso a barra
 * de progresso é calculada em cima do caminho DESTE cliente, e não de um total
 * inventado.
 */

import { ETAPAS, etapaPorId, type Etapa, type IdDaEtapa, type Respostas } from "./perguntas";

/** As etapas que este cliente precisa responder, na ordem. */
export function etapasVisiveis(respostas: Respostas): Etapa[] {
  return ETAPAS.filter((e) => (e.aparece ? e.aparece(respostas) : true));
}

/**
 * Respostas que deixaram de valer.
 *
 * O cliente marcou "faço delivery", respondeu sobre entregadores e depois
 * voltou e desmarcou delivery. A resposta sobre entregadores não pode
 * continuar valendo: ela não foi só escondida, ela deixou de ser verdade.
 *
 * É o pedido de sobremesa que some quando o cliente cancela a sobremesa —
 * não fica pendurado na comanda.
 */
export function limparRespostasQueNaoValemMais(respostas: Respostas): Respostas {
  const visiveis = new Set(etapasVisiveis(respostas).map((e) => e.id));
  const limpo: Respostas = {};
  const textos: Partial<Record<IdDaEtapa, string>> = {};

  for (const [chave, valor] of Object.entries(respostas)) {
    if (chave === "textoLivre") continue;
    if (visiveis.has(chave as IdDaEtapa)) {
      (limpo as Record<string, unknown>)[chave] = valor;
    }
  }
  for (const [chave, texto] of Object.entries(respostas.textoLivre ?? {})) {
    if (visiveis.has(chave as IdDaEtapa)) textos[chave as IdDaEtapa] = texto;
  }
  if (Object.keys(textos).length > 0) limpo.textoLivre = textos;
  return limpo;
}

/** Uma etapa está respondida quando tem ao menos uma opção marcada. */
export function respondida(respostas: Respostas, id: IdDaEtapa): boolean {
  return (respostas[id] ?? []).length > 0;
}

/**
 * Onde o cliente deve continuar: a primeira etapa visível ainda sem resposta.
 *
 * É isso que faz o onboarding "continuar de onde parou" quando ele fecha o
 * navegador, troca de celular ou fica sem internet no meio.
 */
export function proximaEtapaPendente(respostas: Respostas): IdDaEtapa | null {
  const visiveis = etapasVisiveis(respostas);
  const pendente = visiveis.find((e) => !respondida(respostas, e.id));
  return pendente?.id ?? null;
}

export function terminou(respostas: Respostas): boolean {
  return proximaEtapaPendente(respostas) === null;
}

/** Quanto do caminho DESTE cliente já foi andado, de 0 a 100. */
export function progresso(respostas: Respostas, etapaAtual: IdDaEtapa | null): number {
  const visiveis = etapasVisiveis(respostas);
  if (visiveis.length === 0) return 100;
  const respondidas = visiveis.filter((e) => respondida(respostas, e.id)).length;
  // Enquanto o cliente está numa etapa, ela já conta como "em andamento":
  // uma barra parada em 0% na primeira pergunta parece que nada aconteceu.
  const emAndamento = etapaAtual && !respondida(respostas, etapaAtual) ? 0.5 : 0;
  return Math.min(100, Math.round(((respondidas + emAndamento) / visiveis.length) * 100));
}

export function indiceDaEtapa(respostas: Respostas, id: IdDaEtapa): number {
  return etapasVisiveis(respostas).findIndex((e) => e.id === id);
}

export function etapaAnterior(respostas: Respostas, id: IdDaEtapa): IdDaEtapa | null {
  const visiveis = etapasVisiveis(respostas);
  const i = visiveis.findIndex((e) => e.id === id);
  return i > 0 ? visiveis[i - 1].id : null;
}

export function etapaSeguinte(respostas: Respostas, id: IdDaEtapa): IdDaEtapa | null {
  const visiveis = etapasVisiveis(respostas);
  const i = visiveis.findIndex((e) => e.id === id);
  return i >= 0 && i < visiveis.length - 1 ? visiveis[i + 1].id : null;
}

/**
 * Guarda as respostas de uma etapa, jogando fora qualquer coisa que não esteja
 * no catálogo.
 *
 * O navegador não é fonte confiável: nada impede alguém de mandar uma resposta
 * inventada direto na requisição. Aqui é o porteiro conferindo o nome na lista
 * em vez de aceitar quem diz "pode deixar, eu sou convidado".
 */
export function aplicarResposta(
  respostas: Respostas,
  id: IdDaEtapa,
  escolhidos: string[],
  texto?: string,
): Respostas {
  const etapa = etapaPorId(id);
  if (!etapa) return respostas;

  const permitidos = new Set(etapa.opcoes.map((o) => o.valor));
  const limpos = [...new Set(escolhidos.filter((v) => permitidos.has(v)))];
  // Pergunta de escolha única guarda uma resposta só, aconteça o que
  // acontecer do outro lado.
  const finais = etapa.multipla ? limpos : limpos.slice(0, 1);

  const novo: Respostas = { ...respostas, [id]: finais };

  // O texto do "Outro" só existe enquanto a opção que pede texto estiver
  // marcada. Desmarcou, o texto vai junto.
  const pedeTexto = etapa.opcoes.some((o) => o.pedeTexto && finais.includes(o.valor));
  const textos = { ...(respostas.textoLivre ?? {}) };
  if (pedeTexto && typeof texto === "string" && texto.trim()) {
    textos[id] = texto.trim().slice(0, 200);
  } else {
    delete textos[id];
  }
  if (Object.keys(textos).length > 0) novo.textoLivre = textos;
  else delete novo.textoLivre;

  // Mudar uma resposta pode ter apagado o caminho de outra: recalcula.
  return limparRespostasQueNaoValemMais(novo);
}

/** O resumo curto da tela de conclusão. */
export function resumo(respostas: Respostas): { icone: string; texto: string }[] {
  const linhas: { icone: string; texto: string }[] = [];
  const rotulos = (id: IdDaEtapa) => {
    const etapa = etapaPorId(id);
    const escolhidos = respostas[id] ?? [];
    return escolhidos
      .map((v) => etapa?.opcoes.find((o) => o.valor === v)?.rotulo)
      .filter((x): x is string => !!x);
  };

  const tipo = rotulos("tipo_de_negocio")[0];
  if (tipo) {
    const icone =
      etapaPorId("tipo_de_negocio")?.opcoes.find(
        (o) => o.valor === (respostas.tipo_de_negocio ?? [])[0],
      )?.icone ?? "🏪";
    linhas.push({ icone, texto: tipo });
  }

  const atendimento = rotulos("modelo_de_atendimento");
  if (atendimento.length) linhas.push({ icone: "🛵", texto: atendimento.join(" + ") });

  const volume = rotulos("volume_mensal")[0];
  if (volume) linhas.push({ icone: "📦", texto: `${volume} pedidos/mês` });

  const canais = rotulos("canais_de_pedido");
  if (canais.length) linhas.push({ icone: "💬", texto: canais.slice(0, 3).join(" + ") });

  return linhas;
}
