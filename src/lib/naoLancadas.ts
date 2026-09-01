/**
 * Funcionalidades que existem no código mas ainda NÃO estão no ar.
 *
 * POR QUE ISTO EXISTE
 *
 * Marketing e FlyDelivery estão construídos, mas não prontos para o cliente
 * usar. Deixar o item no menu faz o lojista clicar, encontrar uma tela pela
 * metade e perder a confiança no painel inteiro — é como manter a porta do
 * salão em obra aberta, com a placa "aberto" na frente.
 *
 * Some do menu, mas o código fica. Apagar a tela jogaria fora trabalho pronto
 * que teria de ser reescrito do zero no lançamento.
 *
 * DUAS TRAVAS, NÃO UMA
 *
 * 1. O item some do menu (ver `naoLancada` em src/routes/_app.tsx).
 * 2. A rota responde 503 — porque sumir do menu não impede ninguém de digitar
 *    o endereço direto, nem de abrir um link antigo que salvou nos favoritos.
 *
 * Só a primeira trava seria a placa "não entre" sem a porta: quem sabe o
 * caminho passa assim mesmo.
 */

/** Rotas que ainda não estão no ar. Tirar daqui é o que lança a funcionalidade. */
export const ROTAS_NAO_LANCADAS = ["/marketing", "/flydelivery"] as const;

/**
 * Quanto tempo pedir para o visitante (ou o robô de busca) tentar de novo.
 * Uma hora: tempo suficiente para não insistirem em cima, curto o bastante
 * para o lançamento ser percebido no mesmo dia.
 */
export const TENTAR_DE_NOVO_EM_SEGUNDOS = 3600;

/**
 * A resposta 503 padrão do painel.
 *
 * 503 é o código certo aqui, e não 404: o endereço EXISTE, só não está
 * atendendo agora. É a diferença entre "esta rua não existe" e "a loja está
 * fechada, volte mais tarde" — e é o que impede o Google de tirar a página do
 * índice como se ela tivesse sumido para sempre.
 *
 * O cabeçalho `Retry-After` é a parte que diz quando voltar.
 */
export function respostaNaoLancada(titulo: string): Response {
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${titulo} — em breve</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f0f0f;color:#f5f5f5;
       font-family:system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;padding:24px}
  .caixa{max-width:32rem}
  h1{font-size:1.6rem;margin:0 0 .75rem;font-weight:700}
  p{margin:0 0 1.5rem;line-height:1.6;color:#b8b8b8}
  a{display:inline-block;background:#FF7A00;color:#111;text-decoration:none;font-weight:600;
    padding:.7rem 1.3rem;border-radius:.5rem}
</style>
</head>
<body>
  <div class="caixa">
    <h1>${titulo} ainda está sendo preparado</h1>
    <p>Esta parte do FlyControl ainda não foi liberada. Assim que estiver pronta,
       ela aparece sozinha no menu do painel — você não precisa fazer nada.</p>
    <a href="/dashboard">Voltar para Pedidos</a>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 503,
    headers: {
      "Retry-After": String(TENTAR_DE_NOVO_EM_SEGUNDOS),
      "Content-Type": "text/html; charset=utf-8",
      // Uma indisponibilidade temporária não pode ficar guardada em cache:
      // senão o lojista continuaria vendo "em breve" no dia do lançamento.
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Decide se um endereço pedido é de funcionalidade não lançada.
 *
 * Devolve a resposta 503 pronta, ou `null` para a requisição seguir normal.
 *
 * Ignora barra final e maiúsculas, porque "/Marketing/" e "/marketing" são a
 * mesma porta para quem digita. Mas exige o caminho INTEIRO ou um sub-caminho:
 * "/marketingoutracoisa" não é Marketing e não pode ser barrado junto.
 */
export function respostaSeNaoLancada(url: string): Response | null {
  let caminho: string;
  try {
    caminho = new URL(url).pathname.toLowerCase().replace(/\/+$/, "");
  } catch {
    return null;
  }
  if (caminho === "") return null;

  const rota = ROTAS_NAO_LANCADAS.find((r) => caminho === r || caminho.startsWith(`${r}/`));
  if (!rota) return null;

  return respostaNaoLancada(rota === "/flydelivery" ? "FlyDelivery" : "Marketing");
}
