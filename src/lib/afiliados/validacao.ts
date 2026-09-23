/**
 * Regras puras do portal do afiliado — sem React e sem rede.
 *
 * A mesma regra roda no formulário (aviso na hora) e no servidor/banco
 * (decisão final). O banco confere tudo de novo: aqui é só para a pessoa
 * não precisar clicar em "salvar" para descobrir que faltou o DDD.
 */

import {
  isValidCNPJ,
  isValidCPF,
  onlyDigits,
  validateBrazilianPhone,
  validateEmail,
  validateFullName,
  validatePassword,
} from "@/lib/signup/validation";

/** Versão das regras do programa que a pessoa aceitou ao se cadastrar. */
export const TERMOS_DO_AFILIADO_VERSAO = "afiliados-2026-09-24";

export type DadosDoCadastroDeAfiliado = {
  nome: string;
  email: string;
  telefone?: string | null;
  senha?: string | null;
  aceitouTermos: boolean;
};

export type ErrosDoCadastro = Partial<
  Record<"nome" | "email" | "telefone" | "senha" | "termos", string>
>;

export type RegrasPublicas = {
  programa_ativo: boolean;
  comissao_bps: number;
  comissao_tipo: "recurring";
  comissao_meses: number | null;
  dias_para_liberar: number;
  saque_minimo_cents: number;
  /** `null` = sem prazo: o primeiro clique vale para sempre. */
  dias_do_link: number | null;
  aprovacao_manual: boolean;
  /** Dias do mês em que o repasse é montado, ex.: [10, 20]. */
  dias_de_repasse: number[];
};

export function validarCadastroDeAfiliado(
  d: DadosDoCadastroDeAfiliado | null | undefined,
  opcoes: { exigirSenha: boolean },
): ErrosDoCadastro {
  const erros: ErrosDoCadastro = {};
  if (!d) return { nome: "Preencha o cadastro." };

  const nome = validateFullName(String(d.nome ?? ""));
  if (!nome.valid) erros.nome = nome.message;
  else if (String(d.nome).trim().length > 120) erros.nome = "Nome muito longo.";

  if (opcoes.exigirSenha) {
    const email = validateEmail(String(d.email ?? ""));
    if (!email.valid) erros.email = email.message;
    const senha = validatePassword(String(d.senha ?? ""));
    if (!senha.valid) erros.senha = senha.message;
  }

  // O celular é o caminho da equipe até o parceiro (aprovação, saque).
  const tel = validateBrazilianPhone(String(d.telefone ?? ""));
  if (!tel.valid) erros.telefone = tel.message.replace("WhatsApp", "celular");

  if (d.aceitouTermos !== true) erros.termos = "É preciso aceitar as regras do programa.";
  return erros;
}

// ───────────────────────────────────────────────────────────────────────
// Pix
// ───────────────────────────────────────────────────────────────────────

export type TipoDePix = "cpf" | "cnpj" | "email" | "phone" | "random";

export const TIPOS_DE_PIX: { valor: TipoDePix; rotulo: string; exemplo: string }[] = [
  { valor: "cpf", rotulo: "CPF", exemplo: "000.000.000-00" },
  { valor: "cnpj", rotulo: "CNPJ", exemplo: "00.000.000/0000-00" },
  { valor: "email", rotulo: "E-mail", exemplo: "voce@email.com" },
  { valor: "phone", rotulo: "Celular", exemplo: "(11) 99999-9999" },
  { valor: "random", rotulo: "Chave aleatória", exemplo: "123e4567-e89b-12d3-a456-426614174000" },
];

const CHAVE_ALEATORIA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Devolve a mensagem do problema, ou `null` se a chave está boa. */
export function problemaNaChavePix(tipo: TipoDePix | "" | null, chave: string): string | null {
  const bruta = chave.trim();
  if (!tipo && !bruta) return null; // Pix é opcional até a hora do saque.
  if (!tipo) return "Escolha o tipo da chave Pix.";
  if (!bruta) return "Informe a chave Pix.";
  switch (tipo) {
    case "cpf":
      return isValidCPF(bruta) ? null : "CPF inválido.";
    case "cnpj":
      return isValidCNPJ(bruta) ? null : "CNPJ inválido.";
    case "email":
      return validateEmail(bruta).valid && bruta.length <= 77 ? null : "E-mail inválido.";
    case "phone": {
      const d = onlyDigits(bruta);
      return d.length >= 10 && d.length <= 13 ? null : "Celular inválido. Use DDD + número.";
    }
    case "random":
      return CHAVE_ALEATORIA.test(bruta) ? null : "Chave aleatória inválida.";
  }
}

/** "12345678901" → "•••• 8901": o bastante para reconhecer, não para copiar. */
export function mascararPix(chave: string | null | undefined): string {
  if (!chave) return "";
  const fim = chave.slice(-4);
  return `•••• ${fim}`;
}

// ───────────────────────────────────────────────────────────────────────
// Números na tela
// ───────────────────────────────────────────────────────────────────────

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Centavos inteiros → "R$ 1.234,56". A conta é sempre em centavos; só a tela vira reais. */
export function reais(cents: number | null | undefined): string {
  // `Intl` usa espaço não separável depois do "R$"; troca por espaço comum
  // para o texto copiar e comparar igual em qualquer lugar.
  return REAIS.format((cents ?? 0) / 100).replace(/\u00a0/g, " ");
}

/** 1500 → "15%"; 1250 → "12,5%". */
export function porcentagemDeBps(bps: number | null | undefined): string {
  const valor = (bps ?? 0) / 100;
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/** 125 (milésimos) → "12,5%"; nulo → "—" (ninguém clicou ainda). */
export function taxaDeConversao(milesimos: number | null | undefined): string {
  if (milesimos === null || milesimos === undefined) return "—";
  return `${(milesimos / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// ───────────────────────────────────────────────────────────────────────
// Repasses (dias 10 e 20)
// ───────────────────────────────────────────────────────────────────────

/**
 * O robô do banco monta os repasses às 4h da manhã (horário de Brasília,
 * 7h no relógio mundial) dos dias de repasse. O Brasil não tem mais horário
 * de verão, então a diferença é sempre de 3 horas.
 */
const HORA_DO_REPASSE_UTC = 7;

/**
 * Quando é o próximo repasse. No próprio dia 10, depois das 4h, o repasse
 * daquele dia já foi montado — então o próximo passa a ser o dia 20.
 *
 * Devolve a data/hora em texto ISO, ou `null` se a lista de dias vier vazia
 * ou estragada.
 */
export function proximoRepasse(
  dias: readonly number[] | null | undefined,
  agora: Date = new Date(),
): string | null {
  const lista = Array.isArray(dias) ? dias : [];
  const validos = [...new Set(lista.filter((d) => Number.isInteger(d) && d >= 1 && d <= 28))].sort(
    (a, b) => a - b,
  );
  if (validos.length === 0) return null;
  // O mês "de Brasília" de agora: 3 horas atrás no relógio mundial.
  const brasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const ano = brasilia.getUTCFullYear();
  const mes = brasilia.getUTCMonth();
  for (let passo = 0; passo < 3; passo++) {
    for (const dia of validos) {
      const quando = new Date(Date.UTC(ano, mes + passo, dia, HORA_DO_REPASSE_UTC));
      if (quando.getTime() > agora.getTime()) return quando.toISOString();
    }
  }
  return null;
}

/** [10, 20] → "10 e 20"; [5, 15, 25] → "5, 15 e 25"; [10] → "10". */
export function listaDeDias(dias: readonly number[] | null | undefined): string {
  const lista = [...(Array.isArray(dias) ? dias : [])].sort((a, b) => a - b).map(String);
  if (lista.length <= 1) return lista.join("");
  return `${lista.slice(0, -1).join(", ")} e ${lista[lista.length - 1]}`;
}

/** "nos dias 10 e 20" / "no dia 10" — para encaixar no meio de uma frase. */
export function nosDias(dias: readonly number[] | null | undefined): string {
  const lista = listaDeDias(dias);
  if (!lista) return "nos dias de repasse";
  return `${lista.includes(" ") ? "nos dias" : "no dia"} ${lista}`;
}

/** "Dias 10 e 20 de cada mês" / "Dia 10 de cada mês". */
export function textoDosDiasDeRepasse(dias: readonly number[] | null | undefined): string {
  const lista = listaDeDias(dias);
  if (!lista) return "—";
  return `${lista.includes(" ") ? "Dias" : "Dia"} ${lista} de cada mês`;
}

/** Quando a comissão vira saldo disponível, em palavras. */
export function textoDaLiberacao(dias: number | null | undefined): string {
  if (!dias) return "Libera assim que o pagamento do cliente é confirmado";
  return `Libera ${dias} ${dias === 1 ? "dia" : "dias"} após o pagamento do cliente`;
}

/**
 * "2026-10-10" → "10/10/2026". Para datas sem horário (o dia do repasse):
 * converter para horário de Brasília faria meia-noite virar o dia anterior.
 */
export function dataDoDia(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

/** Link público de divulgação do afiliado. */
export const SITE_PUBLICO = "https://flycontrol.conectfly.com.br";

export function linkDoAfiliado(codigo: string, caminho = "/"): string {
  const base = caminho.startsWith("/") ? caminho : `/${caminho}`;
  return `${SITE_PUBLICO}${base}?ref=${encodeURIComponent(codigo)}`;
}

/**
 * Nos textos prontos da área de Materiais, a equipe escreve {LINK} e
 * {CODIGO} onde o link e o código do parceiro devem entrar. Cada parceiro
 * copia o texto já com o dele — ninguém precisa colar à mão e errar uma
 * letra do código.
 */
export function preencherTexto(texto: string, codigo: string): string {
  return texto.replaceAll("{LINK}", linkDoAfiliado(codigo)).replaceAll("{CODIGO}", codigo);
}

/** "flycontrol.conectfly.com.br/?ref=JOAO123" — a forma curta para exibir. */
export function linkParaExibir(codigo: string): string {
  return linkDoAfiliado(codigo).replace(/^https:\/\//, "");
}

// ───────────────────────────────────────────────────────────────────────
// Erros do banco → frase para a pessoa
// ───────────────────────────────────────────────────────────────────────

const MENSAGENS: Record<string, string> = {
  nao_autenticado: "Sua sessão expirou. Entre novamente.",
  somente_admin: "Acesso restrito a administradores do FlyControl.",
  nao_afiliado: "Esta conta ainda não tem cadastro de parceiro.",
  afiliado_pending: "Seu cadastro está em análise.",
  afiliado_suspended: "Sua conta de parceiro está suspensa.",
  afiliado_blocked: "Sua conta de parceiro está bloqueada.",
  nome_invalido: "Informe seu nome completo.",
  telefone_invalido: "Celular inválido. Use DDD + número.",
  pix_incompleto: "Informe o tipo e a chave Pix juntos.",
  pix_tipo_invalido: "Tipo de chave Pix inválido.",
  pix_chave_invalida: "Chave Pix inválida para o tipo escolhido.",
  periodo_invalido: "Período inválido.",
  situacao_invalida: "Filtro inválido.",
};

/**
 * As funções do banco respondem com um código curto ("afiliado_pending") ou,
 * nas regras de saque, já com a frase pronta. Aqui vira texto para a tela.
 */
export function mensagemDeErro(erro: unknown): string {
  const bruta =
    erro && typeof erro === "object" && "message" in erro
      ? String((erro as { message: unknown }).message)
      : String(erro ?? "");
  const codigo = bruta.trim();
  if (MENSAGENS[codigo]) return MENSAGENS[codigo];
  // Frase já pronta vinda do banco (começa com letra maiúscula e tem espaço).
  if (/^[A-ZÀ-Ú].*\s/.test(codigo) && codigo.length < 200) return codigo;
  return "Não foi possível carregar agora. Tente novamente.";
}

/** Situação da conta que impede ver o painel financeiro. */
export function situacaoBloqueante(erro: unknown): "pending" | "suspended" | "blocked" | null {
  const bruta =
    erro && typeof erro === "object" && "message" in erro
      ? String((erro as { message: unknown }).message)
      : "";
  const m = /^afiliado_(pending|suspended|blocked)$/.exec(bruta.trim());
  return (m?.[1] as "pending" | "suspended" | "blocked" | undefined) ?? null;
}
