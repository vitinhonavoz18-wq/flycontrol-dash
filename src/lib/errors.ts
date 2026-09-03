/**
 * Como ler a mensagem de um erro sem confiar no formato dele.
 *
 * Quando algo falha, o que chega pode ser um erro de verdade, um texto, ou
 * uma resposta do banco com formato próprio. O código antigo assumia que
 * sempre haveria uma mensagem dentro (`erro.message`) — e no dia em que não
 * havia, a tela quebrava tentando ler uma mensagem inexistente. É o garçom
 * que só sabe anotar pedido em português: quando o cliente fala outra
 * língua, ele trava, em vez de chamar quem entende.
 *
 * Esta função aceita qualquer coisa e sempre devolve um texto que dá para
 * mostrar na tela.
 */
export function mensagemDoErro(erro: unknown, padrao = "Algo deu errado. Tente de novo."): string {
  if (typeof erro === "string" && erro.trim()) return erro;
  if (erro instanceof Error && erro.message) return erro.message;

  if (erro && typeof erro === "object") {
    const possivel = erro as { message?: unknown; error?: unknown; error_description?: unknown };
    for (const campo of [possivel.message, possivel.error_description, possivel.error]) {
      if (typeof campo === "string" && campo.trim()) return campo;
    }
  }

  return padrao;
}

/**
 * Código de erro que o banco devolve (ex.: "23505" = registro repetido).
 *
 * Devolve `null` quando o que veio não é um erro do banco — assim quem chama
 * compara o código sem antes ter de conferir o formato do objeto.
 */
export function codigoDoErroDoBanco(erro: unknown): string | null {
  if (erro && typeof erro === "object" && "code" in erro) {
    const codigo = (erro as { code?: unknown }).code;
    if (typeof codigo === "string") return codigo;
  }
  return null;
}
