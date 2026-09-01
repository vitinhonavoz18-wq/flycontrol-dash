import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Todo o banco de dados mora em DATABASE/supabase/.
 *
 * A pasta `supabase` por dentro não é escolha estética: a ferramenta da
 * Supabase exige esse nome exato. A pasta `DATABASE` por fora é a que dá o
 * nome que faz sentido para quem abre o repositório. As duas juntas só
 * funcionam porque o robô que aplica as migrations é apontado para cá com
 * `--workdir DATABASE`.
 *
 * É esse apontamento que estes testes protegem. Se alguém mover a pasta de
 * volta, ou tirar o `--workdir` de uma linha do workflow, as migrations param
 * de ser aplicadas EM SILÊNCIO — o robô roda, não encontra nada pendente, e
 * dá tudo verde enquanto o banco de produção fica para trás. É o pior tipo de
 * falha: a que não avisa.
 */

const RAIZ = "DATABASE/supabase";
const WORKFLOW = ".github/workflows/migrations.yml";

describe("o banco de dados mora todo em DATABASE/", () => {
  it("as quatro pastas do banco estão no lugar", () => {
    expect(existsSync(`${RAIZ}/config.toml`)).toBe(true);
    expect(existsSync(`${RAIZ}/migrations`)).toBe(true);
    expect(existsSync(`${RAIZ}/functions`)).toBe(true);
    expect(existsSync(`${RAIZ}/rollback`)).toBe(true);
  });

  it("não sobrou arquivo .sql solto fora de DATABASE/", () => {
    // Antes, havia SQL na raiz do projeto e em docs/. Cópia de migration
    // solta é a que diverge da original sem ninguém perceber.
    const forasteiros: string[] = [];
    const varrer = (dir: string) => {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        if (["node_modules", ".git", "DATABASE", ".output", "dist"].includes(item.name)) continue;
        const caminho = `${dir}/${item.name}`;
        if (item.isDirectory()) varrer(caminho);
        else if (item.name.endsWith(".sql")) forasteiros.push(caminho);
      }
    };
    varrer(".");
    expect(forasteiros).toEqual([]);
  });
});

describe("o robô que aplica migrations está apontado para a pasta certa", () => {
  const workflow = () => readFileSync(WORKFLOW, "utf8");

  it("toda chamada do CLI da Supabase leva --workdir DATABASE", () => {
    // Uma linha sem o --workdir faria o CLI procurar na raiz, não achar a
    // pasta `supabase` e falhar (ou pior, achar que não há nada a aplicar).
    const chamadas = workflow()
      .split("\n")
      .filter((l) => /(^|\s)supabase\s/.test(l) && !l.trimStart().startsWith("#"));

    expect(chamadas.length).toBeGreaterThan(0);
    for (const linha of chamadas) {
      expect(linha, `linha sem --workdir: ${linha.trim()}`).toContain("--workdir DATABASE");
    }
  });

  it("o gatilho de push observa o caminho novo", () => {
    // Sem isto, mexer numa migration não dispara o robô: a mudança vai para o
    // main e o banco nunca recebe.
    expect(workflow()).toContain('- "DATABASE/supabase/migrations/**"');
  });

  it("a listagem de migrations do passo de reparo usa o caminho novo", () => {
    expect(workflow()).toContain("ls DATABASE/supabase/migrations/*.sql");
  });
});

describe("padrão de nomes do banco", () => {
  it("está escrito, e não só combinado de boca", () => {
    const leiame = readFileSync("DATABASE/README.md", "utf8");
    expect(leiame).toContain("o código fala inglês, a explicação fala português");
  });

  it("os cinco nomes do mesmo restaurante estão documentados", () => {
    // Enquanto a unificação não acontece, o mapa é o que impede alguém de
    // criar a sexta variação sem saber que já existem cinco.
    const leiame = readFileSync("DATABASE/README.md", "utf8");
    for (const nome of [
      "company_id",
      "tenant_id",
      "pizzeria_id",
      "restaurant_id",
      "target_store_id",
    ]) {
      expect(leiame).toContain(nome);
    }
  });

  it("tabela nova usa tenant_id", () => {
    expect(readFileSync("DATABASE/README.md", "utf8")).toContain(
      "Toda tabela criada daqui em diante usa **`tenant_id`**",
    );
  });
});
