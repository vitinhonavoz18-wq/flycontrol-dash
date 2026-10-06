import { Bike, House, Store } from "lucide-react";
import { Reveal } from "@/components/landing/primitivos";
import { ETAPAS_FLYBOY } from "./dados";
import { useMovimentoPermitido } from "./ganchos";
import { CabecalhoDeSecao, SeloEmBreve } from "./primitivos";

/**
 * Seção 07 — FlyBoy, os entregadores ligados ao pedido.
 *
 * ATENÇÃO: O FLYBOY AINDA NÃO EXISTE PARA O PÚBLICO
 *
 * O banco de dados, as regras de acesso e o envio de localização dos
 * entregadores já estão prontos (ver FLY_COURIER.md no repositório do
 * aplicativo), mas o aplicativo do motoboy ainda não foi construído. Por
 * isso a seção fala no futuro ("vai") e leva o selo "Em breve". Quando o app
 * existir, basta tirar o selo e trocar o tempo dos verbos.
 */
export function FlyBoySection() {
  return (
    <section
      id="flyboy"
      aria-labelledby="fdp-flyboy-titulo"
      className="px-5 py-20 sm:px-8 md:py-28"
    >
      <div className="mx-auto grid max-w-[1240px] items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-20">
        <div>
          <CabecalhoDeSecao
            id="fdp-flyboy-titulo"
            rotulo={
              <>
                FlyBoy <SeloEmBreve />
              </>
            }
            titulo="Do pedido à porta do cliente."
            texto="O FlyBoy vai ligar seus entregadores direto ao pedido: a corrida chega no celular do motoboy, e cada passo volta sozinho para o painel e para o cliente."
          />

          <ol className="mt-10 flex flex-col gap-5">
            {ETAPAS_FLYBOY.map((etapa, i) => (
              <Reveal as="li" key={etapa.titulo} atraso={60 * i} className="flex items-start gap-4">
                <span className="fdp-icone h-10 w-10 rounded-xl">
                  <etapa.icone className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-[16px] font-bold tracking-[-0.01em]">{etapa.titulo}</h3>
                  <p className="mt-0.5 text-[15px]" style={{ color: "var(--fdp-texto-2)" }}>
                    {etapa.texto}
                  </p>
                </div>
              </Reveal>
            ))}
          </ol>

          <p className="mt-8 text-sm" style={{ color: "var(--fdp-texto-3)" }}>
            O FlyBoy está em desenvolvimento.
          </p>
        </div>

        <Reveal atraso={120}>
          <MapaDaEntrega />
        </Reveal>
      </div>
    </section>
  );
}

/** O trajeto da loja até a casa do cliente, num mapa desenhado. */
const ROTA = "M72 292 C 150 292 160 204 232 204 S 316 176 340 128 S 380 94 398 92";

function MapaDaEntrega() {
  const animar = useMovimentoPermitido();

  return (
    <div
      role="img"
      aria-label="Ilustração de um mapa com o trajeto do entregador, da loja até a casa do cliente, e o aviso de que o pedido saiu para entrega."
      className="fdp-cartao relative overflow-hidden"
      style={{ borderRadius: "var(--fdp-raio-lg)", boxShadow: "var(--fdp-sombra-lg)" }}
    >
      <svg viewBox="0 0 480 360" className="block h-auto w-full" aria-hidden="true">
        <rect width="480" height="360" fill="#f3f5f9" />

        {/* Quarteirões */}
        {[
          [20, 20, 120, 90],
          [160, 20, 130, 70],
          [310, 20, 150, 40],
          [20, 130, 110, 110],
          [260, 210, 200, 130],
          [150, 240, 90, 100],
          [380, 120, 80, 70],
        ].map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="10" fill="#e8ecf3" />
        ))}
        <rect x="300" y="100" width="62" height="60" rx="12" fill="#dcefe1" />

        {/* Ruas */}
        <g stroke="#ffffff" strokeWidth="14" strokeLinecap="round" fill="none">
          <path d="M0 115 H480" />
          <path d="M0 255 H480" />
          <path d="M145 0 V360" />
          <path d="M370 0 V360" />
          <path d="M250 110 L250 360" />
        </g>

        {/* O trajeto */}
        <path
          id="fdp-rota"
          d={ROTA}
          fill="none"
          stroke="rgb(255 90 0 / 0.18)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d={ROTA}
          fill="none"
          stroke="#ff5a00"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray="2 9"
        />

        {/* Loja */}
        <g transform="translate(72 292)">
          <circle r="20" fill="#0b1530" />
          <Store x={-10} y={-10} width={20} height={20} color="#ffffff" strokeWidth={2} />
        </g>

        {/* Cliente */}
        <g transform="translate(426 76)">
          <circle r="24" fill="rgb(255 90 0 / 0.16)" />
          <circle r="17" fill="#ff5a00" />
          <House x={-9} y={-9} width={18} height={18} color="#0b1530" strokeWidth={2.2} />
        </g>

        {/* O entregador. Parado no meio do caminho quando não há movimento;
            andando pelo trajeto quando há. */}
        <g transform={animar ? undefined : "translate(232 204)"}>
          <circle r="16" fill="#ffffff" stroke="#ff5a00" strokeWidth="3" />
          <Bike x={-9} y={-9} width={18} height={18} color="#e64a00" strokeWidth={2.2} />
          {animar && (
            <animateMotion
              dur="6s"
              repeatCount="indefinite"
              keyPoints="0;1;1"
              keyTimes="0;0.82;1"
              calcMode="linear"
            >
              <mpath href="#fdp-rota" />
            </animateMotion>
          )}
        </g>
      </svg>

      {/* Cartão de status por cima do mapa */}
      <div
        className="absolute left-3 right-3 top-3 rounded-2xl border bg-white/95 p-3.5 sm:left-5 sm:right-auto sm:top-5 sm:w-[270px]"
        style={{ boxShadow: "var(--fdp-sombra-md)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-bold">Saiu para entrega</span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: "#ecfdf3", color: "#15803d" }}
          >
            Ao vivo
          </span>
        </div>
        <p className="mt-0.5 text-[12px]" style={{ color: "var(--fdp-texto-3)" }}>
          Painel e cliente veem o mesmo status
        </p>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full"
          style={{ background: "var(--fdp-borda)" }}
        >
          <div
            className="h-full w-[68%] rounded-full"
            style={{
              background: "linear-gradient(90deg, var(--fdp-laranja), var(--fdp-laranja-claro))",
            }}
          />
        </div>
      </div>
    </div>
  );
}
