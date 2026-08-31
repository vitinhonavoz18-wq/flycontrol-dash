/**
 * A capa do cardápio que troca sozinha conforme a hora.
 *
 * O QUE ISSO RESOLVE
 *
 * Antes, a capa era uma só: quem quisesse mostrar café da manhã de manhã e
 * pizza à noite tinha que entrar no painel duas vezes por dia para trocar a
 * imagem na mão. Agora o lojista deixa tudo programado uma vez e o cardápio
 * troca sozinho na hora certa.
 *
 * COMO A SEMANA É REPRESENTADA AQUI
 *
 * Tudo vira "minuto da semana": um número de 0 a 10079, onde 0 é domingo à
 * meia-noite e 10079 é sábado às 23:59. É o mesmo truque do relógio de ponto
 * que numera as horas do mês seguido — some o problema de comparar "terça às
 * 23h" com "quarta à 1h", porque viram dois números vizinhos.
 *
 * É isso que faz um período das 22:00 às 03:00 funcionar sem gambiarra: ele é
 * um pedaço contínuo da régua, que por acaso passa por cima da virada do dia.
 *
 * O FIM DO PERÍODO É INCLUSIVO
 *
 * "06:00 → 11:59" cobre até 11:59:59. Por isso o período seguinte pode
 * começar às 12:00 sem conflito — é como o turno da manhã terminar 11:59 e o
 * da tarde começar 12:00: encostam, não se sobrepõem.
 *
 * NADA AQUI SABE QUE HORAS SÃO
 *
 * Este arquivo só faz contas. Quem diz a hora é quem chama — no cardápio, um
 * relógio ancorado no servidor; nos testes, uma hora fixa. Assim dá para
 * testar a virada da meia-noite sem esperar a meia-noite chegar.
 */

export const MINUTOS_POR_DIA = 1440;
export const MINUTOS_POR_SEMANA = MINUTOS_POR_DIA * 7;

/** 0 = domingo … 6 = sábado. Mesma numeração de `Date.getDay()`. */
export type DiaDaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const TODOS_OS_DIAS: readonly DiaDaSemana[] = [0, 1, 2, 3, 4, 5, 6];

export const NOME_DO_DIA: Record<DiaDaSemana, string> = {
  0: "Domingo",
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
};

export const NOME_CURTO_DO_DIA: Record<DiaDaSemana, string> = {
  0: "Dom",
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
};

export type TipoDeMidia = "imagem" | "video";

/** Um período programado: uma mídia, uma faixa de horário e os dias em que vale. */
export type PeriodoDoHero = {
  id: string;
  /** Só para o lojista se organizar. A lógica nunca olha para este texto. */
  nome: string;
  /** "HH:MM" */
  inicio: string;
  /** "HH:MM", inclusivo. */
  fim: string;
  /** Dias em que o período COMEÇA. */
  dias: DiaDaSemana[];
  tipo: TipoDeMidia;
  url: string;
  ativo: boolean;
};

export type ModoDoHero = "fixo" | "programado";

export type ProgramacaoDoHero = {
  modo: ModoDoHero;
  /** Interruptor geral: desliga a automação sem apagar os períodos. */
  automacaoLigada: boolean;
  /** Fuso da LOJA, nunca o do celular do cliente. */
  fuso: string;
  periodos: PeriodoDoHero[];
};

/** Onde a programação mora dentro das configurações da loja. */
export const CHAVE_NO_SITE_SETTINGS = "hero_schedule";

/** O fuso usado quando a loja nunca escolheu um. */
export const FUSO_PADRAO = "America/Sao_Paulo";

/**
 * Fusos do Brasil, para o lojista escolher numa lista em vez de digitar.
 * A lista é curta de propósito: nome de fuso digitado errado vira capa errada.
 */
export const FUSOS = [
  { id: "America/Sao_Paulo", nome: "Brasília (SP, RJ, MG, BA, PR, SC, RS, GO, DF, ES)" },
  { id: "America/Manaus", nome: "Amazonas (Manaus)" },
  { id: "America/Cuiaba", nome: "Mato Grosso (Cuiabá)" },
  { id: "America/Campo_Grande", nome: "Mato Grosso do Sul (Campo Grande)" },
  { id: "America/Belem", nome: "Pará (Belém)" },
  { id: "America/Fortaleza", nome: "Nordeste (CE, PB, RN, PE, AL, SE, PI, MA)" },
  { id: "America/Recife", nome: "Pernambuco (Recife)" },
  { id: "America/Porto_Velho", nome: "Rondônia (Porto Velho)" },
  { id: "America/Boa_Vista", nome: "Roraima (Boa Vista)" },
  { id: "America/Rio_Branco", nome: "Acre (Rio Branco)" },
  { id: "America/Noronha", nome: "Fernando de Noronha" },
] as const;

export const PROGRAMACAO_PADRAO: ProgramacaoDoHero = {
  // "fixo" é o padrão de propósito: loja que nunca configurou nada continua
  // exatamente como está hoje, com a capa única que ela já escolheu.
  modo: "fixo",
  automacaoLigada: false,
  fuso: FUSO_PADRAO,
  periodos: [],
};

// ---------------------------------------------------------------------------
// Horário
// ---------------------------------------------------------------------------

/** "07:30" → 450. Devolve `null` se não for um horário válido. */
export function minutosDoHorario(hhmm: unknown): number | null {
  if (typeof hhmm !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** 450 → "07:30". */
export function horarioDosMinutos(minutos: number): string {
  const m = ((Math.round(minutos) % MINUTOS_POR_DIA) + MINUTOS_POR_DIA) % MINUTOS_POR_DIA;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Que horas são NA LOJA.
 *
 * Recebe um instante absoluto (o mesmo em qualquer lugar do mundo) e devolve
 * que dia e que hora são no fuso da loja. O celular do cliente pode estar
 * configurado com o fuso de Tóquio: o instante é o mesmo, e a conversão
 * continua caindo no horário da loja.
 *
 * Fuso inválido não derruba nada — cai no fuso padrão. Uma capa errada é
 * chato; o cardápio não abrir é grave.
 */
export function relogioNaLoja(
  fuso: string,
  instante: Date,
): { dia: DiaDaSemana; minutos: number; segundos: number } {
  const tentar = (tz: string) => {
    const partes = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(instante);

    const p = Object.fromEntries(partes.map((x) => [x.type, x.value])) as Record<string, string>;
    const mapaDias: Record<string, DiaDaSemana> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const dia = mapaDias[p.weekday];
    // Meia-noite sai como "24" em alguns navegadores.
    const hora = Number(p.hour) % 24;
    const minuto = Number(p.minute);
    const segundo = Number(p.second);
    if (dia === undefined || !Number.isFinite(hora) || !Number.isFinite(minuto)) return null;
    return { dia, minutos: hora * 60 + minuto, segundos: segundo };
  };

  try {
    const r = tentar(fuso);
    if (r) return r;
  } catch {
    // Fuso desconhecido: cai no padrão logo abaixo.
  }
  try {
    const r = tentar(FUSO_PADRAO);
    if (r) return r;
  } catch {
    // Ambiente sem suporte a fuso: usa o relógio local como último recurso.
  }
  const d = instante.getDay() as DiaDaSemana;
  return {
    dia: d,
    minutos: instante.getHours() * 60 + instante.getMinutes(),
    segundos: instante.getSeconds(),
  };
}

/** O ponto da régua da semana onde este instante cai. */
export function minutoDaSemana(dia: DiaDaSemana, minutos: number): number {
  return dia * MINUTOS_POR_DIA + minutos;
}

// ---------------------------------------------------------------------------
// Períodos
// ---------------------------------------------------------------------------

/**
 * Os pedaços da régua da semana que um período ocupa.
 *
 * Um período de segunda 22:00 às 03:00 vira um pedaço que começa na segunda e
 * termina na terça. Se ele passar do fim da semana (sábado 23:00 → domingo
 * 02:00), o pedaço é partido em dois: o fim de sábado e o começo de domingo.
 * Sem essa quebra, a comparação com um período de domingo de manhã não
 * enxergaria a sobreposição.
 */
export function intervalosDaSemana(p: PeriodoDoHero): Array<[number, number]> {
  const ini = minutosDoHorario(p.inicio);
  const fim = minutosDoHorario(p.fim);
  if (ini === null || fim === null) return [];

  // O fim é inclusivo: "11:59" cobre o minuto inteiro, então a fronteira
  // aberta fica em 12:00.
  const duracao = fim >= ini ? fim - ini + 1 : MINUTOS_POR_DIA - ini + fim + 1;
  if (duracao <= 0 || duracao > MINUTOS_POR_SEMANA) return [];

  const saida: Array<[number, number]> = [];
  for (const dia of p.dias) {
    const comeco = minutoDaSemana(dia, ini);
    const termino = comeco + duracao;
    if (termino <= MINUTOS_POR_SEMANA) {
      saida.push([comeco, termino]);
    } else {
      saida.push([comeco, MINUTOS_POR_SEMANA]);
      saida.push([0, termino - MINUTOS_POR_SEMANA]);
    }
  }
  return saida;
}

/** Este período está valendo neste ponto da semana? */
export function periodoCobre(p: PeriodoDoHero, minutoSemana: number): boolean {
  return intervalosDaSemana(p).some(([a, b]) => minutoSemana >= a && minutoSemana < b);
}

/**
 * O período ocupa um pedaço da agenda?
 *
 * Repare que a mídia NÃO entra nesta conta. É de propósito: o lojista escolhe
 * o horário primeiro e envia o vídeo depois. Se o aviso de choque de horário
 * só aparecesse depois do envio, ele descobriria o problema com o arquivo já
 * enviado — como só descobrir que a mesa está reservada depois de sentar.
 */
export function periodoAgendavel(p: PeriodoDoHero): boolean {
  return (
    p.ativo === true &&
    minutosDoHorario(p.inicio) !== null &&
    minutosDoHorario(p.fim) !== null &&
    Array.isArray(p.dias) &&
    p.dias.length > 0
  );
}

/** Além de ocupar a agenda, tem mídia para mostrar? Só assim vai para o ar. */
export function periodoUtilizavel(p: PeriodoDoHero): boolean {
  return periodoAgendavel(p) && typeof p.url === "string" && p.url.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Conflitos
// ---------------------------------------------------------------------------

export type Conflito = { a: string; b: string };

/**
 * Pares de períodos que se sobrepõem.
 *
 * Dois períodos no mesmo horário mas em dias diferentes NÃO conflitam — é o
 * mesmo horário de almoço podendo ter uma promoção na segunda e outra no
 * sábado. Só há conflito quando os dois disputam o mesmo instante.
 *
 * Períodos desligados ficam de fora: guardar uma programação parada para usar
 * depois é justamente para isso que serve o "inativo".
 */
export function conflitos(periodos: PeriodoDoHero[], ignorarId?: string): Conflito[] {
  const usaveis = periodos.filter((p) => periodoAgendavel(p) && p.id !== ignorarId);
  const faixas = usaveis.map((p) => ({ id: p.id, intervalos: intervalosDaSemana(p) }));

  const achados: Conflito[] = [];
  for (let i = 0; i < faixas.length; i++) {
    for (let j = i + 1; j < faixas.length; j++) {
      const bate = faixas[i].intervalos.some(([a1, b1]) =>
        faixas[j].intervalos.some(([a2, b2]) => a1 < b2 && a2 < b1),
      );
      if (bate) achados.push({ a: faixas[i].id, b: faixas[j].id });
    }
  }
  return achados;
}

/** Com quais períodos já salvos este candidato colide? */
export function conflitosDoCandidato(
  candidato: PeriodoDoHero,
  existentes: PeriodoDoHero[],
): PeriodoDoHero[] {
  if (!periodoAgendavel(candidato)) return [];
  const meus = intervalosDaSemana(candidato);
  return existentes.filter((outro) => {
    if (outro.id === candidato.id || !periodoAgendavel(outro)) return false;
    const dele = intervalosDaSemana(outro);
    return meus.some(([a1, b1]) => dele.some(([a2, b2]) => a1 < b2 && a2 < b1));
  });
}

// ---------------------------------------------------------------------------
// Qual capa vale agora
// ---------------------------------------------------------------------------

export type CapaResolvida = {
  tipo: TipoDeMidia;
  url: string;
  /** O período que ganhou, ou `null` quando caiu na capa fixa. */
  periodo: PeriodoDoHero | null;
  /** Por que esta capa foi escolhida — aparece no painel e ajuda a depurar. */
  motivo:
    | "programado"
    | "modo_fixo"
    | "automacao_desligada"
    | "sem_periodo_no_horario"
    | "sem_midia_programada";
};

export type CapaFixa = { tipo: TipoDeMidia; url: string | null };

/**
 * A capa que deve estar no ar neste instante.
 *
 * A ordem das perguntas é a corrente de segurança: em qualquer tropeço, a
 * resposta é a capa fixa que a loja já tinha. Nunca devolve capa vazia por
 * causa de programação — só se a própria loja não tiver capa nenhuma.
 */
export function capaDoMomento(
  prog: ProgramacaoDoHero,
  fixa: CapaFixa,
  instante: Date,
): CapaResolvida {
  const cair = (motivo: CapaResolvida["motivo"]): CapaResolvida => ({
    tipo: fixa.tipo,
    url: fixa.url ?? "",
    periodo: null,
    motivo,
  });

  if (prog.modo !== "programado") return cair("modo_fixo");
  if (!prog.automacaoLigada) return cair("automacao_desligada");

  const usaveis = prog.periodos.filter(periodoUtilizavel);
  if (usaveis.length === 0) return cair("sem_midia_programada");

  const { dia, minutos } = relogioNaLoja(prog.fuso, instante);
  const agora = minutoDaSemana(dia, minutos);

  const vencedor = usaveis.find((p) => periodoCobre(p, agora));
  if (!vencedor) return cair("sem_periodo_no_horario");

  return { tipo: vencedor.tipo, url: vencedor.url, periodo: vencedor, motivo: "programado" };
}

/**
 * Quando a capa muda de novo.
 *
 * Devolve o instante exato da próxima virada, para o cardápio marcar UM
 * despertador em vez de ficar perguntando "já mudou?" de minuto em minuto. É
 * a diferença entre o garçom olhar o relógio uma vez e anotar a hora do
 * fechamento, ou perguntar ao gerente a cada dois minutos se já pode fechar.
 *
 * `null` quando não há nada programado — aí não existe próxima troca.
 */
export function proximaTroca(prog: ProgramacaoDoHero, instante: Date): Date | null {
  if (prog.modo !== "programado" || !prog.automacaoLigada) return null;

  const usaveis = prog.periodos.filter(periodoUtilizavel);
  if (usaveis.length === 0) return null;

  const fronteiras = new Set<number>();
  for (const p of usaveis) {
    for (const [a, b] of intervalosDaSemana(p)) {
      fronteiras.add(a % MINUTOS_POR_SEMANA);
      fronteiras.add(b % MINUTOS_POR_SEMANA);
    }
  }
  if (fronteiras.size === 0) return null;

  const { dia, minutos, segundos } = relogioNaLoja(prog.fuso, instante);
  const agora = minutoDaSemana(dia, minutos);

  let menor = Infinity;
  for (const f of fronteiras) {
    // Distância para a frente na régua circular da semana. Zero vira uma
    // semana inteira: a fronteira de agora já passou.
    const delta = (f - agora + MINUTOS_POR_SEMANA) % MINUTOS_POR_SEMANA || MINUTOS_POR_SEMANA;
    if (delta < menor) menor = delta;
  }
  if (!Number.isFinite(menor)) return null;

  // Desconta os segundos já corridos do minuto atual, para o despertador tocar
  // na virada exata e não alguns segundos depois.
  const ms = menor * 60_000 - segundos * 1000 - instante.getMilliseconds();
  return new Date(instante.getTime() + Math.max(ms, 1000));
}

// ---------------------------------------------------------------------------
// Leitura e gravação
// ---------------------------------------------------------------------------

function limparTexto(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function diasValidos(v: unknown): DiaDaSemana[] {
  if (!Array.isArray(v)) return [];
  const set = new Set<DiaDaSemana>();
  for (const d of v) {
    const n = Number(d);
    if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n as DiaDaSemana);
  }
  return [...set].sort((a, b) => a - b);
}

function periodoValido(v: unknown): PeriodoDoHero | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : null;
  const inicio = minutosDoHorario(o.inicio);
  const fim = minutosDoHorario(o.fim);
  if (!id || inicio === null || fim === null) return null;
  const tipo: TipoDeMidia = o.tipo === "video" ? "video" : "imagem";
  return {
    id,
    nome: limparTexto(o.nome, 40) || "Período",
    inicio: horarioDosMinutos(inicio),
    fim: horarioDosMinutos(fim),
    dias: diasValidos(o.dias),
    tipo,
    url: typeof o.url === "string" ? o.url.trim() : "",
    ativo: o.ativo !== false,
  };
}

/**
 * Lê a programação salva.
 *
 * Aceita qualquer coisa — inclusive nada, formato antigo ou lixo — porque
 * roda em cima de dados que já estão no banco. O que não der para entender
 * vira o padrão, e o padrão é "capa fixa": a loja continua como está.
 */
export function lerProgramacao(siteSettings: unknown): ProgramacaoDoHero {
  const raiz =
    siteSettings && typeof siteSettings === "object"
      ? (siteSettings as Record<string, unknown>)[CHAVE_NO_SITE_SETTINGS]
      : null;

  if (!raiz || typeof raiz !== "object" || Array.isArray(raiz)) return { ...PROGRAMACAO_PADRAO };

  const o = raiz as Record<string, unknown>;
  const periodos = Array.isArray(o.periodos)
    ? o.periodos.map(periodoValido).filter((p): p is PeriodoDoHero => p !== null)
    : [];

  return {
    modo: o.modo === "programado" ? "programado" : "fixo",
    automacaoLigada: o.automacaoLigada === true,
    fuso: typeof o.fuso === "string" && o.fuso.trim() ? o.fuso.trim() : FUSO_PADRAO,
    periodos: ordenarPeriodos(periodos),
  };
}

/** Pronta para gravar, já limpa e em ordem cronológica. */
export function paraGravar(prog: ProgramacaoDoHero): Record<string, unknown> {
  return {
    modo: prog.modo === "programado" ? "programado" : "fixo",
    automacaoLigada: prog.automacaoLigada === true,
    fuso: prog.fuso || FUSO_PADRAO,
    periodos: ordenarPeriodos(
      prog.periodos.map(periodoValido).filter((p): p is PeriodoDoHero => p !== null),
    ),
  };
}

/**
 * Ordem cronológica, para o lojista não precisar arrastar nada.
 * Empate de horário desempata pelo primeiro dia da semana.
 */
export function ordenarPeriodos(periodos: PeriodoDoHero[]): PeriodoDoHero[] {
  return [...periodos].sort((a, b) => {
    const ma = minutosDoHorario(a.inicio) ?? 0;
    const mb = minutosDoHorario(b.inicio) ?? 0;
    if (ma !== mb) return ma - mb;
    return (a.dias[0] ?? 0) - (b.dias[0] ?? 0);
  });
}

/** "Todos os dias", "Seg a Sex" ou a lista dos dias escolhidos. */
export function resumoDosDias(dias: DiaDaSemana[]): string {
  if (dias.length === 0) return "Nenhum dia";
  if (dias.length === 7) return "Todos os dias";
  const ordenados = [...dias].sort((a, b) => a - b);
  const seguidos = ordenados.every((d, i) => i === 0 || d === ordenados[i - 1] + 1);
  if (seguidos && ordenados.length > 2) {
    return `${NOME_CURTO_DO_DIA[ordenados[0]]} a ${NOME_CURTO_DO_DIA[ordenados[ordenados.length - 1]]}`;
  }
  return ordenados.map((d) => NOME_CURTO_DO_DIA[d]).join(", ");
}

/** Um identificador simples, só para separar um período do outro na lista. */
export function novoId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
