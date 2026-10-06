import {
  Bike,
  CakeSlice,
  House,
  IceCreamCone,
  MapPin,
  Pizza,
  ReceiptText,
  Sandwich,
  Search,
  ShoppingBag,
  Soup,
  User,
  type LucideIcon,
} from "lucide-react";
import simbolo from "@/assets/flydelivery-parceiros/fly-delivery-simbolo.webp";

/**
 * A ilustração do aplicativo FlyDelivery aberto no celular.
 *
 * Desenhada com código (nítida e leve, como o quadro de pedidos). A primeira
 * loja da lista é "Sua loja" — a ideia da seção numa imagem só: o seu
 * restaurante aparecendo para quem está com fome perto de você.
 *
 * As outras lojas têm nome de categoria ("Pizzaria do bairro"), e não nome de
 * estabelecimento real, para ninguém achar que é cliente de verdade.
 */

const CATEGORIAS: { nome: string; icone: LucideIcon }[] = [
  { nome: "Lanches", icone: Sandwich },
  { nome: "Pizza", icone: Pizza },
  { nome: "Açaí", icone: IceCreamCone },
  { nome: "Marmita", icone: Soup },
  { nome: "Doces", icone: CakeSlice },
];

const LOJAS: { nome: string; detalhe: string; icone: LucideIcon; fundo: string; sua?: boolean }[] =
  [
    {
      nome: "Sua loja",
      detalhe: "Lanches · 25–35 min",
      icone: Sandwich,
      fundo: "linear-gradient(135deg, #ff8a3d, #ff5a00)",
      sua: true,
    },
    {
      nome: "Pizzaria do bairro",
      detalhe: "Pizza · 35–45 min",
      icone: Pizza,
      fundo: "linear-gradient(135deg, #fde68a, #f59e0b)",
    },
    {
      nome: "Açaí da esquina",
      detalhe: "Açaí · 15–25 min",
      icone: IceCreamCone,
      fundo: "linear-gradient(135deg, #c4b5fd, #7c3aed)",
    },
  ];

export function CelularMarketplace() {
  return (
    <div
      role="img"
      aria-label="Ilustração do aplicativo FlyDelivery no celular: busca, categorias e a lista de lojas, com a sua loja em destaque no topo."
      className="fdp-celular mx-auto w-[272px] sm:w-[292px]"
    >
      <div className="fdp-celular-tela aspect-[9/18.5]">
        {/* Entalhe da câmera */}
        <div className="absolute left-1/2 top-2 z-10 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-[#0b1530]" />

        <div className="flex h-full flex-col">
          {/* Topo laranja do app */}
          <div
            className="px-4 pb-4 pt-10"
            style={{ background: "linear-gradient(160deg, #ff7a1f 0%, #ff5a00 100%)" }}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="grid h-6 w-10 place-items-center rounded-md bg-white/95 px-1">
                  <img src={simbolo} alt="" width={30} height={12} className="h-3 w-auto" />
                </span>
                <span className="text-[13px] font-extrabold tracking-[-0.02em] text-[#0b1530]">
                  FlyDelivery
                </span>
              </span>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-[#0b1530]/80">
                <MapPin className="h-3 w-3" />
                Perto de você
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-[11px] text-[#646d84] shadow-sm">
              <Search className="h-3.5 w-3.5" />
              Buscar lojas e pratos
            </div>
          </div>

          {/* Categorias */}
          <div className="flex justify-between px-3 pt-3">
            {CATEGORIAS.map((c, i) => (
              <span key={c.nome} className="flex w-[46px] flex-col items-center gap-1">
                <span
                  className="grid h-10 w-10 place-items-center rounded-2xl"
                  style={
                    i === 0
                      ? { background: "var(--fdp-laranja)", color: "var(--fdp-sobre-laranja)" }
                      : {
                          background: "var(--fdp-laranja-suave)",
                          color: "var(--fdp-laranja-forte)",
                        }
                  }
                >
                  <c.icone className="h-[18px] w-[18px]" />
                </span>
                <span className="text-[9.5px] font-semibold text-[#4a5470]">{c.nome}</span>
              </span>
            ))}
          </div>

          {/* Lojas */}
          <div className="flex-1 px-3 pt-3">
            <p className="px-0.5 text-[11.5px] font-bold text-[#0b1530]">Lojas perto de você</p>
            <ul className="mt-2 flex flex-col gap-2">
              {LOJAS.map((loja) => (
                <li
                  key={loja.nome}
                  className="flex items-center gap-2.5 rounded-2xl border bg-white p-2"
                  style={{
                    borderColor: loja.sua ? "var(--fdp-laranja-borda)" : "var(--fdp-borda)",
                    boxShadow: loja.sua ? "0 10px 22px -14px rgb(255 90 0 / 0.6)" : "none",
                  }}
                >
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white"
                    style={{ background: loja.fundo }}
                  >
                    <loja.icone className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12px] font-bold text-[#0b1530]">
                        {loja.nome}
                      </span>
                      {loja.sua && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide"
                          style={{
                            background: "var(--fdp-laranja-suave)",
                            color: "var(--fdp-laranja-texto)",
                          }}
                        >
                          Aberta
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[10px] text-[#646d84]">
                      {loja.detalhe}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Barra de baixo do app */}
          <div
            className="grid grid-cols-4 border-t px-2 pb-4 pt-2"
            style={{ borderColor: "var(--fdp-borda)" }}
          >
            {[
              { nome: "Início", icone: House, ativo: true },
              { nome: "Pedidos", icone: ReceiptText },
              { nome: "Entrega", icone: Bike },
              { nome: "Perfil", icone: User },
            ].map((aba) => (
              <span key={aba.nome} className="flex flex-col items-center gap-0.5">
                <aba.icone
                  className="h-4 w-4"
                  style={{ color: aba.ativo ? "var(--fdp-laranja)" : "#94a3b8" }}
                />
                <span
                  className="text-[8.5px] font-semibold"
                  style={{ color: aba.ativo ? "var(--fdp-laranja-texto)" : "#94a3b8" }}
                >
                  {aba.nome}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Etiqueta flutuante: o pedido do app indo para o painel. */}
      <div
        aria-hidden="true"
        className="absolute -right-14 bottom-[17%] hidden items-center gap-2 rounded-2xl border bg-white px-3 py-2 sm:flex"
        style={{ borderColor: "var(--fdp-borda)", boxShadow: "var(--fdp-sombra-md)" }}
      >
        <span
          className="grid h-8 w-8 place-items-center rounded-xl"
          style={{ background: "var(--fdp-laranja-suave)", color: "var(--fdp-laranja-forte)" }}
        >
          <ShoppingBag className="h-4 w-4" />
        </span>
        <span className="text-[12px] font-bold leading-tight text-[#0b1530]">
          Pedido enviado
          <span className="block text-[11px] font-medium text-[#646d84]">direto para o painel</span>
        </span>
      </div>
    </div>
  );
}
