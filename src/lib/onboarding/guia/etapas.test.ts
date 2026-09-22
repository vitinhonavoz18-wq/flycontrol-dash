import { describe, expect, it } from "vitest";
import {
  ETAPAS_ATIVAS,
  ETAPAS_DO_GUIA,
  decisaoValida,
  enderecoDaEtapa,
  etapasAtendidas,
  etapasConcluidas,
  progressoDoGuia,
  proximaEtapaDoGuia,
  rotaPermitidaNoGuia,
  type IdDaEtapaDoGuia,
  type SinaisDaConfiguracao,
} from "./etapas";

/**
 * O guia de configuração da loja.
 *
 * O QUE ESTES TESTES PROTEGEM
 *
 * Que nenhuma etapa se feche por clique. Um guia que avança no botão deixa o
 * lojista terminar achando que está pronto para vender, abrir a loja no
 * sábado à noite e descobrir que não tem cardápio. É o boletim que dá nota
 * para matéria que ninguém deu.
 */

/** Uma loja recém-criada: nada preenchido. */
const ZERADA: SinaisDaConfiguracao = {
  temNome: false,
  temContato: false,
  temEndereco: false,
  temHorario: false,
  temFormaDeAtendimento: false,
  categorias: 0,
  produtos: 0,
  adicionais: 0,
  formasDePagamento: 0,
  whatsappValido: false,
};

const loja = (p: Partial<SinaisDaConfiguracao>): SinaisDaConfiguracao => ({ ...ZERADA, ...p });

describe("etapa só fecha com dado real", () => {
  it("loja recém-criada não tem nenhuma etapa feita", () => {
    expect(etapasAtendidas(ZERADA)).toEqual([]);
    expect(progressoDoGuia([])).toBe(0);
  });

  it("estabelecimento exige nome, contato E endereço — não dois de três", () => {
    // Loja sem endereço não consegue entregar, e loja sem telefone não recebe
    // o cliente que quer confirmar o pedido.
    expect(etapasAtendidas(loja({ temNome: true, temContato: true }))).not.toContain(
      "estabelecimento",
    );
    expect(etapasAtendidas(loja({ temNome: true, temContato: true, temEndereco: true }))).toContain(
      "estabelecimento",
    );
  });

  it("produto só conta se tiver preço", () => {
    // Quem lê os sinais só conta produto com preço acima de zero; aqui a
    // garantia é de que a etapa espelha isso.
    expect(etapasAtendidas(loja({ produtos: 0 }))).not.toContain("produto");
    expect(etapasAtendidas(loja({ produtos: 1 }))).toContain("produto");
  });

  it("uma categoria basta para a vitrine começar", () => {
    expect(etapasAtendidas(loja({ categorias: 1 }))).toContain("categoria");
  });

  it("funcionamento precisa de horário E de uma forma de atender", () => {
    expect(etapasAtendidas(loja({ temHorario: true }))).not.toContain("funcionamento");
    expect(etapasAtendidas(loja({ temHorario: true, temFormaDeAtendimento: true }))).toContain(
      "funcionamento",
    );
  });
});

describe("etapa concluída não volta a ser cobrada", () => {
  it("apagar o produto depois não reabre a etapa", () => {
    // O lojista cadastra o primeiro produto, o guia segue, e depois ele apaga
    // esse produto para refazer. Reabrir a etapa o puxaria de volta para o
    // cardápio no meio de outra coisa — a porta que se tranca de novo atrás
    // de quem já passou.
    const agora = loja({ produtos: 0, categorias: 1 });
    expect(etapasConcluidas(agora, ["produto"])).toContain("produto");
  });

  it("lixo guardado no banco é ignorado", () => {
    // Se alguém gravar um nome de etapa que não existe, ele não pode virar
    // progresso fantasma.
    expect(etapasConcluidas(ZERADA, ["etapa_inventada", ""])).toEqual([]);
  });

  it("a ordem devolvida é a do roteiro, não a da confirmação", () => {
    const fora = ["produto", "estabelecimento"] as IdDaEtapaDoGuia[];
    expect(etapasConcluidas(ZERADA, fora)).toEqual(["estabelecimento", "produto"]);
  });
});

describe("para onde o guia manda", () => {
  it("manda para a primeira etapa em aberto, na ordem", () => {
    expect(proximaEtapaDoGuia([])?.id).toBe("estabelecimento");
    expect(proximaEtapaDoGuia(["estabelecimento"])?.id).toBe("funcionamento");
    expect(proximaEtapaDoGuia(["estabelecimento", "funcionamento"])?.id).toBe("categoria");
  });

  it("com tudo feito, não há mais para onde mandar", () => {
    const todas = ETAPAS_ATIVAS.map((e) => e.id);
    expect(proximaEtapaDoGuia(todas)).toBeNull();
    expect(progressoDoGuia(todas)).toBe(100);
  });

  it("a etapa que mora numa aba leva a aba no endereço", () => {
    // Sem isso o guia manda para "Minha Loja" e ilumina um campo escondido
    // atrás de outra das sete abas: é dar o endereço sem dizer o andar.
    const funcionamento = ETAPAS_DO_GUIA.find((e) => e.id === "funcionamento")!;
    expect(enderecoDaEtapa(funcionamento)).toBe("/my-store?aba=service");
    const categoria = ETAPAS_DO_GUIA.find((e) => e.id === "categoria")!;
    expect(enderecoDaEtapa(categoria)).toBe("/menu");
  });
});

describe("o guia bloqueia, mas nunca tranca", () => {
  const etapa = ETAPAS_DO_GUIA.find((e) => e.id === "categoria")!;

  it("a rota da etapa é permitida", () => {
    expect(rotaPermitidaNoGuia("/menu", etapa)).toBe(true);
  });

  it("as outras telas do painel não são", () => {
    // Não basta bloquear o clique: nada impede alguém de digitar /finance na
    // barra de endereços. É trancar a porta da frente e deixar a lateral
    // encostada.
    expect(rotaPermitidaNoGuia("/finance", etapa)).toBe(false);
    expect(rotaPermitidaNoGuia("/dashboard", etapa)).toBe(false);
  });

  it("documentação, cobrança e configurações continuam abertas", () => {
    // Trancar o lojista fora da página de pagamento ou do suporte
    // transformaria um guia em sequestro.
    expect(rotaPermitidaNoGuia("/docs", etapa)).toBe(true);
    expect(rotaPermitidaNoGuia("/billing", etapa)).toBe(true);
    expect(rotaPermitidaNoGuia("/settings", etapa)).toBe(true);
  });

  it("sem etapa, nada é bloqueado", () => {
    expect(rotaPermitidaNoGuia("/finance", null)).toBe(true);
  });
});

describe("o roteiro em si", () => {
  it("toda etapa tem rota, título e uma frase do que falta", () => {
    for (const e of ETAPAS_DO_GUIA) {
      expect(e.rota.startsWith("/"), `${e.id} sem rota`).toBe(true);
      expect(e.titulo.length, `${e.id} sem título`).toBeGreaterThan(0);
      expect(e.comoConcluir.length, `${e.id} sem "como concluir"`).toBeGreaterThan(0);
    }
  });

  it("não existe id repetido", () => {
    const ids = ETAPAS_DO_GUIA.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("as etapas 'em breve' ficam fora da conta do progresso", () => {
    // Elas aparecem na lista para o lojista ver o caminho inteiro, mas
    // contá-las deixaria a barra travada abaixo de 50% para sempre — e uma
    // barra que não chega ao fim é a que faz a pessoa desistir.
    expect(ETAPAS_ATIVAS.every((e) => !e.emBreve)).toBe(true);
    expect(ETAPAS_ATIVAS.length).toBeLessThan(ETAPAS_DO_GUIA.length);
  });

  it("nenhuma etapa ativa se conclui sozinha com a loja zerada", () => {
    // Um `concluida: () => true` esquecido em qualquer etapa faria o guia
    // inteiro pular sem o lojista configurar nada.
    expect(etapasAtendidas(ZERADA)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FASES 4, 5 E 6
// ═══════════════════════════════════════════════════════════════════════════

describe("adicionais: duas respostas fecham a etapa", () => {
  const feitasAte = (): IdDaEtapaDoGuia[] => [
    "estabelecimento",
    "funcionamento",
    "categoria",
    "produto",
  ];

  it("um complemento cadastrado fecha", () => {
    expect(etapasAtendidas(loja({ adicionais: 1 }))).toContain("adicionais");
  });

  it('"não utilizo adicionais" também fecha', () => {
    // Obrigar uma hamburgueria sem adicionais a inventar um só para destravar
    // o guia seria pedir para ela sujar o próprio cardápio.
    expect(etapasAtendidas(ZERADA, { adicionais: "dispensado" })).toContain("adicionais");
  });

  it("sem adicional e sem resposta, a etapa continua aberta", () => {
    expect(etapasAtendidas(ZERADA)).not.toContain("adicionais");
    expect(proximaEtapaDoGuia(feitasAte())?.id).toBe("adicionais");
  });

  it("a pergunta não volta depois de respondida", () => {
    // Sem guardar a resposta, o guia perguntaria a mesma coisa para sempre —
    // o garçom que volta de cinco em cinco minutos oferecendo sobremesa.
    const concluidas = etapasConcluidas(ZERADA, feitasAte(), { adicionais: "dispensado" });
    expect(proximaEtapaDoGuia(concluidas)?.id).not.toBe("adicionais");
  });

  it("a etapa oferece as duas portas na tela", () => {
    const etapa = ETAPAS_DO_GUIA.find((e) => e.id === "adicionais")!;
    expect(etapa.escolha?.configurar).toBe("Configurar adicionais");
    expect(etapa.escolha?.dispensar).toBe("Não utilizo adicionais");
    expect(enderecoDaEtapa(etapa)).toBe("/menu?aba=extras");
  });
});

describe("pagamentos e canal de pedidos", () => {
  it("pagamento fecha com uma forma ligada", () => {
    expect(etapasAtendidas(loja({ formasDePagamento: 0 }))).not.toContain("pagamentos");
    expect(etapasAtendidas(loja({ formasDePagamento: 1 }))).toContain("pagamentos");
  });

  it("pagamento NÃO aceita resposta do lojista, só dado", () => {
    // Não existe "não aceito pagamento": loja que não recebe não vende.
    const etapa = ETAPAS_DO_GUIA.find((e) => e.id === "pagamentos")!;
    expect(etapa.escolha).toBeUndefined();
    expect(etapa.concluida(ZERADA, { adicionais: "dispensado" })).toBe(false);
  });

  it("o canal de pedidos exige número VÁLIDO, não só preenchido", () => {
    // `temContato` aceita qualquer coisa escrita; aqui a pergunta é se dá
    // para mandar mensagem naquele número. Um número pela metade faz o
    // pedido do cliente cair no vazio, e o lojista nunca fica sabendo.
    expect(etapasAtendidas(loja({ temContato: true }))).not.toContain("whatsapp");
    expect(etapasAtendidas(loja({ whatsappValido: true }))).toContain("whatsapp");
  });

  it("cada etapa nova aponta para uma aba real da tela", () => {
    const pagamentos = ETAPAS_DO_GUIA.find((e) => e.id === "pagamentos")!;
    const canal = ETAPAS_DO_GUIA.find((e) => e.id === "whatsapp")!;
    expect(enderecoDaEtapa(pagamentos)).toBe("/my-store?aba=delivery");
    expect(enderecoDaEtapa(canal)).toBe("/my-store?aba=service");
  });
});

describe("o resumo de prontidão", () => {
  const tudoMenosProntidao: IdDaEtapaDoGuia[] = [
    "estabelecimento",
    "funcionamento",
    "categoria",
    "produto",
    "adicionais",
    "pagamentos",
    "whatsapp",
  ];

  it("é a última etapa, depois do canal de pedidos", () => {
    expect(proximaEtapaDoGuia(tudoMenosProntidao)?.id).toBe("prontidao");
  });

  it("o guia NÃO termina antes de o lojista ver o resumo", () => {
    // Sem isso a plataforma abriria sozinha assim que o WhatsApp fosse
    // salvo, e o lojista nunca saberia o que ficou configurado.
    expect(proximaEtapaDoGuia(tudoMenosProntidao)).not.toBeNull();
  });

  it("depois de visto, o guia acaba", () => {
    const concluidas = etapasConcluidas(
      loja({ whatsappValido: true, formasDePagamento: 1, adicionais: 1 }),
      tudoMenosProntidao,
      { prontidao: "visto" },
    );
    expect(proximaEtapaDoGuia(concluidas)).toBeNull();
    expect(progressoDoGuia(concluidas)).toBe(100);
  });
});

describe("o que a tela manda não é aceito como veio", () => {
  it("só as decisões do catálogo são aceitas", () => {
    // Sem isto, bastaria uma requisição inventada para gravar
    // "pagamentos: dispensado" e pular uma etapa que exige dado de verdade —
    // a porta dos fundos do guia inteiro.
    expect(decisaoValida("adicionais", "dispensado")).toBe(true);
    expect(decisaoValida("prontidao", "visto")).toBe(true);
    expect(decisaoValida("pagamentos", "dispensado")).toBe(false);
    expect(decisaoValida("whatsapp", "dispensado")).toBe(false);
    expect(decisaoValida("adicionais", "qualquer_coisa")).toBe(false);
    expect(decisaoValida("__proto__", "x")).toBe(false);
  });
});

describe("retomar de onde parou", () => {
  it("o mesmo estado devolve sempre a mesma etapa", () => {
    // Recarregar a página, voltar no navegador, entrar por outro aparelho:
    // são todos a mesma coisa para o servidor, que recalcula do zero. Não
    // existe passo guardado no navegador para divergir.
    const sinais = loja({ temNome: true, temContato: true, temEndereco: true });
    const a = etapasConcluidas(sinais, [], {});
    const b = etapasConcluidas(sinais, [], {});
    expect(a).toEqual(b);
    expect(proximaEtapaDoGuia(a)?.id).toBe("funcionamento");
  });

  it("gravar a mesma decisão duas vezes dá o mesmo resultado", () => {
    // O lojista com internet lenta toca o botão três vezes.
    const uma = etapasConcluidas(ZERADA, ["adicionais"], { adicionais: "dispensado" });
    const duas = etapasConcluidas(ZERADA, [...uma, "adicionais"], { adicionais: "dispensado" });
    expect(duas).toEqual(uma);
    expect(uma.filter((e) => e === "adicionais")).toHaveLength(1);
  });

  it("uma loja já configurada entra com as etapas dela já fechadas", () => {
    // Conta antiga não pode ser obrigada a refazer o que já fez.
    const pronta = loja({
      temNome: true,
      temContato: true,
      temEndereco: true,
      temHorario: true,
      temFormaDeAtendimento: true,
      categorias: 3,
      produtos: 20,
      adicionais: 5,
      formasDePagamento: 2,
      whatsappValido: true,
    });
    expect(proximaEtapaDoGuia(etapasConcluidas(pronta, []))?.id).toBe("prontidao");
    expect(progressoDoGuia(etapasConcluidas(pronta, []))).toBeGreaterThanOrEqual(87);
  });
});
