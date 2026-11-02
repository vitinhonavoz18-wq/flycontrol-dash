/**
 * O formatador da comanda — o ÚNICO lugar que decide o que vai em cada linha.
 *
 * Antes existiam dois jeitos diferentes de montar comanda (a do pedido, em
 * `routes/print.$orderId.tsx`, e a da mesa, em `TablesManagement.tsx`), cada
 * um com as suas regras. Agora as duas saem daqui.
 *
 * Funciona em duas etapas, como a cozinha que primeiro confere o pedido e só
 * depois escreve a comanda:
 *
 *   1. `dadosDoPedido` lê o pedido como ele está no banco (com os nomes de
 *      campo que cada origem usa — site, garçom, WhatsApp) e organiza num
 *      formato só, com dinheiro em CENTAVOS inteiros.
 *   2. `montarComanda` escreve as linhas, cada uma do tamanho exato do papel.
 *
 * O resultado é uma lista de linhas com um "estilo" (normal, negrito,
 * título, destaque). Quem desenha no papel (`renderizar.ts` e o componente
 * da tela) só segue a lista — não decide nada.
 */

import { formatarCentavos, reaisParaCentavos } from "@/lib/pizza/motorDePreco";
import type { RegistroDaPizza } from "@/lib/pizza/motorDePreco";
import {
  extrairAdicionaisDoItem,
  formatPaymentMethod,
  formatSource,
  isPaid,
  notaDoItemSemAdicionais,
} from "@/components/orders/orderDisplay";
import { normalizeOrderType } from "@/utils/order-utils";
import type { OrderItem } from "@/types/order";
import {
  centralizar,
  esquerdaDireita,
  limparTexto,
  quebrarTexto,
  removerAcentos,
  separador,
} from "./texto";

export type EstiloDaLinha = "normal" | "negrito" | "titulo" | "destaque";
export type Linha = { texto: string; estilo: EstiloDaLinha };

export type ItemDaComanda = {
  quantidade: number;
  nome: string;
  tamanho?: string;
  sabores: string[];
  borda?: string;
  ingredientes: string[];
  adicionais: string[];
  removidos: string[];
  observacao?: string;
  unitarioCentavos: number;
  totalCentavos: number;
};

export type TipoDoPedido = "delivery" | "pickup" | "table" | "outro";

export type DadosDaComanda = {
  loja: { nome: string; telefone?: string; endereco?: string };
  pedido: {
    numero: string;
    criadoEm: Date | null;
    tipo: TipoDoPedido;
    ficha?: string;
    mesa?: string;
    origem?: string;
  };
  cliente: {
    nome?: string;
    telefone?: string;
    endereco?: string;
    bairro?: string;
    referencia?: string;
  };
  itens: ItemDaComanda[];
  valores: {
    subtotalCentavos: number;
    entregaCentavos: number;
    descontoCentavos: number;
    totalCentavos: number;
  };
  pagamento: {
    forma?: string;
    /** `true` pago, `false` a receber, `undefined` quando o pedido não diz. */
    pago?: boolean;
    trocoParaCentavos?: number;
  };
  observacoes?: string;
};

export type OpcoesDaComanda = {
  colunas: number;
  acentos: boolean;
  /** Fuso para data e hora. Sem ele, vale o do computador. */
  fusoHorario?: string;
  /** Momento da impressão (para o rodapé). */
  agora?: Date;
  linhasNoFinal?: number;
};

// ─────────────────────────────────────────────────────────────────────────
// Etapa 1 — ler o pedido do banco
// ─────────────────────────────────────────────────────────────────────────

type Bruto = Record<string, unknown>;

function texto(valor: unknown): string | undefined {
  const t = limparTexto(valor);
  return t ? t : undefined;
}

function listaDeTextos(valor: unknown): string[] {
  if (Array.isArray(valor)) {
    return valor
      .map((v) =>
        typeof v === "string"
          ? v
          : v && typeof v === "object"
            ? String((v as Bruto).name ?? (v as Bruto).nome ?? "")
            : "",
      )
      .map((v) => limparTexto(v))
      .filter(Boolean);
  }
  if (typeof valor === "string" && valor.trim()) return [limparTexto(valor)];
  return [];
}

function ehRegistroDaPizza(valor: unknown): valor is RegistroDaPizza {
  return (
    !!valor &&
    typeof valor === "object" &&
    Array.isArray((valor as Bruto).sabores) &&
    typeof (valor as Bruto).tamanho === "string"
  );
}

function quantidadeDe(item: Bruto): number {
  const q = Number(item.qty ?? item.quantity ?? 1);
  return Number.isFinite(q) && q > 0 ? q : 1;
}

/** Lê um item do pedido, aceitando os formatos de cada origem. */
export function itemDoPedido(bruto: unknown): ItemDaComanda {
  const it = (bruto && typeof bruto === "object" ? bruto : {}) as Bruto;
  const quantidade = quantidadeDe(it);
  const nome = texto(it.product_name ?? it.name ?? it.title ?? it.nome) ?? "Item";
  const unitarioCentavos = reaisParaCentavos(it.unit_price ?? it.price ?? 0);
  const totalBruto = it.total_price ?? it.total ?? it.subtotal;
  const totalCentavos =
    totalBruto !== undefined && totalBruto !== null
      ? reaisParaCentavos(totalBruto)
      : unitarioCentavos * quantidade;

  const pizza = ehRegistroDaPizza(it.pizza) ? it.pizza : null;
  const notaLivre = limparTexto(notaDoItemSemAdicionais(it as OrderItem));

  if (pizza) {
    // Pizza do configurador: tudo vem organizado na "fotografia" da pizza.
    // O texto livre do item costuma ser a descrição dessa mesma fotografia —
    // imprimir os dois repetiria tudo. A observação do cliente vem do campo
    // próprio.
    const descricao = limparTexto(pizza.descricao);
    const observacao =
      texto(pizza.observacao) ?? (notaLivre && notaLivre !== descricao ? notaLivre : undefined);
    return {
      quantidade,
      nome,
      tamanho: texto(pizza.tamanho) ?? texto(it.size),
      sabores: pizza.sabores.map((s) => {
        const sabor = limparTexto(s.nome);
        return pizza.sabores.length > 1 && s.fracao ? `${limparTexto(s.fracao)} ${sabor}` : sabor;
      }),
      borda: texto(pizza.borda?.nome) ?? texto(it.crust ?? it.borda),
      ingredientes: listaDeTextos(it.ingredients),
      adicionais: (pizza.adicionais ?? []).map((a) =>
        a.quantidade > 1 ? `${limparTexto(a.nome)} x${a.quantidade}` : limparTexto(a.nome),
      ),
      removidos: (pizza.removidos ?? []).map(limparTexto).filter(Boolean),
      observacao,
      unitarioCentavos,
      totalCentavos,
    };
  }

  const sabores = [
    ...new Set([...listaDeTextos(it.flavors), ...listaDeTextos(it.selected_flavors)]),
  ];
  return {
    quantidade,
    nome,
    tamanho: texto(it.size),
    sabores,
    borda: texto(it.crust ?? it.borda),
    ingredientes: listaDeTextos(it.ingredients),
    adicionais: extrairAdicionaisDoItem(it as OrderItem)
      .map(limparTexto)
      .filter(Boolean),
    removidos: [],
    observacao: notaLivre || undefined,
    unitarioCentavos,
    totalCentavos,
  };
}

function dataValida(valor: unknown): Date | null {
  if (!valor) return null;
  const d = new Date(String(valor));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Organiza o pedido do banco no formato da comanda. */
export function dadosDoPedido(pedido: unknown, loja: unknown): DadosDaComanda {
  const o = (pedido && typeof pedido === "object" ? pedido : {}) as Bruto;
  const l = (loja && typeof loja === "object" ? loja : {}) as Bruto;
  const tipoNormalizado = normalizeOrderType(o);
  const tipo: TipoDoPedido =
    tipoNormalizado === "delivery" || tipoNormalizado === "pickup" || tipoNormalizado === "table"
      ? tipoNormalizado
      : "outro";

  const itens = (Array.isArray(o.items) ? o.items : []).map(itemDoPedido);
  const totalCentavos = reaisParaCentavos(o.total);
  const entregaCentavos = reaisParaCentavos(o.delivery_fee);
  const descontoCentavos = Math.abs(reaisParaCentavos(o.discount));
  const subtotalCentavos =
    o.subtotal !== null && o.subtotal !== undefined && reaisParaCentavos(o.subtotal) > 0
      ? reaisParaCentavos(o.subtotal)
      : totalCentavos - entregaCentavos + descontoCentavos;

  const trocoPara = reaisParaCentavos(o.change_for);
  const statusPagamento = typeof o.payment_status === "string" ? o.payment_status : null;
  const mesa = texto(o.table_number ?? o.tableNumber ?? o.mesa ?? o.table_name);

  return {
    loja: {
      nome: texto(l.name) ?? "Loja",
      telefone: texto(l.phone),
      endereco: texto(l.address),
    },
    pedido: {
      numero: texto(o.order_number) ?? (typeof o.id === "string" ? o.id.slice(0, 8) : "-"),
      criadoEm: dataValida(o.created_at),
      tipo,
      ficha: texto(o.ticket_number),
      mesa,
      origem: texto(formatSource(typeof o.source === "string" ? o.source : null)),
    },
    cliente: {
      nome: texto(o.customer_name),
      telefone: texto(o.customer_phone),
      endereco: texto(o.customer_address),
      bairro: texto(o.neighborhood),
      referencia: texto(o.customer_reference),
    },
    itens,
    valores: { subtotalCentavos, entregaCentavos, descontoCentavos, totalCentavos },
    pagamento: {
      forma: o.payment_method ? texto(formatPaymentMethod(String(o.payment_method))) : undefined,
      pago: statusPagamento ? isPaid(statusPagamento) : undefined,
      trocoParaCentavos: trocoPara > 0 ? trocoPara : undefined,
    },
    observacoes: texto(o.notes),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Etapa 2 — escrever as linhas
// ─────────────────────────────────────────────────────────────────────────

/** Recuo dos detalhes do item (embaixo do nome, depois do "2x "). */
const RECUO = 3;

class Escritor {
  readonly linhas: Linha[] = [];
  constructor(
    readonly largura: number,
    private readonly acentos: boolean,
  ) {}

  private ajustar(t: string): string {
    return this.acentos ? t : removerAcentos(t);
  }

  /** Acrescenta linhas já cortadas na largura certa. */
  private por(linhas: string[], estilo: EstiloDaLinha) {
    for (const l of linhas) this.linhas.push({ texto: l.replace(/\s+$/, ""), estilo });
  }

  texto(t: string, estilo: EstiloDaLinha = "normal", recuo = 0) {
    this.por(quebrarTexto(this.ajustar(t), this.largura, { recuo, recuoInicial: recuo }), estilo);
  }

  /** "Rótulo: valor", com o valor quebrando alinhado depois do rótulo quando possível. */
  campo(rotulo: string, valor: string | undefined, estilo: EstiloDaLinha = "normal", recuo = 0) {
    if (!valor) return;
    const r = this.ajustar(rotulo);
    const v = this.ajustar(valor);
    const inicio = recuo + r.length + 1;
    // Rótulo curto: o texto continua alinhado depois dele. Rótulo longo num
    // papel estreito: o texto continua do começo, para não virar uma coluna
    // fininha de duas letras.
    const recuoDasSeguintes = inicio <= this.largura / 2 ? inicio : recuo;
    const linhas = quebrarTexto(`${r} ${v}`, this.largura, {
      recuoInicial: recuo,
      recuo: recuoDasSeguintes,
    });
    this.por(linhas, estilo);
  }

  centro(t: string, estilo: EstiloDaLinha = "normal") {
    this.por(centralizar(this.ajustar(t), this.largura), estilo);
  }

  valor(rotulo: string, centavos: number, estilo: EstiloDaLinha = "normal", recuo = 0) {
    this.valorTexto(rotulo, formatarCentavos(centavos), estilo, recuo);
  }

  valorTexto(rotulo: string, valor: string, estilo: EstiloDaLinha = "normal", recuo = 0) {
    const linhas = esquerdaDireita(this.ajustar(rotulo), valor, this.largura - recuo, {
      recuo: RECUO,
    });
    this.por(
      linhas.map((l) => " ".repeat(recuo) + l),
      estilo,
    );
  }

  linha(simbolo = "-") {
    this.linhas.push({ texto: separador(this.largura, simbolo), estilo: "normal" });
  }

  branco() {
    // Nunca duas linhas em branco seguidas — gasta bobina à toa.
    const ultima = this.linhas[this.linhas.length - 1];
    if (ultima && ultima.texto === "") return;
    this.linhas.push({ texto: "", estilo: "normal" });
  }

  /** Bloco com título entre separadores — "CLIENTE", "ITENS DO PEDIDO". */
  secao(titulo: string, simbolo = "-") {
    this.linha(simbolo);
    this.centro(titulo, "negrito");
    this.linha(simbolo);
  }
}

function formatarData(d: Date, fuso?: string): { data: string; hora: string } {
  const opcoesBase = fuso ? { timeZone: fuso } : {};
  const data = d.toLocaleDateString("pt-BR", {
    ...opcoesBase,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const hora = d.toLocaleTimeString("pt-BR", { ...opcoesBase, hour: "2-digit", minute: "2-digit" });
  return { data, hora };
}

const ROTULO_DO_TIPO: Record<TipoDoPedido, string> = {
  delivery: "ENTREGA",
  pickup: "RETIRADA",
  table: "MESA",
  outro: "PEDIDO",
};

function maiusculas(t: string): string {
  return t.toLocaleUpperCase("pt-BR");
}

export function montarComanda(dados: DadosDaComanda, opcoes: OpcoesDaComanda): Linha[] {
  const largura = Math.max(24, Math.min(80, Math.floor(opcoes.colunas)));
  const e = new Escritor(largura, opcoes.acentos);
  const { pedido, cliente, valores, pagamento } = dados;

  // ── Cabeçalho ──────────────────────────────────────────────────────────
  e.linha("=");
  e.centro(maiusculas(dados.loja.nome), "titulo");
  if (dados.loja.telefone) e.centro(dados.loja.telefone);
  e.linha("=");
  e.branco();
  e.texto(`PEDIDO: #${pedido.numero}`, "titulo");
  if (pedido.criadoEm) {
    const { data, hora } = formatarData(pedido.criadoEm, opcoes.fusoHorario);
    const juntos = `DATA: ${data}`;
    const horaTxt = `HORA: ${hora}`;
    if (juntos.length + 1 + horaTxt.length <= largura) {
      e.valorTexto(juntos, horaTxt);
    } else {
      e.texto(juntos);
      e.texto(horaTxt);
    }
  }
  if (pedido.origem) e.campo("ORIGEM:", pedido.origem);
  e.branco();

  if (pedido.tipo === "table") {
    e.texto(pedido.mesa ? `TIPO: MESA ${pedido.mesa}` : "TIPO: MESA NÃO IDENTIFICADA", "titulo");
  } else {
    e.texto(`TIPO: ${ROTULO_DO_TIPO[pedido.tipo]}`, "titulo");
  }
  if (pedido.tipo === "pickup" && pedido.ficha) e.texto(`FICHA: ${pedido.ficha}`, "titulo");

  // ── Cliente ────────────────────────────────────────────────────────────
  const temCliente =
    cliente.nome || cliente.telefone || cliente.endereco || cliente.bairro || cliente.referencia;
  if (temCliente) {
    e.branco();
    e.secao("CLIENTE");
    e.campo("Nome:", cliente.nome, "negrito");
    e.campo("Tel:", cliente.telefone);
    if (cliente.endereco || cliente.bairro || cliente.referencia) {
      e.branco();
      e.texto("ENDEREÇO:", "negrito");
      if (cliente.endereco) e.texto(cliente.endereco);
      e.campo("Bairro:", cliente.bairro);
      e.campo("Referência:", cliente.referencia);
    }
  }

  // ── Itens ──────────────────────────────────────────────────────────────
  e.branco();
  e.secao("ITENS DO PEDIDO", "=");
  if (dados.itens.length === 0) {
    e.branco();
    e.texto("(pedido sem itens detalhados)");
  }
  dados.itens.forEach((item, indice) => {
    if (indice > 0) {
      e.branco();
      e.linha("-");
    }
    e.branco();
    const prefixo = `${item.quantidade}x `;
    e.valorTexto(
      `${prefixo}${maiusculas(item.nome)}`,
      item.totalCentavos > 0 ? formatarCentavos(item.totalCentavos) : "",
      "negrito",
    );
    e.campo("Tamanho:", item.tamanho, "normal", RECUO);
    if (item.sabores.length === 1) {
      e.campo("Sabor:", item.sabores[0], "normal", RECUO);
    } else if (item.sabores.length > 1) {
      e.texto("Sabores:", "normal", RECUO);
      for (const s of item.sabores) e.campo("-", s, "normal", RECUO);
    }
    e.campo("Borda:", item.borda, "normal", RECUO);
    if (item.ingredientes.length > 0) {
      e.campo("Ingredientes:", item.ingredientes.join(", "), "normal", RECUO);
    }
    for (const a of item.adicionais) e.campo("+ Adicional:", a, "normal", RECUO);
    if (item.removidos.length > 0) {
      e.campo("SEM:", maiusculas(item.removidos.join(", ")), "destaque", RECUO);
    }
    if (item.observacao) {
      e.branco();
      e.texto("*** OBSERVAÇÃO ***", "destaque", RECUO);
      e.texto(item.observacao, "destaque", RECUO);
    }
    if (item.quantidade > 1 && item.unitarioCentavos > 0) {
      e.valor("(valor unitário)", item.unitarioCentavos, "normal", RECUO);
    }
  });

  // ── Resumo ─────────────────────────────────────────────────────────────
  e.branco();
  e.secao("RESUMO", "=");
  e.branco();
  e.valor("Subtotal:", valores.subtotalCentavos);
  if (valores.entregaCentavos > 0 || pedido.tipo === "delivery") {
    e.valor("Entrega:", valores.entregaCentavos);
  }
  if (valores.descontoCentavos > 0) e.valor("Desconto:", -valores.descontoCentavos);
  e.branco();
  e.valor("TOTAL:", valores.totalCentavos, "titulo");
  e.branco();

  e.campo("PAGAMENTO:", pagamento.forma ? maiusculas(pagamento.forma) : "NÃO INFORMADO", "negrito");
  if (pagamento.pago === true) e.texto("SITUAÇÃO: JÁ PAGO", "destaque");
  if (pagamento.pago === false) e.texto("SITUAÇÃO: A RECEBER", "negrito");
  if (pagamento.trocoParaCentavos) {
    e.valor("Troco para:", pagamento.trocoParaCentavos, "negrito");
    const levar = pagamento.trocoParaCentavos - valores.totalCentavos;
    if (levar > 0) e.valor("Levar de troco:", levar, "destaque");
  }

  // ── Observações gerais ─────────────────────────────────────────────────
  if (dados.observacoes) {
    e.branco();
    e.linha("*");
    e.centro("OBSERVAÇÕES DO PEDIDO", "destaque");
    e.linha("*");
    e.texto(dados.observacoes, "destaque");
    e.linha("*");
  }

  // ── Rodapé ─────────────────────────────────────────────────────────────
  e.branco();
  e.linha("=");
  e.centro(`FIM DO PEDIDO #${pedido.numero}`, "negrito");
  e.linha("=");
  const agora = opcoes.agora ?? new Date();
  const impressao = formatarData(agora, opcoes.fusoHorario);
  e.centro(`Impresso em ${impressao.data} ${impressao.hora}`);
  e.centro("FlyControl");

  return comFinal(e.linhas, opcoes.linhasNoFinal);
}

/** Linhas em branco no fim: a lâmina de corte fica abaixo da cabeça de impressão. */
function comFinal(linhas: Linha[], quantas = 0): Linha[] {
  const n = Math.max(0, Math.min(10, Math.floor(quantas)));
  return [
    ...linhas,
    ...Array.from({ length: n }, () => ({ texto: "", estilo: "normal" as const })),
  ];
}

// ─────────────────────────────────────────────────────────────────────────
// Comanda da mesa (conta de vários pedidos)
// ─────────────────────────────────────────────────────────────────────────

export type DadosDaMesa = {
  loja: string;
  mesa: string;
  sessao: string;
  abertaEm: Date | null;
  fechadaEm: Date | null;
  pedidos: {
    numero: string;
    hora: Date | null;
    cliente?: string;
    itens: ItemDaComanda[];
    totalCentavos: number;
    observacoes?: string;
  }[];
  subtotalCentavos: number;
  taxaDeServico: { percentual: number; centavos: number } | null;
  totalCentavos: number;
};

export function montarComandaDaMesa(dados: DadosDaMesa, opcoes: OpcoesDaComanda): Linha[] {
  const largura = Math.max(24, Math.min(80, Math.floor(opcoes.colunas)));
  const e = new Escritor(largura, opcoes.acentos);
  const quando = (d: Date | null) => {
    if (!d) return "";
    const { data, hora } = formatarData(d, opcoes.fusoHorario);
    return `${data} ${hora}`;
  };

  e.linha("=");
  e.centro(maiusculas(dados.loja), "titulo");
  e.centro(`MESA ${dados.mesa}`, "titulo");
  e.linha("=");
  e.campo("Sessão:", dados.sessao);
  if (dados.abertaEm) e.campo("Abertura:", quando(dados.abertaEm));
  if (dados.fechadaEm) e.campo("Fechamento:", quando(dados.fechadaEm));

  if (dados.pedidos.length === 0) {
    e.branco();
    e.texto("(nenhum pedido nesta mesa)");
  }
  for (const p of dados.pedidos) {
    e.branco();
    e.linha("-");
    const hora = p.hora ? formatarData(p.hora, opcoes.fusoHorario).hora : "";
    e.valorTexto(`PEDIDO #${p.numero}`, hora, "negrito");
    if (p.cliente) e.texto(p.cliente);
    e.linha("-");
    if (p.itens.length === 0) {
      e.valor("Itens não detalhados", p.totalCentavos);
    }
    for (const item of p.itens) {
      e.valorTexto(
        `${item.quantidade}x ${maiusculas(item.nome)}`,
        formatarCentavos(item.totalCentavos),
      );
      if (item.observacao) e.campo("Obs:", item.observacao, "destaque", RECUO);
    }
    if (p.observacoes) e.campo("Geral:", p.observacoes, "destaque");
  }

  e.branco();
  e.linha("=");
  e.valor("Subtotal:", dados.subtotalCentavos);
  if (dados.taxaDeServico) {
    e.valor(
      `Taxa de serviço (${String(dados.taxaDeServico.percentual).replace(".", ",")}%):`,
      dados.taxaDeServico.centavos,
    );
  }
  e.branco();
  e.valor("TOTAL FINAL:", dados.totalCentavos, "titulo");
  e.linha("=");
  e.centro("Obrigado pela preferência!", "negrito");

  return comFinal(e.linhas, opcoes.linhasNoFinal);
}
