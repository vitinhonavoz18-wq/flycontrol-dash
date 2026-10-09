/**
 * CPF do cliente para a cobrança Pix.
 *
 * A SyncPay pede o CPF de quem paga ao gerar o Pix. O FlyDelivery NÃO guarda
 * esse número: ele passa direto para a SyncPay e some. Em lugar nenhum do
 * banco, do histórico de avisos ou dos logs aparece o CPF inteiro (LGPD: só se
 * coleta o que é preciso, e só se guarda o que é preciso guardar).
 */

export function somenteDigitos(valor: unknown): string {
  return typeof valor === "string" ? valor.replace(/\D/g, "") : "";
}

/** Confere os dois dígitos verificadores. Recusa sequências como 111.111.111-11. */
export function cpfValido(valor: unknown): boolean {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digito = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const primeiro = digito(cpf.slice(0, 9), 10);
  const segundo = digito(cpf.slice(0, 10), 11);
  return primeiro === Number(cpf[9]) && segundo === Number(cpf[10]);
}

/** "***.***.*89-01" — o máximo que aparece em qualquer tela ou registro. */
export function mascararCpf(valor: unknown): string {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11) return "***";
  return `***.***.*${cpf.slice(7, 9)}-${cpf.slice(9)}`;
}
