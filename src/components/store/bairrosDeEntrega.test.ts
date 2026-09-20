import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * As travas da tela de bairros que não dá para conferir só olhando.
 *
 * Aqui se mexe em duas coisas caras ao mesmo tempo: o PREÇO que o cliente vê
 * e a LISTA de onde a loja entrega. Um erro em qualquer uma aparece no caixa,
 * não na tela do programador.
 */
const tela = readFileSync("src/components/store/DeliveryZonesManager.tsx", "utf8");

describe("excluir todos os bairros", () => {
  it("existe o botão e ele pede confirmação antes", () => {
    // Apagar a lista inteira com um toque, sem perguntar, é a tecla que
    // ninguém quer encostar sem querer no celular.
    expect(tela).toContain("Excluir todos");
    expect(tela).toContain("AlertDialog");
    expect(tela).toContain("Sim, excluir todos");
  });

  it("a confirmação diz o que acontece depois, não só 'tem certeza?'", () => {
    // O efeito real é o cliente de QUALQUER bairro passar a pagar a taxa
    // padrão. Quem lê "tem certeza?" não descobre isso.
    expect(tela).toContain("Taxa de Entrega Padrão");
  });

  it("limpa um por um pelo mesmo caminho de sempre", () => {
    // Um `delete` direto no banco apagaria os bairros do painel e deixaria
    // todos de pé no site do cliente — sem nenhum jeito de tirá-los de lá.
    const inicio = tela.indexOf("async function limparTudo");
    const bloco = tela.slice(inicio, tela.indexOf("if (carregando)"));
    expect(bloco).toContain("await removerUma(zona)");
    expect(bloco).not.toMatch(/\.delete\(\)/);
  });

  it("bairro que não saiu do cardápio CONTINUA na lista", () => {
    // Dizer "pronto, apagou tudo" com bairro ainda no ar é pior do que não
    // ter o botão: o dono para de procurar o problema.
    const inicio = tela.indexOf("async function limparTudo");
    const bloco = tela.slice(inicio, tela.indexOf("if (carregando)"));
    expect(bloco).toContain("sobraram.push(zona)");
    expect(bloco).toContain("setZonas(sobraram)");
    // E o aviso precisa dizer QUAIS ficaram, por nome.
    expect(bloco).toMatch(/sobraram[\s\S]*\.map\(\(z\) => z\.neighborhood\)/);
  });
});

describe("tirar um bairro do ar", () => {
  it("sai do cardápio ANTES de sair do painel", () => {
    // Na ordem contrária, uma falha na publicação sumiria com o bairro do
    // painel e o deixaria de pé no site: o cliente escolheria um bairro que a
    // loja não atende mais, e o dono não teria como corrigir, porque a linha
    // já não existiria para ele.
    const inicio = tela.indexOf("async function removerUma");
    const bloco = tela.slice(inicio, tela.indexOf("async function remover(", inicio));
    const posPublicar = bloco.indexOf('publicar("delete"');
    const posApagar = bloco.indexOf('.from("delivery_zones")');
    expect(posPublicar).toBeGreaterThan(0);
    expect(posApagar).toBeGreaterThan(posPublicar);
  });
});

describe("editar um bairro já cadastrado", () => {
  it("nome e taxa são editáveis na própria linha", () => {
    // Corrigir um erro de digitação no nome não pode exigir apagar e
    // cadastrar de novo: apagar tira o bairro do cardápio no meio do
    // expediente, e quem estava escolhendo naquele instante perde a opção.
    const inicio = tela.indexOf("async function salvarLinha");
    const bloco = tela.slice(inicio, tela.indexOf("async function removerUma"));
    expect(bloco).toContain("neighborhood: bairro");
    expect(bloco).toContain("fee: taxa");
  });

  it("não grava nada enquanto o dono não mandar salvar", () => {
    // Antes a taxa era gravada sozinha quando o campo perdia o foco. No
    // celular isso é invisível: ele toca em outro lugar e não sabe se salvou.
    expect(tela).not.toContain("onBlur");
    expect(tela).toContain("Salvar");
    expect(tela).toContain("Desfazer");
  });

  it("o botão de salvar só aparece quando algo mudou", () => {
    // Botão de salvar sempre à vista em toda linha vira ruído, e ruído a
    // gente aprende a não ler.
    expect(tela).toContain("const mudou = foiAlterada(zona)");
    expect(tela).toMatch(/\{mudou && \(/);
  });

  it("nome em branco é recusado", () => {
    expect(tela).toContain("O nome do bairro não pode ficar em branco.");
  });

  it("nome repetido é recusado, na tela e no banco", () => {
    // A tela pode estar desatualizada; o índice único do banco não.
    const inicio = tela.indexOf("async function salvarLinha");
    const bloco = tela.slice(inicio, tela.indexOf("async function removerUma"));
    expect(bloco).toContain("já está na lista");
    expect(bloco).toContain('"23505"');
  });
});

describe("o preço que o cliente vai pagar", () => {
  it("a leitura da taxa vem do módulo testado, não é refeita aqui", () => {
    // Duas cópias da mesma regra é como acabou existindo a que lia "5.00"
    // como quinhentos: uma delas foi corrigida e a outra não.
    expect(tela).toContain('from "@/lib/store/taxaDeEntrega"');
    expect(tela).not.toMatch(/function lerTaxa/);
    expect(tela).not.toMatch(/replace\(\/\\\.\/g, ""\)/);
  });

  it("valor alto demais pede confirmação antes de ir para o cardápio", () => {
    // R$ 500 de entrega nunca é de propósito. Uma pergunta a mais é bem mais
    // barata que um cliente perdido.
    expect(tela).toContain("pareceEngano(taxa)");
    expect(tela).toMatch(/Confirma\?/);
  });
});
