/**
 * Prova, antes de cada publicação da cópia de teste, que a porta de entrada
 * (entrada.mjs) faz o que promete. Se qualquer item falhar, o roteiro do
 * GitHub para e NADA é publicado.
 *
 * Como roda: copia a porta para uma pasta temporária, coloca ao lado dela um
 * "sistema de mentira" que só anota quem chegou até ele, e faz pedidos de
 * todo tipo. O sistema de verdade não é usado aqui.
 *
 * Uso: node .github/preview-parceiros/testar-entrada.mjs <caminho/da/entrada.mjs>
 */
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const origem = resolve(process.argv[2] ?? ".github/preview-parceiros/entrada.mjs");
const pasta = mkdtempSync(join(tmpdir(), "entrada-preview-"));
copyFileSync(origem, join(pasta, "entrada.mjs"));
writeFileSync(
  join(pasta, "index.mjs"),
  `export const chegaram = [];
export default {
  async fetch(request) {
    const url = new URL(request.url);
    chegaram.push(request.method + " " + url.pathname);
    if (url.searchParams.has("vazio")) return new Response(null, { status: 304 });
    return new Response("<html>pagina</html>", {
      status: 200,
      headers: { "content-type": "text/html", "set-cookie": "a=1" },
    });
  },
  async scheduled() {
    throw new Error("a cobrança agendada NUNCA pode ser chamada pela cópia");
  },
};`,
);

const { default: porta } = await import(pathToFileURL(join(pasta, "entrada.mjs")).href);
const { chegaram } = await import(pathToFileURL(join(pasta, "index.mjs")).href);

const BASE = "https://flydelivery-parceiros-preview.exemplo.workers.dev";
const OFICIAL = "https://flycontrol.conectfly.com.br";
let falhas = 0;

function confere(condicao, descricao) {
  console.log(`${condicao ? "ok   " : "FALHA"}  ${descricao}`);
  if (!condicao) falhas++;
}

async function pedir(caminho, metodo = "GET") {
  return porta.fetch(new Request(BASE + caminho, { method: metodo }), {}, {});
}

// 1. Nada de tarefa agendada na cópia.
confere(!("scheduled" in porta), "a porta não tem tarefa agendada (cobrança)");

// 2. Endereço puro cai na página nova (mantendo ?ref de afiliado).
let r = await pedir("/");
confere(
  r.status === 302 && r.headers.get("location") === `${BASE}/flydelivery-parceiros`,
  "/ → página nova",
);
r = await pedir("/?ref=ABC123");
confere(
  r.headers.get("location") === `${BASE}/flydelivery-parceiros?ref=ABC123`,
  "/?ref=… → página nova com o código de afiliado",
);

// 3. Só o endereço EXATO da página chega ao sistema.
r = await pedir("/flydelivery-parceiros");
confere(r.status === 200, "página nova abre (200)");
confere(r.headers.get("x-robots-tag") === "noindex, nofollow", "página nova pede para não indexar");
confere(
  r.headers.get("content-security-policy") === "connect-src 'self'",
  "página nova proíbe o navegador de falar com outros endereços (banco incluído)",
);
confere(r.headers.get("set-cookie") === "a=1", "cabeçalhos do sistema continuam passando");
r = await pedir("/flydelivery-parceiros?vazio=1");
confere(r.status === 304, "resposta sem corpo (304) não quebra a porta");
r = await pedir("/flydelivery-parceiros", "HEAD");
confere(r.status === 200, "HEAD na página nova funciona");

for (const sub of [
  "/flydelivery-parceiros/",
  "/flydelivery-parceiros/xyz",
  "/flydelivery-parceiros/a/b",
]) {
  r = await pedir(sub);
  confere(
    r.status === 302 && r.headers.get("location") === `${BASE}/flydelivery-parceiros`,
    `${sub} → volta para a página (não abre a tela "não encontrada")`,
  );
}

// 4. Todo o resto vai para o site oficial — inclusive tentativas de truque.
for (const caminho of [
  "/login?x=1",
  "/signup",
  "/dashboard",
  "/admin",
  "/api/orders",
  "/_serverFn/x",
  "//evil.com",
  "/%2e%2e/admin",
  "/FlyDelivery-Parceiros",
]) {
  r = await pedir(caminho);
  const destino = r.headers.get("location") ?? "";
  confere(
    r.status === 302 && destino.startsWith(`${OFICIAL}/`),
    `${caminho} → site oficial (${destino})`,
  );
}

// 5. Nada pode ser enviado à cópia.
for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
  for (const caminho of ["/flydelivery-parceiros", "/_serverFn/qualquer", "/api/orders"]) {
    r = await pedir(caminho, metodo);
    confere(r.status === 403, `${metodo} ${caminho} → recusado (403)`);
  }
}

// 6. robots.txt fecha a porta para robôs de busca.
r = await pedir("/robots.txt");
confere((await r.text()).includes("Disallow: /"), "robots.txt pede para não visitar nada");

// 7. O sistema só foi chamado para a página nova, e nunca para envio.
const fora = chegaram.filter((c) => !/^(GET|HEAD) \/flydelivery-parceiros$/.test(c));
confere(
  fora.length === 0,
  `o sistema só recebeu a página nova (${chegaram.length} pedidos; fora: ${fora.join(", ") || "nenhum"})`,
);

console.log(falhas ? `\n${falhas} FALHA(S): a cópia NÃO deve ser publicada.` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
