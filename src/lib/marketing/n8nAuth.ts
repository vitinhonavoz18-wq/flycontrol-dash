/**
 * A tranca da porta entre o FlyControl e o n8n.
 *
 * POR QUE UMA TRANCA PRÓPRIA
 *
 * Estes endereços não são usados por ninguém logado no painel — são usados por
 * um programa, de servidor para servidor. Não existe login de usuário para
 * conferir. Se ficassem abertos, qualquer pessoa que descobrisse o endereço
 * poderia pedir a lista de mensagens pendentes e ler o telefone dos clientes
 * de todos os restaurantes. É uma porta de cinema destrancada.
 *
 * A tranca é um segredo combinado, guardado no ambiente do servidor — nunca
 * no banco, nunca no navegador, nunca no código. Só quem apresenta o segredo
 * entra.
 *
 * SEM SEGREDO CONFIGURADO, A PORTA NÃO ABRE PARA NINGUÉM.
 *
 * Esta é a decisão mais importante do arquivo. O caminho fácil seria "se não
 * há segredo configurado, deixa passar" — e foi assim que muito sistema
 * nasceu aberto em produção, porque a variável de ambiente ficou faltando no
 * dia do deploy e ninguém percebeu. Aqui, faltar o segredo tranca a porta em
 * vez de escancarar.
 */

/**
 * Compara dois segredos sem entregar pistas pelo tempo de resposta.
 *
 * Uma comparação comum para no primeiro caractere diferente. Quem estivesse
 * tentando adivinhar poderia medir esse tempo e descobrir o segredo letra por
 * letra — como um cofre que faz um clique diferente quando o número está
 * certo. Esta versão sempre percorre tudo.
 */
function comparaSemVazar(a: string, b: string): boolean {
  const A = new TextEncoder().encode(a);
  const B = new TextEncoder().encode(b);
  // O tamanho diferente já entrega que está errado, mas ainda assim
  // percorremos o mesmo número de posições.
  let diff = A.length ^ B.length;
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) {
    diff |= (A[i] ?? 0) ^ (B[i] ?? 0);
  }
  return diff === 0;
}

export type ResultadoAuth = { ok: true } | { ok: false; status: number; erro: string };

export function autenticarN8n(request: Request): ResultadoAuth {
  const segredo = (process.env.MARKETING_N8N_SECRET || "").trim();

  if (!segredo) {
    // Configuração faltando tranca a porta. Nunca o contrário.
    return {
      ok: false,
      status: 503,
      erro: "integracao_nao_configurada",
    };
  }

  const cabecalho =
    request.headers.get("authorization") || request.headers.get("x-marketing-secret") || "";
  const apresentado = cabecalho.replace(/^Bearer\s+/i, "").trim();

  if (!apresentado || !comparaSemVazar(apresentado, segredo)) {
    return { ok: false, status: 401, erro: "nao_autorizado" };
  }

  return { ok: true };
}

/** Resposta padrão quando a tranca recusa. Sem detalhes que ajudem quem tenta. */
export function respostaNegada(r: Extract<ResultadoAuth, { ok: false }>): Response {
  const mensagem =
    r.status === 503
      ? "A integração de marketing ainda não foi configurada neste ambiente."
      : "Não autorizado.";
  return new Response(JSON.stringify({ success: false, error: r.erro, message: mensagem }), {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}
