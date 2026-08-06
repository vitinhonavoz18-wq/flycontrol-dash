/**
 * Validação do cadastro. Funções puras, sem React e sem rede.
 *
 * A mesma validação roda no formulário (feedback imediato) e no servidor
 * (decisão final). Duplicar a regra em dois lugares divergiria; aqui há uma
 * cópia só, importada pelos dois.
 */

export type FieldResult = { valid: true } | { valid: false; message: string };

const OK: FieldResult = { valid: true };
const fail = (message: string): FieldResult => ({ valid: false, message });

// ---------------------------------------------------------------------------
// Responsável
// ---------------------------------------------------------------------------

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateEmail(value: string): FieldResult {
  const email = normalizeEmail(value);
  if (!email) return fail("Informe o e-mail.");
  // Deliberadamente simples: e-mail só é validado de verdade enviando uma
  // mensagem. Regex elaborada rejeita endereços válidos e não pega os
  // inválidos que importam.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail("E-mail inválido.");
  return OK;
}

export function validateFullName(value: string): FieldResult {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 3) return fail("Informe o nome completo.");
  if (!name.includes(" ")) return fail("Informe nome e sobrenome.");
  return OK;
}

export const PASSWORD_MIN_LENGTH = 8;

/**
 * Requisitos mínimos: comprimento, uma letra e um número.
 *
 * Sem exigência de símbolo de propósito — regras muito rígidas empurram o
 * usuário para senha anotada no papel, o que piora a segurança real.
 */
export function validatePassword(value: string): FieldResult {
  if (value.length < PASSWORD_MIN_LENGTH) {
    return fail(`A senha precisa ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  }
  if (!/[a-zA-Z]/.test(value)) return fail("A senha precisa conter ao menos uma letra.");
  if (!/[0-9]/.test(value)) return fail("A senha precisa conter ao menos um número.");
  return OK;
}

export function validatePasswordConfirmation(password: string, confirmation: string): FieldResult {
  if (!confirmation) return fail("Confirme a senha.");
  if (password !== confirmation) return fail("As senhas não coincidem.");
  return OK;
}

// ---------------------------------------------------------------------------
// Telefone
// ---------------------------------------------------------------------------

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Aceita fixo (10 dígitos) e celular (11). O DDD válido no Brasil vai de 11 a 99. */
export function validateBrazilianPhone(value: string): FieldResult {
  const digits = onlyDigits(value);
  if (!digits) return fail("Informe o WhatsApp.");
  if (digits.length !== 10 && digits.length !== 11) {
    return fail("Telefone deve ter DDD e 8 ou 9 dígitos.");
  }
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11 || ddd > 99) return fail("DDD inválido.");
  // Celular brasileiro sempre começa com 9 após o DDD.
  if (digits.length === 11 && digits[2] !== "9")
    return fail("Celular deve começar com 9 após o DDD.");
  return OK;
}

export function formatPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ---------------------------------------------------------------------------
// CPF e CNPJ
// ---------------------------------------------------------------------------

/**
 * Dígito verificador de CPF/CNPJ.
 *
 * Validar só o comprimento aceitaria "111.111.111-11" e qualquer sequência
 * digitada por engano — e o erro só apareceria na emissão da nota fiscal.
 */
function cpfCheckDigit(digits: string, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += Number(digits[i]) * (length + 1 - i);
  }
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

export function isValidCPF(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return false;
  // Sequências repetidas passam no cálculo, mas não são CPF válido.
  if (/^(\d)\1{10}$/.test(digits)) return false;
  return (
    cpfCheckDigit(digits, 9) === Number(digits[9]) &&
    cpfCheckDigit(digits, 10) === Number(digits[10])
  );
}

function cnpjCheckDigit(digits: string, length: number): number {
  // Pesos do CNPJ: começam em 2 no fim e sobem até 9, reiniciando em 2.
  let sum = 0;
  let weight = length - 7;
  for (let i = 0; i < length; i++) {
    sum += Number(digits[i]) * weight;
    weight -= 1;
    if (weight < 2) weight = 9;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCNPJ(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  return (
    cnpjCheckDigit(digits, 12) === Number(digits[12]) &&
    cnpjCheckDigit(digits, 13) === Number(digits[13])
  );
}

/**
 * Documento do estabelecimento.
 *
 * Opcional no cadastro: muitos restaurantes pequenos operam como pessoa
 * física e exigir CNPJ na entrada barraria cliente pagante. Quando informado,
 * é validado de verdade.
 */
export function validateDocument(value: string): FieldResult {
  const digits = onlyDigits(value);
  if (!digits) return OK;
  if (digits.length === 11) {
    return isValidCPF(digits) ? OK : fail("CPF inválido.");
  }
  if (digits.length === 14) {
    return isValidCNPJ(digits) ? OK : fail("CNPJ inválido.");
  }
  return fail("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).");
}

export function formatDocument(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

// ---------------------------------------------------------------------------
// Endereço
// ---------------------------------------------------------------------------

/** CEP é opcional; quando informado, precisa ter 8 dígitos. */
export function validateCEP(value: string): FieldResult {
  const digits = onlyDigits(value);
  if (!digits) return OK;
  if (digits.length !== 8) return fail("CEP deve ter 8 dígitos.");
  return OK;
}

export function formatCEP(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export const BRAZILIAN_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

export function validateState(value: string): FieldResult {
  if (!value) return OK;
  return (BRAZILIAN_STATES as readonly string[]).includes(value.toUpperCase())
    ? OK
    : fail("Estado inválido.");
}

// ---------------------------------------------------------------------------
// Empresa
// ---------------------------------------------------------------------------

export function validateCompanyName(value: string): FieldResult {
  const name = value.trim();
  if (name.length < 2) return fail("Informe o nome do estabelecimento.");
  return OK;
}

/** Slug a partir do nome: minúsculas, sem acento, hifenizado. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// ---------------------------------------------------------------------------
// Etapas
// ---------------------------------------------------------------------------

export type OwnerData = {
  fullName: string;
  email: string;
  whatsapp: string;
  password: string;
  passwordConfirmation: string;
};

export type CompanyData = {
  name: string;
  tradeName: string;
  document: string;
  phone: string;
  segment: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

export type FieldErrors = Record<string, string>;

/** Coleta os erros de uma etapa em vez de parar no primeiro. */
function collect(entries: Array<[string, FieldResult]>): FieldErrors {
  const errors: FieldErrors = {};
  for (const [field, result] of entries) {
    if (!result.valid) errors[field] = result.message;
  }
  return errors;
}

export function validateOwnerStep(data: OwnerData): FieldErrors {
  return collect([
    ["fullName", validateFullName(data.fullName)],
    ["email", validateEmail(data.email)],
    ["whatsapp", validateBrazilianPhone(data.whatsapp)],
    ["password", validatePassword(data.password)],
    [
      "passwordConfirmation",
      validatePasswordConfirmation(data.password, data.passwordConfirmation),
    ],
  ]);
}

export function validateCompanyStep(data: CompanyData): FieldErrors {
  return collect([
    ["name", validateCompanyName(data.name)],
    ["document", validateDocument(data.document)],
    ["phone", data.phone ? validateBrazilianPhone(data.phone) : OK],
    ["zipCode", validateCEP(data.zipCode)],
    ["state", validateState(data.state)],
  ]);
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
