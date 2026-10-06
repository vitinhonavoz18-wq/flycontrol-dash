/**
 * Porta de entrada da CÓPIA DE TESTE (preview) do FlyDelivery Parceiros.
 *
 * Este arquivo NUNCA vai para o site oficial. Ele só é usado pelo roteiro
 * .github/workflows/preview-flydelivery-parceiros.yml, que o copia para dentro
 * do site já montado e o coloca na frente do sistema — só na cópia de teste.
 *
 * A CÓPIA MOSTRA SÓ A PÁGINA NOVA
 *
 * O site montado é o sistema inteiro (painel, login, cadastro...), mas a cópia
 * não recebe nenhuma chave secreta. Em vez de deixar essas telas abertas pela
 * metade, esta porta deixa passar só a página nova:
 *
 * 1. "/" cai direto na página nova.
 * 2. Qualquer outro endereço (login, cadastro, painel) é mandado para o site
 *    OFICIAL, onde tudo funciona.
 * 3. Nada pode ser ENVIADO à cópia (formulário, cadastro, pagamento): só
 *    abrir páginas. Ela é a vitrine da feira — dá para olhar, não para comprar.
 * 4. Só o endereço EXATO da página nova é atendido. Qualquer coisa depois dele
 *    (/flydelivery-parceiros/xyz) volta para a página. Sem isso, um link
 *    errado abria a tela "não encontrada", cujo botão "Voltar" levava ao
 *    painel inteiro DENTRO da cópia, sem passar por esta porta — achado da
 *    revisão de segurança.
 * 5. A página entregue proíbe o navegador de conversar com qualquer outro
 *    endereço (nem com o banco de dados). A página nova não precisa disso; se
 *    alguém achasse outro caminho até o painel dentro da cópia, ele não
 *    conseguiria nem entrar.
 * 6. Toda resposta pede ao Google para não indexar, e o robots.txt pede para
 *    não visitar nada.
 * 7. Ela só sabe atender visitas (fetch). Não existe aqui a parte de tarefas
 *    agendadas, que é a que roda a cobrança diária: mesmo que alguém ligasse
 *    um agendamento nesta cópia, não haveria nada para executar.
 *
 * Fotos, vídeos, estilos e o código da página são arquivos prontos: a
 * Cloudflare os entrega antes de chegar aqui.
 */
import sistema from "./index.mjs";

const SITE_OFICIAL = "https://flycontrol.conectfly.com.br";
const PAGINA_NOVA = "/flydelivery-parceiros";
const NAO_INDEXAR = "noindex, nofollow";
// "connect-src 'self'": o navegador só pode buscar dados na própria cópia.
const SO_A_PROPRIA_COPIA = "connect-src 'self'";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /\n", {
        headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": NAO_INDEXAR },
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Esta é uma cópia de teste: aqui não se envia nada.", {
        status: 403,
        headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": NAO_INDEXAR },
      });
    }

    if (url.pathname === "/") {
      return Response.redirect(new URL(PAGINA_NOVA + url.search, url).toString(), 302);
    }

    if (url.pathname.startsWith(`${PAGINA_NOVA}/`)) {
      return Response.redirect(new URL(PAGINA_NOVA + url.search, url).toString(), 302);
    }

    if (url.pathname !== PAGINA_NOVA) {
      return Response.redirect(`${SITE_OFICIAL}${url.pathname}${url.search}`, 302);
    }

    const resposta = await sistema.fetch(request, env, ctx);
    const cabecalhos = new Headers(resposta.headers);
    cabecalhos.set("x-robots-tag", NAO_INDEXAR);
    cabecalhos.set("content-security-policy", SO_A_PROPRIA_COPIA);
    return new Response(resposta.body, {
      status: resposta.status,
      statusText: resposta.statusText,
      headers: cabecalhos,
    });
  },
};
