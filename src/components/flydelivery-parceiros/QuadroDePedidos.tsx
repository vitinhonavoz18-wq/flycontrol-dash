import { BellRing, Bike, Clock, ShoppingBag } from "lucide-react";
import { formatCents } from "@/lib/billing/money";
import simbolo from "@/assets/flydelivery-parceiros/fly-delivery-simbolo.webp";
import {
  INDICADORES_DE_EXEMPLO,
  QUADRO_DE_EXEMPLO,
  type ColunaDeExemplo,
  type PedidoDeExemplo,
} from "./dados";

/**
 * A ilustração do quadro de pedidos, desenhada com o próprio código da
 * página — não é uma foto.
 *
 * Por quê: uma imagem do painel ficaria borrada em tela grande, pesaria
 * centenas de KB e mostraria a marca antiga. Desenhada assim ela fica nítida
 * em qualquer tela, pesa quase nada e acompanha a identidade nova.
 *
 * O pedido do topo da coluna "Novos" entra animado a cada poucos segundos,
 * com o aviso "Novo pedido" — é o momento que o restaurante mais conhece.
 * Os pedidos são de mentira (ver dados.ts).
 *
 * Para o leitor de tela, o quadro inteiro é UMA imagem com descrição: ler
 * seis pedidos inventados em voz alta não ajudaria ninguém.
 */

const COR_DA_COLUNA: Record<ColunaDeExemplo["cor"], string> = {
  laranja: "var(--fdp-laranja)",
  ambar: "#f59e0b",
  verde: "#16a34a",
};

export function QuadroDePedidos() {
  return (
    <div
      role="img"
      aria-label="Ilustração do painel FlyDelivery Parceiros: pedidos separados nas colunas Novos, Em preparo e Em entrega, com o aviso de um pedido novo chegando."
      className="relative"
    >
      <div className="fdp-janela overflow-hidden">
        {/* Barra superior do painel */}
        <div
          className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5"
          style={{ borderColor: "var(--fdp-borda)" }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <img src={simbolo} alt="" width={40} height={16} className="h-4 w-auto" />
            <span className="truncate text-[13px] font-bold tracking-[-0.01em]">
              FlyDelivery Parceiros
            </span>
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: "#ecfdf3", color: "#15803d" }}
          >
            <span
              className="fdp-ao-vivo-verde h-1.5 w-1.5 rounded-full"
              style={{ background: "#16a34a" }}
            />
            Loja aberta
          </span>
        </div>

        <div className="p-3 sm:p-5" style={{ background: "var(--fdp-superficie)" }}>
          {/* Indicadores do dia */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Indicador rotulo="Pedidos hoje" valor={String(INDICADORES_DE_EXEMPLO.pedidosHoje)} />
            <Indicador rotulo="Em andamento" valor={String(INDICADORES_DE_EXEMPLO.emAndamento)} />
            <Indicador
              rotulo="Faturamento"
              valor={formatCents(INDICADORES_DE_EXEMPLO.faturamentoHojeCentavos)}
              laranja
            />
          </div>

          {/* As colunas. No celular cabem duas; a terceira aparece a partir
              do tablet — melhor duas legíveis do que três espremidas. */}
          <div className="fdp-quadro-colunas mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-3 sm:gap-3">
            {QUADRO_DE_EXEMPLO.map((coluna, i) => (
              <Coluna
                key={coluna.titulo}
                coluna={coluna}
                className={i === 2 ? "fdp-quadro-coluna-extra hidden sm:block" : ""}
              />
            ))}
          </div>
        </div>
      </div>

      {/* O aviso que "chega" junto com o pedido novo. */}
      <div
        aria-hidden="true"
        className="fdp-aviso absolute -top-4 right-3 flex items-center gap-3 rounded-2xl border bg-white px-3.5 py-2.5 sm:-right-5 sm:-top-5"
        style={{ borderColor: "var(--fdp-borda)", boxShadow: "var(--fdp-sombra-md)" }}
      >
        <span
          className="grid h-9 w-9 place-items-center rounded-xl"
          style={{ background: "var(--fdp-laranja)", color: "var(--fdp-sobre-laranja)" }}
        >
          <BellRing className="h-[18px] w-[18px]" />
        </span>
        <span className="leading-tight">
          <span className="block text-[13px] font-bold">Novo pedido</span>
          <span className="block text-[12px]" style={{ color: "var(--fdp-texto-3)" }}>
            #{QUADRO_DE_EXEMPLO[0].pedidos[0].numero} ·{" "}
            {formatCents(QUADRO_DE_EXEMPLO[0].pedidos[0].totalCentavos)}
          </span>
        </span>
      </div>
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  laranja = false,
}: {
  rotulo: string;
  valor: string;
  laranja?: boolean;
}) {
  return (
    <div
      className="rounded-xl border bg-white px-2.5 py-2 sm:px-3.5 sm:py-3"
      style={{ borderColor: "var(--fdp-borda)" }}
    >
      <p
        className="truncate text-[10px] font-medium sm:text-[11px]"
        style={{ color: "var(--fdp-texto-3)" }}
      >
        {rotulo}
      </p>
      <p
        className="mt-0.5 truncate text-[13px] font-extrabold tabular-nums tracking-[-0.02em] sm:text-[17px]"
        style={{ color: laranja ? "var(--fdp-laranja-texto)" : "var(--fdp-texto)" }}
      >
        {valor}
      </p>
    </div>
  );
}

function Coluna({ coluna, className = "" }: { coluna: ColunaDeExemplo; className?: string }) {
  const cor = COR_DA_COLUNA[coluna.cor];
  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between px-0.5">
        <span className="flex items-center gap-1.5 text-[12px] font-bold">
          <span className="h-2 w-2 rounded-full" style={{ background: cor }} />
          {coluna.titulo}
        </span>
        <span
          className="rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
          style={{ background: "#fff", color: "var(--fdp-texto-3)" }}
        >
          {coluna.pedidos.length}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {coluna.pedidos.map((pedido, i) => (
          <CartaoDoPedido
            key={pedido.numero}
            pedido={pedido}
            cor={cor}
            chegando={coluna.cor === "laranja" && i === 0}
          />
        ))}
      </ul>
    </div>
  );
}

function CartaoDoPedido({
  pedido,
  cor,
  chegando,
}: {
  pedido: PedidoDeExemplo;
  cor: string;
  chegando: boolean;
}) {
  const IconeTipo = pedido.tipo === "Delivery" ? Bike : ShoppingBag;
  return (
    <li
      className={`rounded-xl border bg-white p-2.5 sm:p-3 ${chegando ? "fdp-pedido-novo" : ""}`}
      style={{
        borderColor: chegando ? "var(--fdp-laranja-borda)" : "var(--fdp-borda)",
        boxShadow: chegando ? "0 10px 24px -14px rgb(255 90 0 / 0.55)" : "var(--fdp-sombra-sm)",
        borderLeft: `3px solid ${cor}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold tabular-nums">#{pedido.numero}</span>
        <span
          className="flex items-center gap-1 text-[10.5px]"
          style={{ color: "var(--fdp-texto-3)" }}
        >
          <Clock className="h-3 w-3" />
          {pedido.tempo}
        </span>
      </div>
      <p
        className="mt-1 truncate text-[11.5px] font-medium"
        style={{ color: "var(--fdp-texto-2)" }}
      >
        {pedido.itens}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className="flex min-w-0 items-center gap-1 text-[10.5px]"
          style={{ color: "var(--fdp-texto-3)" }}
        >
          <IconeTipo className="h-3 w-3 shrink-0" />
          <span className="truncate">{pedido.tipo}</span>
        </span>
        <span className="text-[11.5px] font-bold tabular-nums">
          {formatCents(pedido.totalCentavos)}
        </span>
      </div>
    </li>
  );
}
