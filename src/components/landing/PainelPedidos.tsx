import { useEffect, useState } from "react";

/**
 * Demonstração do painel de pedidos.
 *
 * É o mesmo Kanban que o restaurante usa de verdade: as três colunas, os
 * nomes e as cores vêm de `components/orders/orderStatusConfig.ts` — novo
 * (azul), em preparo (âmbar), saiu para entrega (verde). O cartão mostra o
 * mesmo que o cartão real mostra: número, tipo, tempo, cliente, total,
 * pagamento e para onde vai.
 *
 * Manter fiel importa: uma tela bonita que não existe no produto vira
 * decepção no primeiro dia de uso. Aqui o visitante vê o que vai receber.
 *
 * Ao abrir, um pedido entra na primeira coluna, é aceito e anda para "em
 * preparo" — e logo outro chega, porque é isso que acontece numa noite boa.
 * O painel nunca descansa com a primeira coluna vazia: ficar sem pedido novo
 * seria mostrar justamente a noite que ninguém quer ter. Quem pediu menos
 * animação no aparelho vê direto esse estado final.
 */

type Pedido = {
  numero: string;
  cliente: string;
  total: string;
  itens: string;
  pagamento: string;
  local: string;
  minutos: number;
};

/** O pedido que a gente acompanha: chega, é aceito, vai para a cozinha. */
const CHEGANDO: Pedido = {
  numero: "1042",
  cliente: "Ana Paula",
  total: "R$ 87,00",
  itens: "3 itens",
  pagamento: "PIX",
  local: "Centro",
  minutos: 0,
};

/** O próximo da fila — entra depois e fica, para a coluna não zerar. */
const SEGUINTE: Pedido = {
  numero: "1043",
  cliente: "Rafael Souza",
  total: "R$ 63,00",
  itens: "2 itens",
  pagamento: "PIX",
  local: "Jd. Europa",
  minutos: 0,
};

const EM_PREPARO: Pedido[] = [
  {
    numero: "1039",
    cliente: "Carlos Eduardo",
    total: "R$ 54,00",
    itens: "2 itens",
    pagamento: "Dinheiro",
    local: "Jd. América",
    minutos: 6,
  },
];

const SAIU: Pedido[] = [
  {
    numero: "1036",
    cliente: "Marina Alves",
    total: "R$ 112,50",
    itens: "5 itens",
    pagamento: "Cartão",
    local: "Vila Nova",
    minutos: 18,
  },
];

/** Cores reais das colunas do Kanban. */
const COLUNAS = [
  { id: "novo", titulo: "Novo pedido", cor: "#3B82F6" },
  { id: "preparando", titulo: "Em preparo", cor: "#F59E0B" },
  { id: "saiu", titulo: "Saiu para entrega", cor: "#10B981" },
] as const;

type Fase = "vazio" | "chegou" | "aceito" | "final";

export function PainelPedidos() {
  // Começa no fim: sem JavaScript, ou com menos animação pedida, o painel já
  // aparece cheio em vez de vazio.
  const [fase, setFase] = useState<Fase>("final");

  useEffect(() => {
    const querMenos = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (querMenos) return;

    setFase("vazio");
    const marcas: Array<[Fase, number]> = [
      ["chegou", 700],
      ["aceito", 3200],
      ["final", 4600],
    ];
    const relogios = marcas.map(([f, ms]) => window.setTimeout(() => setFase(f), ms));
    return () => relogios.forEach((r) => window.clearTimeout(r));
  }, []);

  const aceitoOuDepois = fase === "aceito" || fase === "final";

  return (
    <div className="relative w-full max-w-[460px]">
      {/* Luz do painel na cozinha escura. Só cresce para cima e para baixo:
          se crescesse para os lados, empurraria a página para o lado no
          celular e apareceria aquela barra de rolagem horizontal. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 -inset-y-10 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(255,90,0,0.30), transparent 70%)" }}
      />

      <div
        className="relative overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "#141210", borderColor: "rgba(255,255,255,0.10)" }}
        role="img"
        aria-label="Demonstração do painel de pedidos do FlyControl, com as colunas novo pedido, em preparo e saiu para entrega"
      >
        {/* Barra da janela — situa que isto é uma tela do sistema. */}
        <div
          className="flex items-center gap-2 border-b px-4 py-2.5"
          style={{ borderColor: "rgba(255,255,255,0.08)", background: "#0E0C0B" }}
        >
          <span className="flex gap-1.5" aria-hidden="true">
            <i className="block h-2.5 w-2.5 rounded-full bg-white/15" />
            <i className="block h-2.5 w-2.5 rounded-full bg-white/15" />
            <i className="block h-2.5 w-2.5 rounded-full bg-white/15" />
          </span>
          <span className="ml-1 text-[11px] font-semibold tracking-wide text-white/45">
            Pedidos
          </span>
          <span className="ml-auto font-comanda text-[11px] text-white/35">19:42</span>
        </div>

        <div className="grid grid-cols-3 gap-2 p-2.5 sm:gap-2.5 sm:p-3">
          {COLUNAS.map((col) => {
            const cartoes: Pedido[] =
              col.id === "novo"
                ? fase === "chegou"
                  ? [CHEGANDO]
                  : fase === "final"
                    ? [SEGUINTE]
                    : []
                : col.id === "preparando"
                  ? aceitoOuDepois
                    ? [CHEGANDO, ...EM_PREPARO]
                    : EM_PREPARO
                  : SAIU;

            return (
              <div key={col.id} className="min-w-0">
                {/* Altura fixa no cabeçalho: "Saiu para entrega" ocupa duas
                    linhas e, sem isso, os cartões dessa coluna começariam
                    mais embaixo que os das outras. */}
                <div className="mb-2 flex min-h-[2.4em] items-start gap-1.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 h-3 w-1 flex-shrink-0 rounded-full"
                    style={{ background: col.cor }}
                  />
                  {/* No celular o nome quebra em duas linhas em vez de virar
                      "SAIU PARA ENTRE…": a coluna precisa dizer o que é. */}
                  <span className="min-w-0 text-[9px] font-bold uppercase leading-tight tracking-wide text-white/55 sm:text-[11px] sm:tracking-wider">
                    {col.titulo}
                  </span>
                  <span
                    className="ml-auto flex-shrink-0 rounded px-1.5 text-[10px] font-bold"
                    style={{ background: `${col.cor}22`, color: col.cor }}
                  >
                    {cartoes.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {cartoes.map((p) => (
                    <Cartao key={p.numero} pedido={p} novo={col.id === "novo"} cor={col.cor} />
                  ))}
                  {cartoes.length === 0 && (
                    <div
                      className="rounded-lg border border-dashed py-6"
                      style={{ borderColor: "rgba(255,255,255,0.08)" }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Cartao({ pedido, novo, cor }: { pedido: Pedido; novo: boolean; cor: string }) {
  return (
    <article
      className="rounded-lg border p-2 transition-all duration-500 sm:p-2.5"
      style={{
        background: "#1C1815",
        borderColor: novo ? `${cor}66` : "rgba(255,255,255,0.08)",
        boxShadow: novo ? `0 0 0 1px ${cor}33, 0 8px 24px -8px ${cor}55` : "none",
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[13px] font-black leading-none text-white">#{pedido.numero}</span>
        {novo && (
          <span
            className="rounded px-1 text-[8px] font-black uppercase tracking-wide"
            style={{ background: "#FF5A00", color: "#000" }}
          >
            Novo
          </span>
        )}
      </div>

      <p className="mt-1 font-comanda text-[10px] text-white/40">
        há {pedido.minutos} min
        {/* "Delivery" só entra quando há largura: no celular a linha viraria
            duas e empurraria o cartão inteiro para baixo. */}
        <span className="hidden sm:inline"> · Delivery</span>
      </p>

      <p className="mt-1.5 truncate text-[12px] font-bold text-white/90">{pedido.cliente}</p>
      <p className="text-[10px] text-white/40">
        {/* No celular fica só o valor: "2 itens · R$ 63,00" não cabe numa
            linha de coluna estreita e o cartão ficava com o preço partido
            no meio. */}
        <span className="hidden sm:inline">{pedido.itens} · </span>
        <span className="font-bold" style={{ color: "#FF5A00" }}>
          {pedido.total}
        </span>
      </p>

      {/* Some no celular: em três colunas estreitas, viraria linha ilegível. */}
      <dl
        className="mt-2 hidden space-y-0.5 border-t pt-1.5 text-[9px] sm:block"
        style={{ borderColor: "rgba(255,255,255,0.07)" }}
      >
        <div className="flex justify-between gap-1">
          <dt className="text-white/35">Pagamento</dt>
          <dd className="truncate font-medium text-white/70">{pedido.pagamento}</dd>
        </div>
        <div className="flex justify-between gap-1">
          <dt className="text-white/35">Entrega</dt>
          <dd className="truncate font-medium text-white/70">{pedido.local}</dd>
        </div>
      </dl>
    </article>
  );
}
