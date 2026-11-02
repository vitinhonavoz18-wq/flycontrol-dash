/**
 * O envio da comanda para a impressora.
 *
 * Hoje existe um caminho só: a janela de impressão do navegador, que usa o
 * driver instalado no computador. Não há PrintNode nem envio direto (ESC/POS)
 * ligado neste sistema — ver o relatório em `docs/impressao-comandas.md`.
 *
 * A trava abaixo evita a comanda duplicada por clique duplo: enquanto uma
 * janela de impressão está aberta, um segundo pedido de impressão é ignorado.
 * É como a cozinha não aceitar a mesma comanda pendurada duas vezes no varal.
 */

import { esperarConteudoCarregar } from "./papel";

export type ResultadoDoEnvio =
  | { ok: true; metodo: "navegador" }
  | { ok: false; motivo: "em-andamento" | "sem-janela" | "falhou"; mensagem: string };

let imprimindo = false;

export async function imprimirPeloNavegador(
  raiz: HTMLElement | null,
  janela: Pick<Window, "print"> | null = typeof window !== "undefined" ? window : null,
): Promise<ResultadoDoEnvio> {
  if (!janela) {
    return { ok: false, motivo: "sem-janela", mensagem: "Impressão só funciona no navegador." };
  }
  if (imprimindo) {
    return {
      ok: false,
      motivo: "em-andamento",
      mensagem: "Já existe uma impressão aberta. Termine ou cancele aquela primeiro.",
    };
  }
  imprimindo = true;
  try {
    await esperarConteudoCarregar(raiz);
    janela.print();
    return { ok: true, metodo: "navegador" };
  } catch (erro) {
    // A mensagem do navegador vai para o lojista e para o diagnóstico — ela
    // não carrega dado de cliente.
    const mensagem = erro instanceof Error ? erro.message : "erro desconhecido";
    return {
      ok: false,
      motivo: "falhou",
      mensagem: `O navegador não abriu a impressão: ${mensagem}`,
    };
  } finally {
    imprimindo = false;
  }
}

/**
 * Imprime uma página pronta (ver `paraHtml`) num quadro invisível.
 *
 * Antes, a comanda da mesa abria uma janela nova (que o bloqueador de
 * janelas às vezes barrava) e fechava a janela meio segundo depois de mandar
 * imprimir — em alguns navegadores isso cancelava a impressão no meio. O
 * quadro invisível não depende de janela nova e só some depois que a
 * impressão termina.
 */
export async function imprimirDocumento(
  html: string,
  documento: Document | null = typeof document !== "undefined" ? document : null,
): Promise<ResultadoDoEnvio> {
  if (!documento?.body) {
    return { ok: false, motivo: "sem-janela", mensagem: "Impressão só funciona no navegador." };
  }
  if (imprimindo) {
    return {
      ok: false,
      motivo: "em-andamento",
      mensagem: "Já existe uma impressão aberta. Termine ou cancele aquela primeiro.",
    };
  }
  imprimindo = true;
  const quadro = documento.createElement("iframe");
  quadro.setAttribute("aria-hidden", "true");
  quadro.title = "Impressão da comanda";
  quadro.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  documento.body.appendChild(quadro);
  const remover = () => {
    if (quadro.parentNode) quadro.parentNode.removeChild(quadro);
  };
  try {
    const janela = quadro.contentWindow;
    const doc = quadro.contentDocument ?? janela?.document;
    if (!janela || !doc) throw new Error("quadro de impressão indisponível");
    doc.open();
    doc.write(html);
    doc.close();
    await esperarConteudoCarregar(doc.body);
    janela.focus();
    janela.print();
    // `print()` segura até a janela de impressão fechar na maioria dos
    // navegadores; o atraso cobre os que devolvem antes (Safari).
    setTimeout(remover, 60_000);
    janela.addEventListener("afterprint", () => setTimeout(remover, 500), { once: true });
    return { ok: true, metodo: "navegador" };
  } catch (erro) {
    remover();
    const mensagem = erro instanceof Error ? erro.message : "erro desconhecido";
    return {
      ok: false,
      motivo: "falhou",
      mensagem: `O navegador não abriu a impressão: ${mensagem}`,
    };
  } finally {
    imprimindo = false;
  }
}
