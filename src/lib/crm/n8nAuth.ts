/**
 * A tranca da porta entre o FlyControl e o fluxo do n8n de CADA restaurante.
 *
 * POR QUE NÃO REAPROVEITAR A TRANCA DO MARKETING DIRETO
 *
 * A do Marketing é uma chave só, que abre a fila de todo mundo — e funciona
 * lá porque existe UM fluxo central cuidando das campanhas de todas as lojas.
 *
 * Aqui é o contrário: cada restaurante tem o SEU fluxo. Se todos usassem a
 * mesma chave, o fluxo da pizzaria A poderia pedir as conversas da pizzaria B
 * só trocando um número na chamada. Seria dar a mesma chave de quarto para
 * todos os hóspedes do hotel e confiar que ninguém vai abrir a porta errada.
 *
 * Então são DUAS conferências, e as duas precisam passar:
 *
 *   1. a chave mestra do CRM (CRM_N8N_SECRET), que só o servidor conhece;
 *   2. a senha da loja (crm_n8n_links.webhook_token), diferente para cada
 *      restaurante e guardada junto do fluxo dele.
 *
 * Com isso, mesmo quem tivesse a chave mestra em mãos precisaria ainda da
 * senha daquela loja específica para alcançar as conversas dela.
 *
 * SEM CHAVE MESTRA CONFIGURADA, A PORTA NÃO ABRE PARA NINGUÉM. O caminho
 * fácil seria "se não tem segredo configurado, deixa passar" — e foi assim
 * que muito sistema nasceu aberto em produção, porque a variável faltou no
 * dia do deploy e ninguém percebeu.
 */

/**
 * Compara dois segredos sem entregar pistas pelo tempo de resposta.
 *
 * Uma comparação comum para no primeiro caractere diferente. Quem estivesse
 * tentando adivinhar poderia medir esse tempo e descobrir o segredo letra por
 * letra — como um cofre que faz um clique diferente quando o número está
 * certo. Esta versão sempre percorre tudo.
 */
export function comparaSemVazar(a: string, b: string): boolean {
  const A = new TextEncoder().encode(a);
  const B = new TextEncoder().encode(b);
  let diff = A.length ^ B.length;
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) {
    diff |= (A[i] ?? 0) ^ (B[i] ?? 0);
  }
  return diff === 0;
}

export type ResultadoAuthCrm =
  { ok: true; tenantId: string } | { ok: false; status: number; erro: string };

/** O que o n8n apresenta na porta, sem o "Bearer " na frente. */
export function segredoApresentado(request: Request): string {
  const cabecalho =
    request.headers.get("authorization") || request.headers.get("x-crm-secret") || "";
  return cabecalho.replace(/^Bearer\s+/i, "").trim();
}

/** Primeira conferência: a chave mestra do CRM. */
export function conferirChaveMestra(
  request: Request,
): { ok: true } | { ok: false; status: number; erro: string } {
  const segredo = (process.env.CRM_N8N_SECRET || "").trim();

  if (!segredo) {
    // Configuração faltando tranca a porta. Nunca o contrário.
    return { ok: false, status: 503, erro: "integracao_nao_configurada" };
  }

  const apresentado = segredoApresentado(request);
  if (!apresentado || !comparaSemVazar(apresentado, segredo)) {
    return { ok: false, status: 401, erro: "nao_autorizado" };
  }

  return { ok: true };
}

/** Resposta padrão quando a tranca recusa. Sem detalhes que ajudem quem tenta. */
export function respostaNegadaCrm(r: { status: number; erro: string }): Response {
  const mensagem =
    r.status === 503
      ? "A integração do Chat ainda não foi configurada neste ambiente."
      : "Não autorizado.";
  return new Response(JSON.stringify({ success: false, error: r.erro, message: mensagem }), {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}
