/**
 * A arte e o texto de cada etapa do pedido.
 *
 * Vive fora do componente de tela porque o SERVIDOR também precisa disso: é
 * ele quem monta a mensagem que sai para o cliente. Se cada lado montasse a
 * sua, o dono veria uma coisa na prévia e o cliente receberia outra.
 */

export type FlyStatusKind = "preparando" | "saiu" | "entregue";

export const FLYSTATUS_META: Record<
  FlyStatusKind,
  { title: string; emoji: string; accent: string }
> = {
  preparando: { title: "Em Preparo", emoji: "🍕🔥", accent: "from-blue-500/20 to-blue-500/0" },
  saiu: { title: "Saiu para Entrega", emoji: "🛵💨", accent: "from-amber-500/20 to-amber-500/0" },
  entregue: {
    title: "Pedido Entregue",
    emoji: "🍕❤️",
    accent: "from-emerald-500/20 to-emerald-500/0",
  },
};

export function getFlyStatusKind(status: string): FlyStatusKind | null {
  if (status === "preparando") return "preparando";
  if (status === "saiu") return "saiu";
  if (status === "entregue") return "entregue";
  return null;
}

export type FlyStatusPizzeria = {
  status_art_preparando_url?: string | null;
  status_art_saiu_url?: string | null;
  status_art_entregue_url?: string | null;
  status_text_preparando?: string | null;
  status_text_saiu?: string | null;
  status_text_entregue?: string | null;
};

/**
 * As artes que toda loja usa enquanto não sobe as suas.
 *
 * Elas moram num armazenamento diferente do banco atual — por isso o host
 * abaixo precisa estar liberado no porteiro de mídia (`mediaGuard.ts`), senão
 * o envio recusaria a própria arte que o sistema entrega de fábrica.
 */
export const HOST_ARTES_PADRAO = "laufyadcizmruejafcpi.supabase.co";

const BASE_ARTES_PADRAO = `https://${HOST_ARTES_PADRAO}/storage/v1/object/public/status-arts/02e160ec-cbfa-4a90-9a7f-085fcbd79838`;

const GLOBAL_ARTS: Record<FlyStatusKind, { url: string; text: string }> = {
  preparando: {
    url: `${BASE_ARTES_PADRAO}/preparando-1779197046915.png`,
    text: "Seu pedido entrou no forno! 🍕🔥\n\nLogo logo ele estará pronto e quentinho para você.\n\nPedido #{NUMERO}",
  },
  saiu: {
    url: `${BASE_ARTES_PADRAO}/saiu-1779197070103.png`,
    text: "Acelera! 🛵💨\n\nSeu pedido acabou de sair para entrega.\n\nPedido #{NUMERO}",
  },
  entregue: {
    url: `${BASE_ARTES_PADRAO}/entregue-1779197097530.png`,
    text: "Pedido Entregue! 🍕❤️\n\nBom apetite! Se puder, nos conte o que achou.\n\nPedido #{NUMERO}",
  },
};

export function pickArt(pz: FlyStatusPizzeria | null | undefined, kind: FlyStatusKind) {
  const global = GLOBAL_ARTS[kind];
  if (!pz) return global;

  if (kind === "preparando") {
    return {
      url: pz.status_art_preparando_url || global.url,
      text: pz.status_text_preparando || global.text,
    };
  }
  if (kind === "saiu") {
    return {
      url: pz.status_art_saiu_url || global.url,
      text: pz.status_text_saiu || global.text,
    };
  }
  return {
    url: pz.status_art_entregue_url || global.url,
    text: pz.status_text_entregue || global.text,
  };
}

/** Telefone só com dígitos e com o 55 do Brasil na frente. */
export function normalizarTelefone(raw: string | null | undefined): string {
  const digitos = String(raw ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  return digitos.startsWith("55") ? digitos : `55${digitos}`;
}

/**
 * O texto final, com o número do pedido e o nome do cliente no lugar.
 *
 * A ARTE NÃO ENTRA NO TEXTO. Era exatamente isso que fazia o cliente receber
 * um endereço da internet no lugar da imagem — como mandar o cardápio dizendo
 * "a foto da pizza está na gaveta" em vez de mandar a foto.
 */
export function montarMensagem(
  loja: FlyStatusPizzeria | null | undefined,
  kind: FlyStatusKind,
  numeroDoPedido: number | string,
  nomeDoCliente: string,
): { url: string; texto: string } {
  const { url, text } = pickArt(loja, kind);
  const base = text || "Seu pedido foi atualizado 😋🍕\n\nPedido #{NUMERO}";
  const texto = base
    .replace(/\{NUMERO\}/g, String(numeroDoPedido))
    .replace(/#NUMERO/g, `#${numeroDoPedido}`)
    .replace(/\{NOME\}/g, nomeDoCliente || "")
    .trim();
  return { url, texto };
}
