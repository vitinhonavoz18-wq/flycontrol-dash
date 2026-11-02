/**
 * Perfis de impressora — o "jeito" de cada impressora imprimir.
 *
 * Cada impressora é de um jeito: uma tem bobina de 58 mm e cabe 32 letras por
 * linha; outra tem 80 mm e cabe 48; outra está ligada ao Windows como
 * "Somente texto" e transforma todo acento em símbolo estranho. Um perfil
 * guarda essas escolhas uma vez, e toda comanda daquela loja sai certa.
 *
 * ONDE FICA GUARDADO
 *
 * No computador (navegador), e não no banco da loja — de propósito, como já
 * era a escolha de papel: cada computador tem a sua impressora. O caixa com
 * bobina de 58 mm e o escritório com impressora a laser são da mesma loja e
 * precisam de perfis diferentes. Dentro do computador, cada LOJA tem os seus
 * perfis (quem administra duas lojas no mesmo computador não mistura as
 * configurações de uma com a da outra).
 *
 * DETECÇÃO AUTOMÁTICA — O QUE DÁ E O QUE NÃO DÁ
 *
 * O navegador não informa ao site qual impressora está ligada, nem o modelo,
 * nem a largura da bobina (é uma proteção de privacidade dos navegadores).
 * Por isso não existe "detectar o modelo" aqui. O perfil "Automático" é o
 * perfil seguro: ocupa a largura que a impressora disser, até 80 mm, com uma
 * quantidade de letras que serve nas duas bobinas. O teste de alinhamento
 * mostra, no papel, se precisa ajustar.
 */

import { type Papel, PAPEIS, PROPORCAO_DA_LETRA, ehPapel, larguraDaAreaMm } from "./papel";

export { larguraDaAreaMm };

export type Marca = "generica" | "epson" | "elgin" | "bematech" | "daruma" | "sweda" | "outra";

export const MARCAS: ReadonlyArray<{ id: Marca; rotulo: string }> = [
  { id: "generica", rotulo: "Genérica / não sei" },
  { id: "epson", rotulo: "Epson" },
  { id: "elgin", rotulo: "Elgin" },
  { id: "bematech", rotulo: "Bematech" },
  { id: "daruma", rotulo: "Daruma" },
  { id: "sweda", rotulo: "Sweda" },
  { id: "outra", rotulo: "Outra marca" },
];

/**
 * Como a comanda chega à impressora.
 *
 * Hoje só existe um caminho: pelo navegador, usando o driver que o Windows
 * (ou o Mac) tem instalado para a impressora. Não existe integração com
 * PrintNode nem envio direto de comandos para a impressora neste sistema.
 * A lista fica preparada para quando houver.
 */
export type MetodoDeImpressao = "navegador";

export const METODOS: ReadonlyArray<{ id: MetodoDeImpressao; rotulo: string; ajuda: string }> = [
  {
    id: "navegador",
    rotulo: "Pelo navegador (driver da impressora)",
    ajuda:
      "A comanda abre a janela de impressão do computador. Funciona com qualquer impressora instalada no Windows ou no Mac.",
  },
];

/** Tabela de letras para o envio direto (ESC/POS). Ver `renderizar.ts`. */
export type PaginaDeCodigo = "cp860" | "cp850";

export const PAGINAS_DE_CODIGO: ReadonlyArray<{ id: PaginaDeCodigo; rotulo: string }> = [
  { id: "cp860", rotulo: "CP860 — Português" },
  { id: "cp850", rotulo: "CP850 — Multilíngue" },
];

export type PerfilDeImpressao = {
  id: string;
  nome: string;
  papel: Papel;
  marca: Marca;
  metodo: MetodoDeImpressao;
  /** Letras por linha. A comanda inteira é montada nessa grade. */
  colunas: number;
  /** Respiro nas laterais, em milímetros. */
  margemMm: number;
  /** Altura de cada linha em relação à letra (1 = colado, 1,5 = folgado). */
  espacamento: number;
  /** `false` tira os acentos — para impressora "Somente texto". */
  acentos: boolean;
  /** Logo da loja no topo (só para impressão pelo navegador). */
  mostrarLogo: boolean;
  /** Linhas em branco no fim, para o corte não pegar o texto. */
  linhasNoFinal: number;
  /** Os campos abaixo só valem para envio direto à impressora (ESC/POS). */
  paginaDeCodigo: PaginaDeCodigo;
  quebraDeLinha: "lf" | "crlf";
  cortarPapel: boolean;
  abrirGaveta: boolean;
};

export const LIMITES = {
  colunas: { min: 24, max: 80 },
  margemMm: { min: 0, max: 10 },
  espacamento: { min: 1, max: 2 },
  linhasNoFinal: { min: 0, max: 10 },
} as const;

/**
 * Letras por linha que costumam caber em cada bobina, com a letra normal
 * das impressoras térmicas (fonte "A" no manual delas):
 *   - 58 mm: 32 letras (a fonte pequena, "B", chega a 42);
 *   - 80 mm: 48 letras (a fonte pequena chega a 64; algumas chegam a 42 só).
 * São valores típicos de fabricante, não garantia — o teste de alinhamento
 * confirma no papel de verdade.
 */
export const COLUNAS_SUGERIDAS: Record<Papel, { padrao: number; opcoes: number[] }> = {
  auto: { padrao: 42, opcoes: [32, 42, 48] },
  "58": { padrao: 32, opcoes: [32, 35, 42] },
  "80": { padrao: 48, opcoes: [42, 48, 56, 64] },
  a4: { padrao: 48, opcoes: [48, 64, 80] },
};

function limitar(valor: unknown, min: number, max: number, padrao: number): number {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

let contador = 0;
function novoId(): string {
  contador += 1;
  return `perfil-${Date.now().toString(36)}-${contador}`;
}

/** O perfil seguro: o que vale quando nada foi configurado. */
export function perfilPadrao(papel: Papel = "auto", nome?: string): PerfilDeImpressao {
  return {
    id: novoId(),
    nome: nome ?? PAPEIS.find((p) => p.id === papel)?.rotulo ?? "Impressora",
    papel,
    marca: "generica",
    metodo: "navegador",
    colunas: COLUNAS_SUGERIDAS[papel].padrao,
    // Sem saber o papel, um pouco mais de respiro: algumas impressoras não
    // alcançam o primeiro milímetro da bobina.
    margemMm: papel === "auto" ? 3 : 2,
    espacamento: 1.15,
    acentos: true,
    mostrarLogo: true,
    linhasNoFinal: 3,
    paginaDeCodigo: "cp860",
    quebraDeLinha: "lf",
    cortarPapel: true,
    abrirGaveta: false,
  };
}

/**
 * Conserta um perfil vindo do armazenamento: valor faltando, fora do limite
 * ou de uma versão antiga vira o valor seguro. Nunca devolve perfil quebrado.
 */
export function normalizarPerfil(bruto: unknown): PerfilDeImpressao {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const papel: Papel = ehPapel(b.papel) ? b.papel : "auto";
  const base = perfilPadrao(papel);
  return {
    id: typeof b.id === "string" && b.id ? b.id : base.id,
    // Sem `trim` aqui: o perfil é normalizado a cada letra digitada, e cortar o
    // espaço do fim impediria escrever "Caixa 2".
    nome: typeof b.nome === "string" && b.nome.trim() ? b.nome.slice(0, 40) : base.nome,
    papel,
    marca: MARCAS.some((m) => m.id === b.marca) ? (b.marca as Marca) : "generica",
    metodo: METODOS.some((m) => m.id === b.metodo) ? (b.metodo as MetodoDeImpressao) : "navegador",
    colunas: Math.round(limitar(b.colunas, LIMITES.colunas.min, LIMITES.colunas.max, base.colunas)),
    margemMm: limitar(b.margemMm, LIMITES.margemMm.min, LIMITES.margemMm.max, base.margemMm),
    espacamento: limitar(
      b.espacamento,
      LIMITES.espacamento.min,
      LIMITES.espacamento.max,
      base.espacamento,
    ),
    acentos: typeof b.acentos === "boolean" ? b.acentos : true,
    mostrarLogo: typeof b.mostrarLogo === "boolean" ? b.mostrarLogo : true,
    linhasNoFinal: Math.round(
      limitar(b.linhasNoFinal, LIMITES.linhasNoFinal.min, LIMITES.linhasNoFinal.max, 3),
    ),
    paginaDeCodigo: PAGINAS_DE_CODIGO.some((p) => p.id === b.paginaDeCodigo)
      ? (b.paginaDeCodigo as PaginaDeCodigo)
      : "cp860",
    quebraDeLinha: b.quebraDeLinha === "crlf" ? "crlf" : "lf",
    cortarPapel: typeof b.cortarPapel === "boolean" ? b.cortarPapel : true,
    abrirGaveta: b.abrirGaveta === true,
  };
}

/** Tamanho da letra (mm) para `colunas` letras caberem na largura útil. */
export function tamanhoDaLetraMm(perfil: PerfilDeImpressao, larguraUtilMm?: number): number {
  const util = larguraUtilMm ?? larguraDaAreaMm(perfil.papel) - 2 * perfil.margemMm;
  return Math.max(0.5, util) / (perfil.colunas * PROPORCAO_DA_LETRA);
}

// ─────────────────────────────────────────────────────────────────────────
// Guardar e ler (por loja, no computador)
// ─────────────────────────────────────────────────────────────────────────

export type PerfisDaLoja = { ativoId: string; perfis: PerfilDeImpressao[] };

export const MAXIMO_DE_PERFIS = 6;

const PREFIXO = "flycontrol:perfis-de-impressao:";
/** A chave antiga, de quando só existia a escolha de papel. */
const CHAVE_ANTIGA_DO_PAPEL = "flycontrol:papel-da-comanda";

function chave(lojaId: string | null | undefined): string {
  return PREFIXO + (lojaId || "sem-loja");
}

export function normalizarPerfisDaLoja(bruto: unknown, papelAntigo?: Papel): PerfisDaLoja {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const lista = Array.isArray(b.perfis) ? b.perfis.slice(0, MAXIMO_DE_PERFIS) : [];
  const perfis = lista.map(normalizarPerfil);
  // Ids repetidos (cópia manual do armazenamento) quebrariam a escolha.
  const vistos = new Set<string>();
  for (const p of perfis) {
    if (vistos.has(p.id)) p.id = novoId();
    vistos.add(p.id);
  }
  if (perfis.length === 0) perfis.push(perfilPadrao(papelAntigo ?? "auto"));
  const ativoId =
    typeof b.ativoId === "string" && perfis.some((p) => p.id === b.ativoId)
      ? b.ativoId
      : perfis[0].id;
  return { ativoId, perfis };
}

/**
 * Lê os perfis da loja neste computador.
 *
 * Quem já tinha escolhido o papel na versão anterior (uma escolha só, sem
 * loja) começa com um perfil daquele papel — ninguém perde a configuração.
 */
export function lerPerfisDaLoja(lojaId: string | null | undefined): PerfisDaLoja {
  try {
    const salvo = window.localStorage.getItem(chave(lojaId));
    if (salvo) return normalizarPerfisDaLoja(JSON.parse(salvo));
    const antigo = window.localStorage.getItem(CHAVE_ANTIGA_DO_PAPEL);
    return normalizarPerfisDaLoja(null, ehPapel(antigo) ? antigo : "auto");
  } catch {
    // Navegador em modo privado, armazenamento bloqueado ou dado corrompido:
    // segue com o perfil seguro.
    return normalizarPerfisDaLoja(null);
  }
}

export function salvarPerfisDaLoja(lojaId: string | null | undefined, dados: PerfisDaLoja): void {
  try {
    window.localStorage.setItem(chave(lojaId), JSON.stringify(normalizarPerfisDaLoja(dados)));
  } catch {
    // Sem armazenamento a escolha vale só enquanto a página estiver aberta.
  }
}

export function perfilAtivo(dados: PerfisDaLoja): PerfilDeImpressao {
  return dados.perfis.find((p) => p.id === dados.ativoId) ?? dados.perfis[0];
}

/** Troca o papel e já ajusta as letras por linha para o padrão daquele papel. */
export function trocarPapel(perfil: PerfilDeImpressao, papel: Papel): PerfilDeImpressao {
  return normalizarPerfil({
    ...perfil,
    papel,
    colunas: COLUNAS_SUGERIDAS[papel].padrao,
    margemMm: papel === "auto" ? 3 : 2,
  });
}
