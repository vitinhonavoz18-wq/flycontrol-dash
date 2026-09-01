/**
 * Os avisinhos que flutuam ao lado do print do painel.
 *
 * Servem para mostrar, sem escrever uma frase inteira, que o sistema é
 * VIVO: pedido entra, valor cai, cliente chega. É a vitrine da padaria com o
 * forno funcionando atrás — quem passa entende que ali tem alguém trabalhando.
 *
 * OS DADOS SÃO DE MENTIRA, E ISSO É DE PROPÓSITO
 *
 * Nenhum nome, telefone, endereço ou valor de cliente real aparece aqui.
 * "Mesa 07" e "#1842" são invenções redondas o bastante para ilustrar e
 * genéricas o bastante para não pertencerem a ninguém. Publicar dado de
 * cliente numa página aberta seria deixar a comanda dele na porta da rua.
 */

type Props = {
  titulo: string;
  detalhe: string;
  /** Onde ele fica em relação ao print. Só posicionamento. */
  className?: string;
  /** Segundos de atraso, para os avisos não subirem todos juntos. */
  atraso?: number;
};

export function FloatingNotification({ titulo, detalhe, className = "", atraso = 0 }: Props) {
  return (
    <div
      aria-hidden="true"
      className={`fly-float pointer-events-none absolute hidden select-none items-center gap-3 rounded-2xl px-4 py-3 backdrop-blur-md sm:flex ${className}`}
      style={{
        background: "rgba(10,10,10,.82)",
        border: "1px solid rgba(255,255,255,.10)",
        boxShadow: "0 20px 60px rgba(0,0,0,.6)",
        animationDuration: "26s",
        animationDelay: `${atraso}s`,
      }}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: "var(--fly-primary)", boxShadow: "0 0 12px var(--fly-primary)" }}
      />
      <span className="whitespace-nowrap">
        <span className="block text-[13px]" style={{ color: "var(--fly-text-primary)" }}>
          {titulo}
        </span>
        <span className="block text-[12px]" style={{ color: "var(--fly-text-muted)" }}>
          {detalhe}
        </span>
      </span>
    </div>
  );
}
