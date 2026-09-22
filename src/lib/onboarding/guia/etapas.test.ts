import { describe, expect, it } from "vitest";
import {
  ETAPAS_ATIVAS,
  ETAPAS_DO_GUIA,
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
