import { z } from "zod";
import {
  LISTA_DE_INTENCOES,
  LISTA_DE_PROXIMAS_ACOES,
  type FichaDoLead,
  type Intencao,
  type ProximaAcao,
} from "./prompt";
import { semAcento } from "./sinais";

/**
 * O CONFERENTE DA SAÍDA: nada que a IA escreve vai direto para o cliente.
 *
 * A IA é ótima de conversa e péssima de garantia. Ela pode, num dia ruim:
 *   - devolver o JSON cru em vez do texto ("{"mensagem": ...") — e o cliente
 *     receberia aquele código no WhatsApp;
 *   - dizer "pronto, agendei sua reunião para amanhã às 15h" sem existir
 *     agenda nenhuma;
 *   - inventar "protocolo nº 48213";
 *   - lembrar o preço antigo de R$ 375.
 *
 * Este arquivo é a conferência na saída da cozinha: o prato só sai se estiver
 * certo. Se não estiver, sai uma resposta segura e a equipe é chamada — em vez
 * de o cliente receber uma promessa que ninguém vai cumprir.
 */

const esquemaFicha = z
  .object({
    nome_estabelecimento: z.string().trim().max(120).optional(),
    segmento: z.string().trim().max(80).optional(),
    volume_pedidos_mes: z.coerce.number().int().positive().max(100_000).optional(),
    plano_de_interesse: z.enum(["cents", "premium", "premium_anual", "indefinido"]).optional(),
    objetivo: z.string().trim().max(200).optional(),
  })
  .partial()
  .catch({});

const esquemaSaida = z.object({
  mensagem: z.string().trim().min(1).max(4000),
  intencao: z
    .string()
    .transform((v) => v.toUpperCase())
    .pipe(z.enum(LISTA_DE_INTENCOES as [Intencao, ...Intencao[]]))
    .catch("OUTRO"),
  proxima_acao: z
    .string()
    .transform((v) => v.toUpperCase())
    .pipe(z.enum(LISTA_DE_PROXIMAS_ACOES as [ProximaAcao, ...ProximaAcao[]]))
    .catch("RESPONDER"),
  // `z.coerce.boolean()` transformaria o texto "false" em verdadeiro (texto
  // não vazio). Aqui só vale true de verdade ou o texto "true".
  precisa_humano: z.preprocess((v) => v === true || v === "true", z.boolean()).catch(false),
  motivo_humano: z.string().max(200).nullable().optional().catch(null),
  ficha: esquemaFicha.optional(),
});

export type SaidaConferida = {
  mensagem: string;
  intencao: Intencao;
  proximaAcao: ProximaAcao;
  precisaHumano: boolean;
  motivoHumano: string | null;
  ficha: FichaDoLead;
  /** O que o conferente precisou corrigir. Vai para o registro, nunca para o cliente. */
  alertas: string[];
  /** A resposta da IA foi descartada e trocada por uma segura. */
  substituida: boolean;
};

export const RESPOSTA_SEGURA =
  "Essa parte eu prefiro confirmar com a equipe pra não te passar informação errada. Já estou chamando alguém para continuar com você por aqui. 😊";

export const RESPOSTA_DE_FALHA =
  "Tive uma instabilidade aqui e não quero te responder errado 😅 Já chamei alguém da equipe para continuar com você.";

/** Tira o ```json ... ``` que alguns modelos colocam em volta. */
function tirarCerca(texto: string): string {
  return texto
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function primeiroObjeto(texto: string): unknown {
  const limpo = tirarCerca(texto);
  try {
    return JSON.parse(limpo);
  } catch {
    const ini = limpo.indexOf("{");
    const fim = limpo.lastIndexOf("}");
    if (ini >= 0 && fim > ini) {
      try {
        return JSON.parse(limpo.slice(ini, fim + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** WhatsApp não entende markdown de título/negrito duplo; deixa o texto limpo. */
export function limparFormatacao(texto: string): string {
  return texto
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "R$ 89,90", "R$89,90", "R$ 1.078,80", "R$ 375" → centavos. */
export function valoresEmReais(texto: string): number[] {
  const achados: number[] = [];
  const re = /R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const reais = Number(m[1].replace(/\./g, ""));
    const cent = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
    achados.push(reais * 100 + cent);
  }
  return achados;
}

/** Frases que afirmam uma ação que a MAYA não tem como executar. */
const ACOES_FINGIDAS: { padrao: RegExp; alerta: string }[] = [
  {
    padrao:
      /\b(agendei|agendado|agendada|reuniao (esta |ficou )?(marcada|confirmada)|horario (esta |ficou )?(marcado|confirmado))\b/,
    alerta: "afirmou_agendamento",
  },
  { padrao: /\bprotocolo\b.{0,15}\d{3,}/, alerta: "inventou_protocolo" },
  {
    padrao: /\b(cancelei|cancelado com sucesso|seu plano foi (alterado|cancelado|trocado))\b/,
    alerta: "afirmou_mudanca_de_conta",
  },
  {
    padrao: /\b(apliquei|liberei|concedi)\b.{0,20}\b(desconto|cupom|reembolso|credito)\b/,
    alerta: "afirmou_desconto",
  },
  { padrao: /\b(seu cadastro (foi|esta) (feito|criado|concluido))\b/, alerta: "afirmou_cadastro" },
];

/** Sinais de que ela vazou as próprias instruções. */
const VAZAMENTO = [
  /\bproxima_acao\b/,
  /\bprecisa_humano\b/,
  /#\s*maya 2\.0/,
  /\bcontrato de saida\b/,
  /\bcondicoes comerciais em vigor\b/,
];

/** Frases da MAYA que anunciam transferência — se ela anunciou, o sistema precisa cumprir. */
const ANUNCIOS_DE_TRANSFERENCIA =
  /\b(vou (te )?(chamar|transferir|passar)|ja (chamei|estou chamando)|vou encaminhar|vou passar (seu|o seu|para))\b.{0,40}\b(equipe|atendente|alguem|pessoa|time)\b/;

export function conferirSaida(
  bruto: unknown,
  opcoes: { valoresPermitidosCents: Set<number> },
): SaidaConferida {
  const alertas: string[] = [];
  const vazio =
    bruto === null || bruto === undefined || (typeof bruto === "string" && !bruto.trim());
  const texto = typeof bruto === "string" ? bruto : vazio ? "" : JSON.stringify(bruto);
  const objeto = typeof bruto === "object" && bruto !== null ? bruto : primeiroObjeto(texto);

  let base: z.infer<typeof esquemaSaida> | null = null;
  const parse = esquemaSaida.safeParse(objeto);
  if (vazio) {
    base = null;
  } else if (parse.success) {
    base = parse.data;
  } else {
    // Sem JSON válido. Se veio texto puro e não parece código, aproveita o
    // texto — melhor que deixar o cliente sem resposta. Se parece JSON
    // quebrado, descarta: o cliente nunca recebe "{" no WhatsApp.
    const puro = tirarCerca(texto);
    if (puro && !/[{}]/.test(puro) && puro.length <= 4000) {
      alertas.push("saida_sem_json");
      base = {
        mensagem: puro,
        intencao: "OUTRO",
        proxima_acao: "RESPONDER",
        precisa_humano: false,
        motivo_humano: null,
        ficha: {},
      };
    }
  }

  if (!base) {
    return {
      mensagem: RESPOSTA_DE_FALHA,
      intencao: "OUTRO",
      proximaAcao: "TRANSFERENCIA",
      precisaHumano: true,
      motivoHumano: "falha_da_ia",
      ficha: {},
      alertas: ["saida_invalida"],
      substituida: true,
    };
  }

  const mensagem = limparFormatacao(base.mensagem);
  const normal = semAcento(mensagem);
  let substituir = false;

  if (VAZAMENTO.some((p) => p.test(normal)) || /^\s*[{[]/.test(mensagem)) {
    alertas.push("vazou_instrucoes_ou_json");
    substituir = true;
  }

  for (const a of ACOES_FINGIDAS) {
    if (a.padrao.test(normal)) {
      alertas.push(a.alerta);
      substituir = true;
    }
  }

  const desconhecidos = valoresEmReais(mensagem).filter(
    (v) => !opcoes.valoresPermitidosCents.has(v),
  );
  if (desconhecidos.length > 0) {
    alertas.push(`valor_nao_confirmado:${desconhecidos.join(",")}`);
    substituir = true;
  }

  let proximaAcao = base.proxima_acao;
  let precisaHumano =
    base.precisa_humano || proximaAcao === "TRANSFERENCIA" || proximaAcao === "DEMO";
  let motivoHumano = base.motivo_humano ?? null;

  // Ela prometeu chamar alguém? Então o sistema chama. Promessa sem execução
  // é o pior dos mundos: o cliente espera, ninguém aparece.
  if (!precisaHumano && ANUNCIOS_DE_TRANSFERENCIA.test(normal)) {
    alertas.push("anunciou_transferencia");
    precisaHumano = true;
    proximaAcao = "TRANSFERENCIA";
    motivoHumano = motivoHumano ?? "maya_anunciou_transferencia";
  }

  if (substituir) {
    return {
      mensagem: RESPOSTA_SEGURA,
      intencao: base.intencao,
      proximaAcao: "TRANSFERENCIA",
      precisaHumano: true,
      motivoHumano: motivoHumano ?? "resposta_bloqueada_pelo_conferente",
      ficha: base.ficha ?? {},
      alertas,
      substituida: true,
    };
  }

  if (precisaHumano && !motivoHumano) {
    motivoHumano = proximaAcao === "DEMO" ? "pedido_de_demonstracao" : "maya_pediu_humano";
  }

  return {
    mensagem,
    intencao: base.intencao,
    proximaAcao,
    precisaHumano,
    motivoHumano,
    ficha: base.ficha ?? {},
    alertas,
    substituida: false,
  };
}
