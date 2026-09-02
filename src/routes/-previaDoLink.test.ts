import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardas da prévia do link.
 *
 * Quando alguém cola o endereço do FlyControl no WhatsApp, quem monta aquele
 * cartãozinho com foto não é o site: é um robô do WhatsApp que passa rápido,
 * lê só o cabeçalho da página e vai embora. Ele não clica em nada, não espera
 * a página carregar e não pergunta duas vezes.
 *
 * Por isso este teste existe. Ele não olha se a imagem está bonita — olha as
 * quatro coisas que fazem o robô desistir e mostrar só um texto sem graça:
 *
 * 1. ENDEREÇO INCOMPLETO. O robô vem de fora do site. Um caminho curto como
 *    "/imagem.jpg" é como escrever só "apartamento 42" no envelope: quem já
 *    está no prédio entende, o carteiro que vem da rua não.
 *
 * 2. IMAGEM DE OUTRA CASA. A prévia já apontou para um arquivo hospedado num
 *    endereço que não é nosso. No dia em que aquele lugar sair do ar, a
 *    prévia some — e ninguém fica sabendo, porque o site continua
 *    funcionando normalmente.
 *
 * 3. DUAS IMAGENS. Se a página anunciar duas fotos, o robô escolhe uma delas
 *    sozinho, e não necessariamente a certa.
 *
 * 4. MEDIDA QUE NÃO CONFERE. A página avisa "a foto tem 1200 por 630". Se o
 *    arquivo tiver outra medida, o cartão sai cortado ou torto — é a moldura
 *    comprada sem medir o quadro.
 */

const RAIZ = process.cwd();
const RAIZ_DO_SITE = "https://flycontrol.conectfly.com.br";

const cabecalho = readFileSync(join(RAIZ, "src", "routes", "__root.tsx"), "utf8");

/** Todos os valores anunciados para uma etiqueta do cabeçalho. */
function valoresDe(etiqueta: string): string[] {
  const chave = etiqueta.startsWith("twitter:") ? "name" : "property";
  const busca = new RegExp(
    `\\{\\s*${chave}:\\s*"${etiqueta}"\\s*,\\s*content:\\s*([^}]+?)\\s*\\}`,
    "g",
  );
  return [...cabecalho.matchAll(busca)].map((m) => m[1].trim());
}

/**
 * O endereço da imagem fica guardado numa constante, então o cabeçalho traz o
 * nome dela e não o texto. Aqui a gente troca o nome pelo valor.
 */
function resolverConstante(nome: string): string {
  if (nome.startsWith('"')) return nome.slice(1, -1);
  const achado = cabecalho.match(new RegExp(`const ${nome} =\\s*\\n?\\s*"([^"]+)"`));
  if (!achado) throw new Error(`Não achei o valor de ${nome} em __root.tsx`);
  return achado[1];
}

/**
 * Largura e altura de um JPEG, lidas do próprio arquivo.
 *
 * Um JPEG é uma sequência de blocos; o bloco que guarda a medida começa com
 * os bytes 0xFF 0xC0 (ou primos dele). Achar esse bloco é abrir a caixa e
 * conferir o que veio dentro, em vez de acreditar no que está escrito por
 * fora.
 */
function medidaDoJpeg(caminho: string): { largura: number; altura: number } {
  const bytes = readFileSync(caminho);
  let i = 2; // pula o 0xFFD8 de abertura
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marcador = bytes[i + 1];
    const ehBlocoDeMedida =
      marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador);
    if (ehBlocoDeMedida) {
      return { altura: bytes.readUInt16BE(i + 5), largura: bytes.readUInt16BE(i + 7) };
    }
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  throw new Error(`Não consegui ler a medida de ${caminho}`);
}

describe("prévia do link no WhatsApp e nas redes", () => {
  it("anuncia uma única imagem, e a mesma no Twitter/X", () => {
    const noOg = valoresDe("og:image");
    const noTwitter = valoresDe("twitter:image");
    expect(noOg).toHaveLength(1);
    expect(noTwitter).toHaveLength(1);
    expect(resolverConstante(noTwitter[0])).toBe(resolverConstante(noOg[0]));
  });

  it("usa endereço completo, em https, e hospedado no nosso próprio domínio", () => {
    const endereco = resolverConstante(valoresDe("og:image")[0]);
    expect(endereco.startsWith(`${RAIZ_DO_SITE}/`)).toBe(true);
  });

  it("não sobrou nenhuma imagem hospedada fora daqui", () => {
    expect(cabecalho).not.toMatch(/lovable|r2\.dev|blob:|data:image/);
  });

  it("o arquivo existe mesmo em public/ e é um JPEG", () => {
    const endereco = resolverConstante(valoresDe("og:image")[0]);
    const arquivo = join(RAIZ, "public", endereco.replace(`${RAIZ_DO_SITE}/`, ""));
    expect(existsSync(arquivo)).toBe(true);
    // Acima de 5 MB o WhatsApp desiste de baixar e mostra o link sem foto.
    expect(statSync(arquivo).size).toBeLessThan(5 * 1024 * 1024);
    expect(valoresDe("og:image:type")).toEqual(['"image/jpeg"']);
  });

  it("a medida anunciada é a medida real do arquivo (1200 × 630)", () => {
    const endereco = resolverConstante(valoresDe("og:image")[0]);
    const arquivo = join(RAIZ, "public", endereco.replace(`${RAIZ_DO_SITE}/`, ""));
    const real = medidaDoJpeg(arquivo);
    expect(real).toEqual({ largura: 1200, altura: 630 });
    expect(valoresDe("og:image:width")).toEqual(['"1200"']);
    expect(valoresDe("og:image:height")).toEqual(['"630"']);
  });

  it("título, descrição e endereço da página estão preenchidos", () => {
    for (const etiqueta of ["og:title", "og:description", "og:url", "og:type"]) {
      expect(valoresDe(etiqueta)).toHaveLength(1);
    }
    expect(resolverConstante(valoresDe("og:url")[0])).toBe(`${RAIZ_DO_SITE}/`);
    expect(valoresDe("twitter:card")).toEqual(['"summary_large_image"']);
  });
});
