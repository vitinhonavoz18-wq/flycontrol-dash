import simbolo from "@/assets/flydelivery-parceiros/fly-delivery-simbolo.webp";

/**
 * A marca FlyDelivery Parceiros: o símbolo do infinito (o mesmo do
 * aplicativo FlyDelivery) e o nome escrito em texto.
 *
 * O nome é texto de verdade, não imagem: fica nítido em qualquer tela, pesa
 * zero e o leitor de tela lê sozinho. Só o símbolo é imagem.
 */
export function Logo({ claro = false, className = "" }: { claro?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* 238×96 é o tamanho do arquivo; a altura na tela é 28px. */}
      <img src={simbolo} alt="" width={69} height={28} className="h-7 w-auto" decoding="async" />
      <span className="flex flex-col leading-none">
        <span
          className="text-[17px] font-extrabold tracking-[-0.03em]"
          style={{ color: claro ? "#fff" : "var(--fdp-texto)" }}
        >
          <span style={{ color: "var(--fdp-laranja)" }}>Fly</span>Delivery
        </span>
        <span
          className="mt-1 text-[10px] font-semibold uppercase tracking-[0.24em]"
          style={{ color: claro ? "rgb(255 255 255 / 0.7)" : "var(--fdp-texto-3)" }}
        >
          Parceiros
        </span>
      </span>
    </span>
  );
}
