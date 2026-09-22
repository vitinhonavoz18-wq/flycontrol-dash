/**
 * As poses do personagem do FlyControl.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ESTE É O ÚNICO ARQUIVO QUE SABE O NOME DOS ARQUIVOS DE IMAGEM
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Para trocar uma pose, basta substituir o PNG correspondente em
 * `src/assets/personagem/` — ou, se o arquivo novo tiver outro nome, mudar
 * UMA linha deste mapa. Nada do guia (etapas, holofote, progresso, telas)
 * conhece caminho de imagem: todos pedem por EMOÇÃO.
 *
 * É a diferença entre o cardápio dizer "refrigerante" e dizer "aquela lata
 * que está na terceira prateleira": trocar o fornecedor não obriga a
 * reimprimir o cardápio.
 *
 * SOBRE OS ARQUIVOS
 *
 * São PNGs com fundo transparente, na proporção original do personagem
 * (1145 × 1374). Os enviados originalmente tinham ~1,4 MB cada — quase 10 MB
 * no total. Num celular no meio do serviço, com internet de loja, isso é o
 * guia travando antes de começar. Os daqui são os MESMOS desenhos reduzidos
 * para o tamanho em que aparecem na tela; os originais, intactos, estão em
 * `docs/personagem-originais/`.
 */

import atencao from "@/assets/personagem/atencao.png";
import boasVindas from "@/assets/personagem/boas-vindas.png";
import comemorando from "@/assets/personagem/comemorando.png";
import neutro from "@/assets/personagem/neutro.png";
import orientando from "@/assets/personagem/orientando.png";
import sucesso from "@/assets/personagem/sucesso.png";
import trabalhando from "@/assets/personagem/trabalhando.png";
import type { EmocaoDoGuia } from "@/lib/onboarding/guia/etapas";

export type Pose = {
  /** O arquivo da imagem. */
  src: string;
  /**
   * O que a pose mostra, para quem não enxerga a imagem. Leitor de tela lê
   * isto; descrever "personagem" e mais nada não diz nada a ninguém.
   */
  descricao: string;
};

export const POSES: Readonly<Record<EmocaoDoGuia, Pose>> = {
  "boas-vindas": {
    src: boasVindas,
    descricao: "Atendente do FlyControl sorrindo, dando boas-vindas",
  },
  orientando: {
    src: orientando,
    descricao: "Atendente do FlyControl com a mão aberta, indicando o caminho",
  },
  trabalhando: {
    src: trabalhando,
    descricao: "Atendente do FlyControl concentrado no computador",
  },
  sucesso: {
    src: sucesso,
    descricao: "Atendente do FlyControl fazendo sinal de positivo",
  },
  atencao: {
    src: atencao,
    descricao: "Atendente do FlyControl com expressão de atenção",
  },
  comemorando: {
    src: comemorando,
    descricao: "Atendente do FlyControl comemorando",
  },
  neutro: {
    src: neutro,
    descricao: "Atendente do FlyControl pensativo",
  },
};

/**
 * A proporção original do desenho (largura ÷ altura).
 *
 * Fica escrita aqui para a moldura do personagem reservar o espaço certo
 * ANTES da imagem carregar. Sem isso o balão de fala pula de lugar quando a
 * figura aparece — é a mesa que alguém empurra enquanto a pessoa está
 * escrevendo.
 */
export const PROPORCAO_DO_PERSONAGEM = 1145 / 1374;

export function poseDa(emocao: EmocaoDoGuia): Pose {
  return POSES[emocao] ?? POSES.neutro;
}
