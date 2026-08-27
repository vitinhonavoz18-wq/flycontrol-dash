/**
 * Telefone: um número, um formato.
 *
 * (71) 99999-9999, 71999999999 e +55 71 99999-9999 são a mesma pessoa. Sem
 * padronizar, o mesmo cliente vira três clientes e recebe a mesma promoção
 * três vezes.
 *
 * ATENÇÃO AO MEXER AQUI
 *
 * Esta função é o espelho exato de `marketing_normalize_phone` no banco
 * (migration 20260826230000_marketing_foundation.sql). As duas precisam
 * concordar sempre: o banco normaliza o telefone que chega pelo pedido, e
 * daqui normalizamos o que o dono digita na tela. Se as duas discordarem, o
 * mesmo cliente vira dois — um cadastrado pelo pedido, outro pela tela.
 *
 * Qualquer mudança de regra tem de ser feita nos dois lugares, com o mesmo
 * caso de teste passando dos dois lados.
 */

/** Número pronto para envio: 55 + DDD + número. */
export type PhoneE164 = string;

export type NormalizedPhone = {
  e164: PhoneE164;
  /** Celular (9 dígitos começando em 9). Só celular recebe WhatsApp. */
  isMobile: boolean;
};

export function normalizePhone(input: string | null | undefined): NormalizedPhone | null {
  if (!input) return null;

  const digits = input.replace(/[^0-9]/g, "");
  if (digits === "") return null;

  // Quem escreveu com "+" declarou o país. Se declarou um país que não é o
  // Brasil, recusamos em vez de fingir que é: um "+1 415 555 2671" americano
  // tem 11 dígitos depois do +1 e passaria por celular brasileiro — e aí a
  // promoção do restaurante iria parar no telefone de um desconhecido.
  if (input.trim().startsWith("+") && !digits.startsWith("55")) return null;

  // Tira o zero do DDD interurbano: 071… vira 71…
  const semZero =
    (digits.length === 11 || digits.length === 12) && digits.startsWith("0")
      ? digits.slice(1)
      : digits;

  let ddd: string;
  let numero: string;

  if ((semZero.length === 12 || semZero.length === 13) && semZero.startsWith("55")) {
    ddd = semZero.slice(2, 4);
    numero = semZero.slice(4);
  } else if (semZero.length === 10 || semZero.length === 11) {
    ddd = semZero.slice(0, 2);
    numero = semZero.slice(2);
  } else {
    return null;
  }

  // DDD brasileiro vai de 11 a 99.
  if (!/^[1-9][1-9]$/.test(ddd)) return null;
  // Celular tem 9 dígitos e começa com 9; fixo tem 8. Aceitamos os dois, mas
  // só o celular serve para WhatsApp.
  if (numero.length !== 8 && numero.length !== 9) return null;
  // Telefone fixo no Brasil nunca começa com 9. Oito dígitos começando com 9
  // é celular com um dígito faltando — é o erro de digitação mais comum, e
  // mandar mensagem para ele é mandar para o número de outra pessoa.
  if (numero.length === 8 && numero.startsWith("9")) return null;
  // Celular de 9 dígitos sempre começa com 9.
  if (numero.length === 9 && !numero.startsWith("9")) return null;

  return {
    e164: `55${ddd}${numero}`,
    isMobile: numero.length === 9 && numero.startsWith("9"),
  };
}

/**
 * Como mostrar na tela: (71) 99999-1234.
 *
 * Só para leitura humana. Nunca use o resultado disto para comparar ou
 * guardar — para isso existe o e164.
 */
export function formatPhoneForDisplay(e164: string | null | undefined): string {
  if (!e164) return "—";
  const d = e164.replace(/[^0-9]/g, "");
  const semPais = d.startsWith("55") && (d.length === 12 || d.length === 13) ? d.slice(2) : d;
  if (semPais.length === 11) {
    return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 7)}-${semPais.slice(7)}`;
  }
  if (semPais.length === 10) {
    return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 6)}-${semPais.slice(6)}`;
  }
  return e164;
}
