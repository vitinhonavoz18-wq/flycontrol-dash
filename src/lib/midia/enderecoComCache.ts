/**
 * Fotos e vídeos do cardápio entregues pelo Cloudflare, e não direto do
 * Supabase.
 *
 * POR QUE ISTO EXISTE
 *
 * Em novembro de 2026 o Supabase bloqueou o projeto inteiro — login, pedidos,
 * painel — com "exceed_cached_egress_quota": a franquia mensal de arquivos
 * entregues aos visitantes tinha acabado. Cada cliente que abria o cardápio
 * baixava as fotos e o vídeo de capa direto do Supabase, e cada uma dessas
 * entregas descontava da franquia.
 *
 * É como uma pizzaria que manda o motoboy buscar o refrigerante no
 * distribuidor a cada pedido. A saída é ter uma geladeira na loja: busca uma
 * vez, guarda, e serve dali. A "geladeira" aqui é o cache do Cloudflare, onde
 * o FlyControl já roda — e o Cloudflare não cobra por essa entrega.
 *
 * COMO FUNCIONA
 *
 *   antes:  https://<projeto>.supabase.co/storage/v1/object/sign/menu-images/x.webp?token=...
 *   depois: https://flycontrol.conectfly.com.br/api/public/midia/<projeto>/sign/menu-images/x.webp?token=...
 *
 * O endereço novo carrega as mesmas informações do antigo — inclusive o
 * token de acesso, que continua sendo conferido pelo próprio Supabase na
 * primeira busca. O banco continua guardando o endereço original; a troca só
 * acontece na hora de entregar para fora (site do cliente, WhatsApp).
 */

/** Endereço público deste FlyControl — de onde as fotos passam a sair. */
export const ORIGEM_DAS_MIDIAS = "https://flycontrol.conectfly.com.br";

export const PREFIXO_DA_ROTA = "/api/public/midia/";

/**
 * Só os projetos do Supabase que são NOSSOS. Sem esta lista, a rota viraria
 * um entregador que busca em qualquer endereço da internet a pedido de
 * qualquer um — e o Cloudflare guardaria o que mandassem.
 */
export const PROJETOS_PERMITIDOS = new Set(["knhenchgntttraaeewlj", "laufyadcizmruejafcpi"]);

/**
 * Só as gavetas de arquivos públicos por natureza: fotos do cardápio, artes
 * de status e os recortes da vitrine do site (hero-showcase). As fotos e
 * áudios das conversas do chat (crm-chat-media) ficam DE FORA de propósito —
 * são particulares dos clientes da loja.
 */
export const GAVETAS_PERMITIDAS = new Set(["menu-images", "status-arts", "hero-showcase"]);

const TIPOS_DE_ACESSO = new Set(["sign", "public"]);

const PADRAO_SUPABASE =
  /^https:\/\/([a-z0-9]{20})\.supabase\.co\/storage\/v1\/object\/(sign|public)\/([a-z0-9-]+)\/(.+)$/i;

function caminhoSeguro(caminho: string): boolean {
  if (!caminho) return false;
  return caminho.split("/").every((parte) => {
    let decodificada: string;
    try {
      decodificada = decodeURIComponent(parte);
    } catch {
      return false;
    }
    return (
      parte !== "" && decodificada !== "." && decodificada !== ".." && !decodificada.includes("\\")
    );
  });
}

/**
 * Troca o endereço do Supabase pelo endereço com cache. Qualquer coisa que
 * não seja uma foto nossa (vazio, outro site, gaveta particular) volta
 * exatamente como veio — nunca quebra uma imagem que já funcionava.
 */
export function paraEnderecoComCache<T>(url: T): T {
  if (typeof url !== "string" || url === "") return url;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return url;
  }
  const m = `${u.origin}${u.pathname}`.match(PADRAO_SUPABASE);
  if (!m) return url;
  const [, projeto, acesso, gaveta, caminho] = m;
  const ref = projeto.toLowerCase();
  if (!PROJETOS_PERMITIDOS.has(ref) || !GAVETAS_PERMITIDAS.has(gaveta)) return url;
  if (!caminhoSeguro(caminho)) return url;
  return `${ORIGEM_DAS_MIDIAS}${PREFIXO_DA_ROTA}${ref}/${acesso.toLowerCase()}/${gaveta}/${caminho}${u.search}` as T;
}

/**
 * O caminho inverso, usado pela rota: recebe o pedaço depois de
 * `/api/public/midia/` e devolve o endereço original no Supabase — ou `null`
 * se o pedido não for de uma foto nossa.
 */
export function enderecoDeOrigem(trecho: string, busca: string): string | null {
  const partes = trecho.split("/");
  if (partes.length < 4) return null;
  const [projeto, acesso, gaveta, ...resto] = partes;
  const caminho = resto.join("/");
  if (!PROJETOS_PERMITIDOS.has(projeto)) return null;
  if (!TIPOS_DE_ACESSO.has(acesso)) return null;
  if (!GAVETAS_PERMITIDAS.has(gaveta)) return null;
  if (!caminhoSeguro(caminho)) return null;
  // Só o token viaja junto. Qualquer outro parâmetro é descartado para que
  // ninguém crie mil "versões" do mesmo arquivo e encha o cache à toa.
  const token = new URLSearchParams(busca).get("token");
  if (acesso === "sign" && !token) return null;
  const sufixo = acesso === "sign" ? `?token=${encodeURIComponent(token!)}` : "";
  return `https://${projeto}.supabase.co/storage/v1/object/${acesso}/${gaveta}/${caminho}${sufixo}`;
}
