import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { configUazapi, traduzirStatusInstancia, configurarWebhook } from "./uazapi";

/**
 * As regras da conexão com o WhatsApp que não podem quebrar em silêncio.
 *
 * Cada teste aqui existe por causa de um estrago concreto:
 *
 *   - status desconhecido virando "conectado" = o lojista acha que está
 *     atendendo e está mudo;
 *   - a chave de administrador vazando para o navegador = quem pegasse
 *     mexeria no WhatsApp de TODOS os clientes;
 *   - o aviso de mensagem nova sem filtro = a resposta do próprio atendente
 *     voltando para a tela como se o cliente tivesse falado.
 */

const RAIZ = process.cwd();

function soCodigo(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("a configuração da UAZAPI", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env.UAZAPI_BASE_URL = original.UAZAPI_BASE_URL;
    process.env.UAZAPI_ADMIN_TOKEN = original.UAZAPI_ADMIN_TOKEN;
  });

  it("faltando qualquer metade, conta como não configurada", () => {
    // Meia configuração é pior que nenhuma: a tela tentaria conectar e falharia
    // com um erro que o lojista não tem como entender.
    process.env.UAZAPI_BASE_URL = "https://api.uazapi.com";
    process.env.UAZAPI_ADMIN_TOKEN = "";
    expect(configUazapi()).toBeNull();

    process.env.UAZAPI_BASE_URL = "";
    process.env.UAZAPI_ADMIN_TOKEN = "chave";
    expect(configUazapi()).toBeNull();
  });

  it("tira a barra sobrando do fim do endereço", () => {
    // "https://api.uazapi.com/" + "/send/text" viraria "//send/text" e o
    // fornecedor responderia 404 sem explicar nada.
    process.env.UAZAPI_BASE_URL = "https://api.uazapi.com/";
    process.env.UAZAPI_ADMIN_TOKEN = "chave";
    expect(configUazapi()?.baseUrl).toBe("https://api.uazapi.com");
  });
});

describe("a tradução do status do aparelho", () => {
  it("reconhece os nomes que a UAZAPI usa", () => {
    expect(traduzirStatusInstancia("connected")).toBe("connected");
    expect(traduzirStatusInstancia("connecting")).toBe("connecting");
    expect(traduzirStatusInstancia("qrcode")).toBe("connecting");
    expect(traduzirStatusInstancia("disconnected")).toBe("disconnected");
  });

  it("o que não for reconhecido conta como DESCONECTADO, nunca como conectado", () => {
    // Este é o teste mais importante do arquivo. Se o fornecedor renomear um
    // status amanhã, a tela tem de oferecer o QR Code — e não dizer "tudo
    // certo" para um aparelho que não entrega mensagem nenhuma.
    expect(traduzirStatusInstancia("nome_novo_do_fornecedor")).toBe("disconnected");
    expect(traduzirStatusInstancia(null)).toBe("disconnected");
    expect(traduzirStatusInstancia(undefined)).toBe("disconnected");
    expect(traduzirStatusInstancia("")).toBe("disconnected");
  });

  it("banido e removido aparecem como problema, não como desconectado comum", () => {
    expect(traduzirStatusInstancia("banned")).toBe("error");
    expect(traduzirStatusInstancia("removed")).toBe("error");
  });
});

describe("o aviso de mensagem nova (webhook na UAZAPI)", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.UAZAPI_BASE_URL = "https://api.uazapi.test";
    process.env.UAZAPI_ADMIN_TOKEN = "chave-de-admin";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.UAZAPI_BASE_URL = original.UAZAPI_BASE_URL;
    process.env.UAZAPI_ADMIN_TOKEN = original.UAZAPI_ADMIN_TOKEN;
  });

  it("manda o filtro que impede a própria resposta de voltar como pergunta", async () => {
    const chamadas: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    await configurarWebhook("token-do-aparelho", "https://n8n.test/webhook/loja");

    expect(chamadas).toHaveLength(1);
    const corpo = JSON.parse(String(chamadas[0].init.body));

    expect(corpo.url).toBe("https://n8n.test/webhook/loja");
    expect(corpo.enabled).toBe(true);
    // Sem "fromMeYes" a conversa vira um eco; sem "isGroupYes" o CRM enche de
    // grupo de família.
    expect(corpo.excludeMessages).toContain("fromMeYes");
    expect(corpo.excludeMessages).toContain("isGroupYes");
    expect(corpo.events).toContain("messages");
  });

  it("usa o token DO APARELHO, nunca a chave de administrador", () => {
    // Mandar a chave mestra onde bastava a do aparelho é dar a chave do
    // prédio para quem só precisava entrar na própria sala.
    let cabecalhos: Record<string, string> = {};
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      cabecalhos = (init.headers ?? {}) as Record<string, string>;
      return new Response("{}", { status: 200 });
    });

    return configurarWebhook("token-do-aparelho", "https://n8n.test/w").then(() => {
      expect(cabecalhos.token).toBe("token-do-aparelho");
      expect(cabecalhos.admintoken).toBeUndefined();
    });
  });
});

describe("onde a chave de administrador pode aparecer", () => {
  it("nunca sai do servidor", () => {
    // Qualquer arquivo de tela que mencionasse esta chave a colocaria dentro
    // do pacote que vai para o navegador — e o que chega ao navegador, vaza.
    for (const arquivo of [
      "src/components/whatsapp/ConexaoWhatsApp.tsx",
      "src/components/marketing/ConfiguracoesWhatsApp.tsx",
      "src/routes/_app/chat.tsx",
    ]) {
      expect(soCodigo(arquivo)).not.toContain("UAZAPI_ADMIN_TOKEN");
    }
  });

  it("o token de cada aparelho mora num cofre que o navegador não abre", () => {
    const sql = readFileSync(
      join(RAIZ, "supabase/migrations/20260911140000_whatsapp_conexao_qrcode.sql"),
      "utf8",
    );
    expect(sql).toContain("ALTER TABLE public.whatsapp_instance_secrets ENABLE ROW LEVEL SECURITY");
    // Com a RLS ligada e nenhuma política, o banco recusa tudo que venha do
    // navegador. Uma política de leitura aqui entregaria o token ao lojista.
    expect(sql).not.toContain('CREATE POLICY "whatsapp_instance_secrets');
  });
});

describe("a conexão pela tela do lojista", () => {
  it("aponta o aviso de mensagem ANTES de mostrar o QR Code", () => {
    // Se o aviso fosse apontado depois, existiria uma janela em que o aparelho
    // já conectou e ninguém está ouvindo — e o que chegasse nela sumiria.
    const codigo = soCodigo("src/lib/whatsapp/conexao.functions.ts");
    const posWebhook = codigo.indexOf("configurarWebhook(token");
    const posQr = codigo.indexOf("conectarInstancia(token");
    expect(posWebhook).toBeGreaterThan(0);
    expect(posQr).toBeGreaterThan(posWebhook);
  });

  it("toda operação confere se quem pede é o dono da loja", () => {
    const codigo = soCodigo("src/lib/whatsapp/conexao.functions.ts");
    const operacoes = codigo.match(/createServerFn\(/g) ?? [];
    const conferencias = codigo.match(/assertOwnsTenant\(context\.supabase/g) ?? [];
    expect(operacoes.length).toBeGreaterThan(0);
    expect(conferencias.length).toBe(operacoes.length);
  });

  it("desconectar não apaga o aparelho nem o histórico", () => {
    // Apagar a instância obrigaria a recriar tudo e perderia o número. O
    // lojista clicou em "desconectar", não em "jogar fora".
    const codigo = soCodigo("src/lib/whatsapp/conexao.functions.ts");
    expect(codigo).toContain("desconectarInstancia");
    expect(codigo).not.toContain('"/instance"');
    expect(codigo).not.toContain(".delete(");
  });
});
