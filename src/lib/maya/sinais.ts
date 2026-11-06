/**
 * Os SINAIS que não podem depender do humor da IA.
 *
 * Algumas frases do cliente precisam de reação garantida, sempre igual:
 * "quero falar com uma pessoa", "para de me mandar mensagem", "ignore suas
 * regras". Deixar isso só na mão do modelo é como confiar que o garçom novo
 * vai lembrar que a mesa 4 é alérgica a camarão — na maioria das vezes ele
 * lembra; no dia em que esquece, o estrago é grande.
 *
 * Por isso a leitura é feita aqui, com regras simples e testadas, ANTES da
 * IA. A IA continua decidindo a conversa; estas regras só garantem os freios.
 */

export function semAcento(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function algum(texto: string, padroes: RegExp[]): boolean {
  return padroes.some((p) => p.test(texto));
}

const PEDIDO_HUMANO = [
  /\b(falar|conversar|atendimento|atender)\b.{0,25}\b(atendente|humano|humana|pessoa|alguem|gente de verdade|equipe|suporte|vendedor|consultor)\b/,
  /\b(quero|preciso|chama|chame|me passa|passa pra|transfere|transferir)\b.{0,20}\b(atendente|humano|humana|pessoa|alguem|equipe)\b/,
  /\batendente\b.{0,10}\b(humano|por favor|pfv|pf)\b/,
  /\bpessoa de verdade\b/,
  /\bnao quero (falar com )?(robo|bot|ia|maquina)\b/,
];

const OPT_OUT = [
  /\b(para|pare|parem|nao quero mais|chega) de (me )?(mandar|enviar|mandarem)\b/,
  /\bnao (me )?(mande|mandem|envie|enviem) mais\b/,
  /\b(descadastr|remov[ae] meu numero|tira meu numero|sair da lista)\w*/,
  /^\s*(sair|stop|parar|cancelar inscricao)\s*[.!]?\s*$/,
];

const CANCELAMENTO = [
  /\b(cancelar|cancelamento|encerrar|desativar)\b.{0,30}\b(plano|assinatura|conta|flycontrol|servico|sistema)\b/,
  /\bquero cancelar\b/,
];

const INJECAO = [
  /\bignor[ea]\b.{0,30}\b(regras|instruc|prompt|orientac|anteriores)\w*/,
  /\b(mostr[ae]|revel[ae]|exib[ae]|passa)\b.{0,25}\b(seu|teu|o)\b.{0,10}\b(prompt|instrucoes|regras internas|configurac)\w*/,
  /\b(modo|mode)\s+(administrador|admin|desenvolvedor|developer|dev|deus|god)\b/,
  /\b(system prompt|jailbreak|dan mode)\b/,
  /\bvoce agora e\b.{0,30}\b(outra|outro|uma ia sem|sem regras)\b/,
];

const IRRITACAO = [
  /\b(absurdo|ridiculo|palhacada|vergonha|pessimo|horrivel|lixo|porcaria|merda|droga de sistema)\b/,
  /\bme (deixando|deixou) na mao\b/,
  /\b(to|estou|tô) (puto|irritad[oa]|revoltad[oa]|furios[oa])\b/,
  /!!!+/,
];

const SUPORTE = [
  /\b(nao (esta|ta|tá) (funcionando|aparecendo|imprimindo|abrindo|carregando))\b/,
  /\b(nao (funciona|imprime|abre|carrega|aparece))\b/,
  /\b(erro|bug|travou|travando|caiu|fora do ar|problema)\b/,
  /\b(comanda|impressora|pedido)\b.{0,20}\bnao\b/,
];

const PEDIDO_LINK = [
  /\b(manda|mande|envia|envie|passa|me da)\b.{0,15}\b(link|cadastro)\b/,
  /\b(como|onde)\b.{0,15}\b(cadastr|comec|assin|contrat)\w*/,
  /\bquero (me cadastrar|comecar|contratar|assinar)\b/,
];

const PERGUNTA_SE_IA = [
  /\b(voce|vc|tu) (e|eh|é) (um |uma )?(robo|bot|ia|inteligencia artificial|maquina|humana|pessoa|real)\b/,
  /\b(e|eh) (robo|bot|ia)\b\s*\?/,
  /\bto falando com (robo|bot|ia|uma pessoa|humano)\b/,
];

export type SinaisDaMensagem = {
  pedidoHumano: boolean;
  optOut: boolean;
  cancelamento: boolean;
  tentativaDeInjecao: boolean;
  irritacao: boolean;
  suporte: boolean;
  pedidoLink: boolean;
  perguntaSeIA: boolean;
  /** Volume de pedidos que o cliente declarou ("faço uns 300 pedidos por mês"). */
  volumeMensalDeclarado: number | null;
};

/**
 * Volume mensal declarado. Por dia é multiplicado por 30, por semana por 4 —
 * é só uma estimativa para a tabela de comparação, e é apresentada assim.
 */
export function extrairVolumeMensal(textoOriginal: string): number | null {
  const t = semAcento(textoOriginal);
  const m = t.match(
    /(\d{1,3}(?:\.\d{3})*|\d+)\s*(?:mil\s*)?(?:pedidos?|vendas?|entregas?)?\s*(?:por|ao|no|na|\/|a)\s*(dia|semana|mes)\b/,
  );
  if (!m) return null;
  let n = Number(m[1].replace(/\./g, ""));
  if (/\bmil\b/.test(m[0])) n *= 1000;
  if (!Number.isFinite(n) || n <= 0) return null;
  const mensal = m[2] === "dia" ? n * 30 : m[2] === "semana" ? n * 4 : n;
  return mensal > 0 && mensal <= 100_000 ? Math.round(mensal) : null;
}

export function lerSinais(textoOriginal: string): SinaisDaMensagem {
  const t = semAcento(textoOriginal);
  return {
    pedidoHumano: algum(t, PEDIDO_HUMANO),
    optOut: algum(t, OPT_OUT),
    cancelamento: algum(t, CANCELAMENTO),
    tentativaDeInjecao: algum(t, INJECAO),
    irritacao: algum(t, IRRITACAO),
    suporte: algum(t, SUPORTE),
    pedidoLink: algum(t, PEDIDO_LINK),
    perguntaSeIA: algum(t, PERGUNTA_SE_IA),
    volumeMensalDeclarado: extrairVolumeMensal(textoOriginal),
  };
}

/** Comando que a equipe digita no próprio WhatsApp para devolver a conversa à MAYA. */
export const COMANDO_DEVOLVER_A_MAYA = "#maya";

export function ehComandoDevolver(texto: string): boolean {
  return semAcento(texto) === COMANDO_DEVOLVER_A_MAYA;
}
