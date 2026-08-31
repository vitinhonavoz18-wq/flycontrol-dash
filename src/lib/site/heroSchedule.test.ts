import { describe, expect, it } from "vitest";
import {
  CHAVE_NO_SITE_SETTINGS,
  FUSO_PADRAO,
  MINUTOS_POR_SEMANA,
  capaDoMomento,
  conflitos,
  conflitosDoCandidato,
  horarioDosMinutos,
  intervalosDaSemana,
  lerProgramacao,
  minutoDaSemana,
  minutosDoHorario,
  ordenarPeriodos,
  paraGravar,
  periodoCobre,
  proximaTroca,
  relogioNaLoja,
  resumoDosDias,
  type DiaDaSemana,
  type PeriodoDoHero,
  type ProgramacaoDoHero,
} from "./heroSchedule";

/**
 * A promessa que não pode ser quebrada: LOJA QUE NÃO CONFIGUROU NADA CONTINUA
 * COM A CAPA QUE SEMPRE TEVE.
 *
 * Depois disso vêm as contas de horário — que são onde mora a dificuldade,
 * principalmente na virada da meia-noite e na virada da semana.
 */

const CAPA_FIXA = { tipo: "imagem" as const, url: "capa-fixa.webp" };

function periodo(p: Partial<PeriodoDoHero> = {}): PeriodoDoHero {
  return {
    id: p.id ?? "p1",
    nome: p.nome ?? "Período",
    inicio: p.inicio ?? "06:00",
    fim: p.fim ?? "11:59",
    dias: p.dias ?? [0, 1, 2, 3, 4, 5, 6],
    tipo: p.tipo ?? "imagem",
    url: p.url ?? "manha.webp",
    ativo: p.ativo ?? true,
  };
}

function programacao(p: Partial<ProgramacaoDoHero> = {}): ProgramacaoDoHero {
  return {
    modo: p.modo ?? "programado",
    automacaoLigada: p.automacaoLigada ?? true,
    fuso: p.fuso ?? FUSO_PADRAO,
    periodos: p.periodos ?? [],
  };
}

/** Um instante em São Paulo, escrito do jeito que a gente pensa. */
function emSaoPaulo(dataHora: string): Date {
  // -03:00 é o fuso de Brasília desde o fim do horário de verão (2019).
  return new Date(`${dataHora}-03:00`);
}

// ---------------------------------------------------------------------------

describe("nada muda para quem não configurou", () => {
  it.each([
    ["sem configurações", null],
    ["configurações vazias", {}],
    ["só outras configurações", { menu_layout: "generic", menu_texts: { menu_title: "X" } }],
    ["programação nula", { [CHAVE_NO_SITE_SETTINGS]: null }],
    ["programação em formato errado", { [CHAVE_NO_SITE_SETTINGS]: "texto" }],
    ["programação que virou lista", { [CHAVE_NO_SITE_SETTINGS]: [] }],
  ])("%s: modo fixo, automação desligada", (_caso, entrada) => {
    const p = lerProgramacao(entrada);
    expect(p.modo).toBe("fixo");
    expect(p.automacaoLigada).toBe(false);
    expect(p.periodos).toEqual([]);
    expect(p.fuso).toBe(FUSO_PADRAO);
  });

  it("no modo fixo, a capa é a de sempre — mesmo com períodos cadastrados", () => {
    const c = capaDoMomento(
      programacao({ modo: "fixo", periodos: [periodo()] }),
      CAPA_FIXA,
      emSaoPaulo("2026-08-31T08:00:00"),
    );
    expect(c.url).toBe("capa-fixa.webp");
    expect(c.motivo).toBe("modo_fixo");
    expect(c.periodo).toBeNull();
  });
});

describe("a capa certa na hora certa", () => {
  const manha = periodo({
    id: "manha",
    inicio: "06:00",
    fim: "11:59",
    url: "cafe.mp4",
    tipo: "video",
  });
  const almoco = periodo({ id: "almoco", inicio: "12:00", fim: "15:59", url: "almoco.webp" });
  const noite = periodo({
    id: "noite",
    inicio: "19:00",
    fim: "23:59",
    url: "jantar.mp4",
    tipo: "video",
  });
  const prog = programacao({ periodos: [manha, almoco, noite] });

  it.each([
    ["06:00:00", "cafe.mp4"],
    ["08:32:00", "cafe.mp4"],
    ["11:59:59", "cafe.mp4"],
    ["12:00:00", "almoco.webp"],
    ["15:59:59", "almoco.webp"],
    ["19:00:00", "jantar.mp4"],
    ["20:15:00", "jantar.mp4"],
    ["23:59:59", "jantar.mp4"],
  ])("às %s mostra %s", (hora, esperado) => {
    const c = capaDoMomento(prog, CAPA_FIXA, emSaoPaulo(`2026-08-31T${hora}`));
    expect(c.url).toBe(esperado);
    expect(c.motivo).toBe("programado");
  });

  it("o tipo da mídia acompanha o período", () => {
    expect(capaDoMomento(prog, CAPA_FIXA, emSaoPaulo("2026-08-31T08:00:00")).tipo).toBe("video");
    expect(capaDoMomento(prog, CAPA_FIXA, emSaoPaulo("2026-08-31T13:00:00")).tipo).toBe("imagem");
  });

  it("buraco na programação cai na capa fixa", () => {
    // 17:30 não está em nenhum dos três períodos.
    const c = capaDoMomento(prog, CAPA_FIXA, emSaoPaulo("2026-08-31T17:30:00"));
    expect(c.url).toBe("capa-fixa.webp");
    expect(c.motivo).toBe("sem_periodo_no_horario");
  });
});

describe("períodos que atravessam a meia-noite", () => {
  const madrugada = periodo({ id: "vira", inicio: "22:00", fim: "03:00", url: "noite.mp4" });
  const prog = programacao({ periodos: [madrugada] });

  it.each([
    ["2026-08-31T21:59:00", false],
    ["2026-08-31T22:00:00", true],
    ["2026-08-31T23:30:00", true],
    ["2026-09-01T00:00:00", true],
    ["2026-09-01T01:00:00", true],
    ["2026-09-01T03:00:00", true],
    ["2026-09-01T03:00:59", true],
    ["2026-09-01T03:01:00", false],
  ])("%s dentro do período 22:00→03:00? %s", (quando, esperado) => {
    const c = capaDoMomento(prog, CAPA_FIXA, emSaoPaulo(quando));
    expect(c.motivo === "programado").toBe(esperado);
  });

  it("também atravessa a virada da SEMANA", () => {
    // Sábado 23:00 → domingo 02:00. O sábado é o dia 6, o domingo é o 0:
    // sem partir o intervalo, ele passaria do fim da régua e sumiria.
    const p = periodo({ id: "fds", inicio: "23:00", fim: "02:00", dias: [6], url: "fds.mp4" });
    const pr = programacao({ periodos: [p] });
    // 2026-09-05 é um sábado.
    expect(capaDoMomento(pr, CAPA_FIXA, emSaoPaulo("2026-09-05T23:30:00")).motivo).toBe(
      "programado",
    );
    expect(capaDoMomento(pr, CAPA_FIXA, emSaoPaulo("2026-09-06T01:00:00")).motivo).toBe(
      "programado",
    );
    expect(capaDoMomento(pr, CAPA_FIXA, emSaoPaulo("2026-09-06T03:00:00")).motivo).toBe(
      "sem_periodo_no_horario",
    );
  });
});

describe("dias da semana", () => {
  // 2026-08-31 é segunda; 2026-09-05 é sábado.
  const util = periodo({
    id: "util",
    inicio: "08:00",
    fim: "12:00",
    dias: [1, 2, 3, 4, 5],
    url: "util.webp",
  });
  const fds = periodo({ id: "fds", inicio: "08:00", fim: "12:00", dias: [0, 6], url: "fds.webp" });
  const prog = programacao({ periodos: [util, fds] });

  it("segunda mostra a mídia de dia de semana", () => {
    expect(capaDoMomento(prog, CAPA_FIXA, emSaoPaulo("2026-08-31T09:00:00")).url).toBe("util.webp");
  });

  it("sábado mostra a mídia de fim de semana", () => {
    expect(capaDoMomento(prog, CAPA_FIXA, emSaoPaulo("2026-09-05T09:00:00")).url).toBe("fds.webp");
  });

  it("mesmo horário em dias diferentes NÃO é conflito", () => {
    expect(conflitos([util, fds])).toEqual([]);
  });
});

describe("conflitos", () => {
  it("mesmo dia com horários que se cruzam é conflito", () => {
    const a = periodo({ id: "a", inicio: "08:00", fim: "12:00", dias: [1] });
    const b = periodo({ id: "b", inicio: "11:00", fim: "14:00", dias: [1] });
    expect(conflitos([a, b])).toEqual([{ a: "a", b: "b" }]);
  });

  it("períodos que só encostam não conflitam", () => {
    // 06:00→11:59 e 12:00→15:59: o fim é inclusivo, então eles se tocam sem
    // se sobrepor. É o turno da manhã acabando e o da tarde começando.
    const a = periodo({ id: "a", inicio: "06:00", fim: "11:59" });
    const b = periodo({ id: "b", inicio: "12:00", fim: "15:59" });
    expect(conflitos([a, b])).toEqual([]);
  });

  it("um período desligado não atrapalha os outros", () => {
    const a = periodo({ id: "a", inicio: "08:00", fim: "12:00" });
    const b = periodo({ id: "b", inicio: "11:00", fim: "14:00", ativo: false });
    expect(conflitos([a, b])).toEqual([]);
  });

  it("período que vira a meia-noite conflita com a madrugada seguinte", () => {
    const a = periodo({ id: "a", inicio: "22:00", fim: "03:00", dias: [1] });
    const b = periodo({ id: "b", inicio: "02:00", fim: "05:00", dias: [2] });
    expect(conflitos([a, b])).toHaveLength(1);
  });

  it("aponta com QUEM o candidato está batendo", () => {
    const existentes = [
      periodo({ id: "manha", nome: "Manhã", inicio: "06:00", fim: "11:59" }),
      periodo({ id: "noite", nome: "Noite", inicio: "19:00", fim: "23:59" }),
    ];
    const novo = periodo({ id: "novo", inicio: "10:00", fim: "13:00" });
    const bateu = conflitosDoCandidato(novo, existentes);
    expect(bateu.map((p) => p.id)).toEqual(["manha"]);
  });

  it("editar um período não faz ele conflitar consigo mesmo", () => {
    const existentes = [periodo({ id: "manha", inicio: "06:00", fim: "11:59" })];
    const editado = periodo({ id: "manha", inicio: "06:00", fim: "12:30" });
    expect(conflitosDoCandidato(editado, existentes)).toEqual([]);
  });
});

describe("corrente de segurança da capa", () => {
  it("automação desligada volta para a capa fixa, sem apagar os períodos", () => {
    const prog = programacao({ automacaoLigada: false, periodos: [periodo()] });
    const c = capaDoMomento(prog, CAPA_FIXA, emSaoPaulo("2026-08-31T08:00:00"));
    expect(c.url).toBe("capa-fixa.webp");
    expect(c.motivo).toBe("automacao_desligada");
    expect(prog.periodos).toHaveLength(1);
  });

  it("período sem mídia é ignorado", () => {
    const prog = programacao({ periodos: [periodo({ url: "" })] });
    expect(capaDoMomento(prog, CAPA_FIXA, emSaoPaulo("2026-08-31T08:00:00")).motivo).toBe(
      "sem_midia_programada",
    );
  });

  it("período sem nenhum dia marcado é ignorado", () => {
    const prog = programacao({ periodos: [periodo({ dias: [] })] });
    expect(capaDoMomento(prog, CAPA_FIXA, emSaoPaulo("2026-08-31T08:00:00")).motivo).toBe(
      "sem_midia_programada",
    );
  });

  it("horário inválido não derruba o cardápio", () => {
    const prog = programacao({ periodos: [periodo({ inicio: "99:99" })] });
    expect(() => capaDoMomento(prog, CAPA_FIXA, new Date())).not.toThrow();
    expect(capaDoMomento(prog, CAPA_FIXA, new Date()).url).toBe("capa-fixa.webp");
  });

  it("fuso desconhecido não derruba o cardápio", () => {
    const prog = programacao({ fuso: "Planeta/Marte", periodos: [periodo()] });
    expect(() => capaDoMomento(prog, CAPA_FIXA, emSaoPaulo("2026-08-31T08:00:00"))).not.toThrow();
  });

  it("loja sem capa fixa nenhuma devolve vazio em vez de quebrar", () => {
    const c = capaDoMomento(
      programacao({ modo: "fixo" }),
      { tipo: "imagem", url: null },
      new Date(),
    );
    expect(c.url).toBe("");
  });
});

describe("o fuso é o da loja, não o do celular do cliente", () => {
  it("o mesmo instante cai em horários diferentes conforme o fuso", () => {
    // 09:00 em São Paulo é 07:00 no Acre.
    const instante = emSaoPaulo("2026-08-31T09:00:00");
    expect(relogioNaLoja("America/Sao_Paulo", instante).minutos).toBe(9 * 60);
    expect(relogioNaLoja("America/Rio_Branco", instante).minutos).toBe(7 * 60);
  });

  it("uma loja no Acre mostra a capa da manhã quando em SP já é meio-dia", () => {
    const manha = periodo({ id: "m", inicio: "06:00", fim: "11:59", url: "cafe.mp4" });
    const noAcre = programacao({ fuso: "America/Rio_Branco", periodos: [manha] });
    const emSp = programacao({ fuso: "America/Sao_Paulo", periodos: [manha] });

    // 13:00 em São Paulo = 11:00 no Acre.
    const instante = emSaoPaulo("2026-08-31T13:00:00");
    expect(capaDoMomento(noAcre, CAPA_FIXA, instante).url).toBe("cafe.mp4");
    expect(capaDoMomento(emSp, CAPA_FIXA, instante).url).toBe("capa-fixa.webp");
  });

  it("o dia da semana também sai no fuso da loja", () => {
    // Segunda 01:00 em São Paulo ainda é domingo 23:00 no Acre.
    const instante = emSaoPaulo("2026-08-31T01:00:00");
    expect(relogioNaLoja("America/Sao_Paulo", instante).dia).toBe(1);
    expect(relogioNaLoja("America/Rio_Branco", instante).dia).toBe(0);
  });
});

describe("quando é a próxima troca", () => {
  const prog = programacao({
    periodos: [
      periodo({ id: "manha", inicio: "06:00", fim: "11:59" }),
      periodo({ id: "tarde", inicio: "12:00", fim: "18:59" }),
    ],
  });

  it("aponta a virada seguinte, não uma pesquisa de minuto em minuto", () => {
    const agora = emSaoPaulo("2026-08-31T08:00:00");
    const proxima = proximaTroca(prog, agora);
    expect(proxima).not.toBeNull();
    // Das 08:00 até as 12:00 são 4 horas.
    expect(proxima!.getTime() - agora.getTime()).toBe(4 * 60 * 60 * 1000);
  });

  it("desconta os segundos já corridos, para tocar na virada exata", () => {
    const agora = emSaoPaulo("2026-08-31T11:59:30");
    const proxima = proximaTroca(prog, agora);
    expect(proxima!.getTime() - agora.getTime()).toBe(30 * 1000);
  });

  it("no fim do dia aponta para a manhã seguinte", () => {
    const agora = emSaoPaulo("2026-08-31T20:00:00");
    const proxima = proximaTroca(prog, agora);
    // 20:00 até 06:00 do dia seguinte = 10 horas.
    expect(proxima!.getTime() - agora.getTime()).toBe(10 * 60 * 60 * 1000);
  });

  it("sem programação não existe próxima troca", () => {
    expect(proximaTroca(programacao({ periodos: [] }), new Date())).toBeNull();
    expect(proximaTroca(programacao({ modo: "fixo" }), new Date())).toBeNull();
    expect(proximaTroca(programacao({ automacaoLigada: false }), new Date())).toBeNull();
  });

  it("nunca devolve um instante no passado nem imediato demais", () => {
    for (const h of ["00:00:00", "05:59:59", "06:00:00", "12:00:00", "23:59:59"]) {
      const agora = emSaoPaulo(`2026-08-31T${h}`);
      const p = proximaTroca(prog, agora);
      expect(p!.getTime()).toBeGreaterThan(agora.getTime());
    }
  });
});

describe("a capa muda com o cardápio aberto", () => {
  it("o mesmo cardápio devolve capas diferentes conforme o relógio anda", () => {
    const prog = programacao({
      periodos: [
        periodo({ id: "t", inicio: "18:00", fim: "18:59", url: "tarde.webp" }),
        periodo({ id: "n", inicio: "19:00", fim: "23:59", url: "noite.mp4", tipo: "video" }),
      ],
    });
    // Cliente abriu 18:55…
    expect(capaDoMomento(prog, CAPA_FIXA, emSaoPaulo("2026-08-31T18:55:00")).url).toBe(
      "tarde.webp",
    );
    // …e continuou com a página aberta até as 19:00.
    expect(capaDoMomento(prog, CAPA_FIXA, emSaoPaulo("2026-08-31T19:00:00")).url).toBe("noite.mp4");
  });
});

describe("contas de horário", () => {
  it("converte horário em minutos e de volta", () => {
    expect(minutosDoHorario("00:00")).toBe(0);
    expect(minutosDoHorario("07:30")).toBe(450);
    expect(minutosDoHorario("23:59")).toBe(1439);
    expect(horarioDosMinutos(450)).toBe("07:30");
    expect(horarioDosMinutos(0)).toBe("00:00");
  });

  it("recusa horário inválido em vez de chutar", () => {
    for (const ruim of ["", "abc", "24:00", "12:60", "-1:00", "1200", null, undefined, 730]) {
      expect(minutosDoHorario(ruim), String(ruim)).toBeNull();
    }
  });

  it("o intervalo cobre o minuto final inteiro", () => {
    const p = periodo({ inicio: "06:00", fim: "11:59", dias: [1] });
    const [[a, b]] = intervalosDaSemana(p);
    expect(a).toBe(minutoDaSemana(1, 360));
    expect(b).toBe(minutoDaSemana(1, 720)); // fronteira em 12:00
  });

  it("todo minuto da semana tem no máximo um período valendo", () => {
    const p = [
      periodo({ id: "a", inicio: "00:00", fim: "05:59" }),
      periodo({ id: "b", inicio: "06:00", fim: "11:59" }),
      periodo({ id: "c", inicio: "12:00", fim: "18:59" }),
      periodo({ id: "d", inicio: "19:00", fim: "23:59" }),
    ];
    expect(conflitos(p)).toEqual([]);
    for (let m = 0; m < MINUTOS_POR_SEMANA; m += 7) {
      const quantos = p.filter((x) => periodoCobre(x, m)).length;
      expect(quantos, `minuto ${m}`).toBe(1);
    }
  });
});

describe("leitura, gravação e ordem", () => {
  it("ordena por horário sem o lojista precisar arrastar", () => {
    const bagunçado = [
      periodo({ id: "n", inicio: "19:00", fim: "23:59" }),
      periodo({ id: "m", inicio: "06:00", fim: "11:59" }),
      periodo({ id: "t", inicio: "12:00", fim: "18:59" }),
    ];
    expect(ordenarPeriodos(bagunçado).map((p) => p.id)).toEqual(["m", "t", "n"]);
  });

  it("o que grava volta igual ao ler", () => {
    const prog = programacao({
      periodos: [periodo({ id: "m", nome: "Café da manhã", url: "cafe.mp4", tipo: "video" })],
    });
    const lido = lerProgramacao({ [CHAVE_NO_SITE_SETTINGS]: paraGravar(prog) });
    expect(lido.modo).toBe("programado");
    expect(lido.automacaoLigada).toBe(true);
    expect(lido.periodos[0]).toMatchObject({ id: "m", nome: "Café da manhã", url: "cafe.mp4" });
  });

  it("período corrompido é descartado, os bons continuam", () => {
    const lido = lerProgramacao({
      [CHAVE_NO_SITE_SETTINGS]: {
        modo: "programado",
        automacaoLigada: true,
        periodos: [
          { id: "bom", inicio: "06:00", fim: "11:59", dias: [1], url: "a.webp", tipo: "imagem" },
          { inicio: "06:00", fim: "11:59" }, // sem id
          { id: "ruim", inicio: "abc", fim: "11:59" }, // horário inválido
          "nem é objeto",
          null,
        ],
      },
    });
    expect(lido.periodos.map((p) => p.id)).toEqual(["bom"]);
  });

  it("tira marcação de HTML do nome do período", () => {
    const lido = lerProgramacao({
      [CHAVE_NO_SITE_SETTINGS]: {
        periodos: [{ id: "x", inicio: "06:00", fim: "07:00", nome: "<b>Café</b>", dias: [1] }],
      },
    });
    expect(lido.periodos[0].nome).toBe("Café");
  });

  it("dia repetido ou fora da faixa é limpo", () => {
    const lido = lerProgramacao({
      [CHAVE_NO_SITE_SETTINGS]: {
        periodos: [{ id: "x", inicio: "06:00", fim: "07:00", dias: [1, 1, 9, -2, 6] }],
      },
    });
    expect(lido.periodos[0].dias).toEqual([1, 6]);
  });
});

describe("resumo dos dias para o lojista ler rápido", () => {
  it.each([
    [[0, 1, 2, 3, 4, 5, 6], "Todos os dias"],
    [[1, 2, 3, 4, 5], "Seg a Sex"],
    [[0, 6], "Dom, Sáb"],
    [[3], "Qua"],
    [[], "Nenhum dia"],
  ])("%j vira %s", (dias, esperado) => {
    expect(resumoDosDias(dias as DiaDaSemana[])).toBe(esperado);
  });
});

describe("o choque de horário aparece ANTES de enviar a mídia", () => {
  it("período ainda sem mídia já acusa o conflito", () => {
    // O lojista escolhe o horário primeiro e envia o arquivo depois. Se o
    // aviso só viesse depois do envio, ele subiria um vídeo de 20 MB para
    // então descobrir que o horário já estava ocupado.
    const existente = periodo({ id: "manha", nome: "Manhã", inicio: "06:00", fim: "11:59" });
    const semMidia = periodo({ id: "novo", inicio: "10:00", fim: "13:00", url: "" });

    expect(conflitosDoCandidato(semMidia, [existente]).map((p) => p.id)).toEqual(["manha"]);
  });

  it("mas período sem mídia continua fora do ar", () => {
    const prog = programacao({ periodos: [periodo({ url: "" })] });
    expect(capaDoMomento(prog, CAPA_FIXA, emSaoPaulo("2026-08-31T08:00:00")).motivo).toBe(
      "sem_midia_programada",
    );
  });

  it("período desligado não reserva horário nenhum", () => {
    const desligado = periodo({ id: "off", inicio: "06:00", fim: "11:59", ativo: false });
    const novo = periodo({ id: "novo", inicio: "10:00", fim: "13:00", url: "" });
    expect(conflitosDoCandidato(novo, [desligado])).toEqual([]);
  });
});
