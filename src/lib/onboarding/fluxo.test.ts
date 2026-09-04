import { describe, expect, it } from "vitest";
import {
  aplicarResposta,
  etapaAnterior,
  etapasVisiveis,
  limparRespostasQueNaoValemMais,
  progresso,
  proximaEtapaPendente,
  resumo,
  terminou,
} from "./fluxo";
import { ETAPAS, type Respostas } from "./perguntas";

/**
 * O motor do onboarding.
 *
 * O QUE ESTES TESTES PROTEGEM
 *
 * O caminho de cada cliente é diferente: quem não faz entrega responde menos
 * perguntas. E o cliente pode voltar e mudar de ideia no meio. O defeito
 * clássico aqui é o questionário continuar acreditando na resposta antiga —
 * o garçom que já anotou a bebida e não ouve o cliente mudar de ideia.
 */

describe("quais perguntas aparecem", () => {
  it("quem não atende em mesas não é perguntado sobre comandas", () => {
    const r: Respostas = { modelo_de_atendimento: ["delivery"] };
    const ids = etapasVisiveis(r).map((e) => e.id);
    expect(ids).not.toContain("mesas_e_comandas");
  });

  it("quem atende em mesas é perguntado sobre comandas", () => {
    const r: Respostas = { modelo_de_atendimento: ["mesas"] };
    expect(etapasVisiveis(r).map((e) => e.id)).toContain("mesas_e_comandas");
  });

  it("quem não faz delivery não é perguntado sobre entregadores", () => {
    const r: Respostas = { modelo_de_atendimento: ["balcao"] };
    expect(etapasVisiveis(r).map((e) => e.id)).not.toContain("entregas");
  });

  it("quem faz delivery é perguntado sobre entregadores", () => {
    const r: Respostas = { modelo_de_atendimento: ["delivery", "retirada"] };
    expect(etapasVisiveis(r).map((e) => e.id)).toContain("entregas");
  });

  it("quem não tem cardápio não é perguntado de onde importar", () => {
    const r: Respostas = { cardapio_existente: ["nao_tenho"] };
    expect(etapasVisiveis(r).map((e) => e.id)).not.toContain("como_trazer_o_cardapio");
  });

  it("quem tem cardápio é perguntado como quer trazê-lo", () => {
    const r: Respostas = { cardapio_existente: ["pdf"] };
    expect(etapasVisiveis(r).map((e) => e.id)).toContain("como_trazer_o_cardapio");
  });

  it("no começo, antes de qualquer resposta, só aparecem as perguntas de todo mundo", () => {
    const ids = etapasVisiveis({}).map((e) => e.id);
    expect(ids).not.toContain("mesas_e_comandas");
    expect(ids).not.toContain("entregas");
    expect(ids).not.toContain("como_trazer_o_cardapio");
    expect(ids).toContain("tipo_de_negocio");
  });
});

describe("mudar de ideia no meio do caminho", () => {
  it("desmarcar delivery joga fora a resposta sobre entregadores", () => {
    let r: Respostas = {};
    r = aplicarResposta(r, "modelo_de_atendimento", ["delivery"]);
    r = aplicarResposta(r, "entregas", ["proprios"]);
    expect(r.entregas).toEqual(["proprios"]);

    // Voltou e trocou: agora só atende no balcão.
    r = aplicarResposta(r, "modelo_de_atendimento", ["balcao"]);
    expect(r.entregas).toBeUndefined();
  });

  it("dizer que não tem cardápio joga fora a escolha de como importar", () => {
    let r: Respostas = {};
    r = aplicarResposta(r, "cardapio_existente", ["pdf"]);
    r = aplicarResposta(r, "como_trazer_o_cardapio", ["importar"]);
    expect(r.como_trazer_o_cardapio).toEqual(["importar"]);

    r = aplicarResposta(r, "cardapio_existente", ["nao_tenho"]);
    expect(r.como_trazer_o_cardapio).toBeUndefined();
  });

  it("a limpeza também apaga o texto livre da pergunta que sumiu", () => {
    const r: Respostas = {
      modelo_de_atendimento: ["balcao"],
      entregas: ["proprios"],
      textoLivre: { entregas: "moto do meu primo" },
    };
    const limpo = limparRespostasQueNaoValemMais(r);
    expect(limpo.entregas).toBeUndefined();
    expect(limpo.textoLivre?.entregas).toBeUndefined();
  });
});

describe("o que o servidor aceita", () => {
  it("opção inventada é jogada fora", () => {
    const r = aplicarResposta({}, "tipo_de_negocio", ["pizzaria", "sou_o_dono_da_plataforma"]);
    expect(r.tipo_de_negocio).toEqual(["pizzaria"]);
  });

  it("pergunta de escolha única guarda uma resposta só", () => {
    const r = aplicarResposta({}, "tipo_de_negocio", ["pizzaria", "acai", "bar"]);
    expect(r.tipo_de_negocio).toHaveLength(1);
  });

  it("pergunta de múltipla escolha guarda todas, sem repetir", () => {
    const r = aplicarResposta({}, "canais_de_pedido", ["whatsapp", "ifood", "whatsapp"]);
    expect(r.canais_de_pedido).toEqual(["whatsapp", "ifood"]);
  });

  it("o texto do 'Outro' só fica enquanto o 'Outro' estiver marcado", () => {
    let r = aplicarResposta({}, "tipo_de_negocio", ["outro"], "Food truck de tapioca");
    expect(r.textoLivre?.tipo_de_negocio).toBe("Food truck de tapioca");

    r = aplicarResposta(r, "tipo_de_negocio", ["pizzaria"]);
    expect(r.textoLivre?.tipo_de_negocio).toBeUndefined();
  });

  it("texto gigante é cortado antes de virar registro", () => {
    const r = aplicarResposta({}, "tipo_de_negocio", ["outro"], "x".repeat(5000));
    expect((r.textoLivre?.tipo_de_negocio ?? "").length).toBeLessThanOrEqual(200);
  });
});

describe("continuar de onde parou", () => {
  it("aponta a primeira pergunta ainda sem resposta", () => {
    const r = aplicarResposta({}, "tipo_de_negocio", ["pizzaria"]);
    expect(proximaEtapaPendente(r)).toBe("canais_de_pedido");
  });

  it("terminou quando todas as perguntas do caminho dele foram respondidas", () => {
    let r: Respostas = {};
    // Caminho curto de propósito: sem mesas, sem delivery, sem cardápio.
    r = aplicarResposta(r, "tipo_de_negocio", ["padaria"]);
    r = aplicarResposta(r, "canais_de_pedido", ["balcao"]);
    r = aplicarResposta(r, "volume_mensal", ["0_100"]);
    r = aplicarResposta(r, "modelo_de_atendimento", ["balcao"]);
    r = aplicarResposta(r, "tamanho_da_equipe", ["so_eu"]);
    r = aplicarResposta(r, "quem_vai_usar", ["proprietario"]);
    r = aplicarResposta(r, "cardapio_existente", ["nao_tenho"]);
    r = aplicarResposta(r, "organizacao_atual", ["papel"]);
    r = aplicarResposta(r, "maior_desafio", ["organizar_pedidos"]);
    r = aplicarResposta(r, "objetivo", ["organizar"]);
    r = aplicarResposta(r, "formas_de_pagamento", ["pix", "dinheiro"]);
    expect(terminou(r)).toBe(true);
  });

  it("quem faz delivery e mesas responde MAIS perguntas que quem só atende no balcão", () => {
    const curto = etapasVisiveis({
      modelo_de_atendimento: ["balcao"],
      cardapio_existente: ["nao_tenho"],
    });
    const longo = etapasVisiveis({
      modelo_de_atendimento: ["delivery", "mesas"],
      cardapio_existente: ["pdf"],
    });
    expect(longo.length).toBeGreaterThan(curto.length);
  });
});

describe("a barra de progresso", () => {
  it("nunca passa de 100", () => {
    let r: Respostas = {};
    for (const e of ETAPAS) r = aplicarResposta(r, e.id, [e.opcoes[0]?.valor ?? ""]);
    expect(progresso(r, null)).toBeLessThanOrEqual(100);
  });

  it("na primeira pergunta já sai do zero", () => {
    // Barra parada em 0% dá a sensação de que nada aconteceu.
    expect(progresso({}, "tipo_de_negocio")).toBeGreaterThan(0);
  });

  it("é medida no caminho DESTE cliente, não num total inventado", () => {
    // Mesmas duas respostas dadas; caminhos de tamanhos diferentes.
    const soBalcao = aplicarResposta(
      aplicarResposta({}, "tipo_de_negocio", ["padaria"]),
      "modelo_de_atendimento",
      ["balcao"],
    );
    const comTudo = aplicarResposta(
      aplicarResposta({}, "tipo_de_negocio", ["pizzaria"]),
      "modelo_de_atendimento",
      ["delivery", "mesas"],
    );
    expect(progresso(soBalcao, null)).toBeGreaterThan(progresso(comTudo, null));
  });
});

describe("voltar", () => {
  it("volta para a pergunta anterior do caminho dele, pulando as que não aparecem", () => {
    const r: Respostas = { modelo_de_atendimento: ["balcao"] };
    // Sem mesas, a pergunta antes de "tamanho da equipe" é a de atendimento.
    expect(etapaAnterior(r, "tamanho_da_equipe")).toBe("modelo_de_atendimento");
  });

  it("na primeira pergunta não há para onde voltar", () => {
    expect(etapaAnterior({}, "tipo_de_negocio")).toBeNull();
  });
});

describe("o resumo do final", () => {
  it("mostra o essencial em poucas linhas, sem virar relatório", () => {
    let r: Respostas = {};
    r = aplicarResposta(r, "tipo_de_negocio", ["pizzaria"]);
    r = aplicarResposta(r, "modelo_de_atendimento", ["delivery", "retirada"]);
    r = aplicarResposta(r, "volume_mensal", ["251_500"]);
    r = aplicarResposta(r, "canais_de_pedido", ["whatsapp", "ifood"]);
    const linhas = resumo(r);
    expect(linhas.length).toBeLessThanOrEqual(4);
    expect(linhas.map((l) => l.texto).join(" | ")).toContain("Pizzaria");
    expect(linhas.map((l) => l.texto).join(" | ")).toContain("251 a 500");
  });
});
