/**
 * Um caminho curto, em degraus: A → B → C.
 *
 * Serve para as seções onde não existe UMA tela do sistema que caiba num
 * retângulo — o percurso de um pedido entre etapas, por exemplo, acontece em
 * três telas diferentes ao longo de uma hora.
 *
 * É um DESENHO, e não um print. A diferença importa: um diagrama explica o
 * caminho; um dashboard inventado promete uma tela que não existe.
 */

type Degrau = {
  titulo: string;
  detalhe: string;
  /** Acende no laranja da marca. Use em um degrau só, no que está "agora". */
  ativo?: boolean;
};

export function StepFlow({ degraus }: { degraus: readonly Degrau[] }) {
  return (
    <ol
      className="rounded-[var(--fly-radius-lg)] p-6 sm:p-8"
      style={{
        background: "var(--fly-surface-01)",
        border: "1px solid var(--fly-border-subtle)",
      }}
    >
      {degraus.map((degrau, indice) => (
        <li key={degrau.titulo}>
          <div
            className="flex items-center gap-4 rounded-[var(--fly-radius-sm)] px-4 py-4"
            style={{
              background: degrau.ativo ? "var(--fly-primary-soft)" : "var(--fly-surface-02)",
              border: `1px solid ${degrau.ativo ? "rgb(var(--fly-primary-rgb) / .3)" : "var(--fly-border-subtle)"}`,
            }}
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                background: degrau.ativo ? "var(--fly-primary)" : "var(--fly-text-muted)",
                boxShadow: degrau.ativo ? "0 0 12px var(--fly-primary)" : "none",
              }}
            />
            <span className="min-w-0">
              <span
                className="block text-[15px] tracking-[-0.01em]"
                style={{ color: "var(--fly-text-primary)" }}
              >
                {degrau.titulo}
              </span>
              <span className="block text-[13px]" style={{ color: "var(--fly-text-muted)" }}>
                {degrau.detalhe}
              </span>
            </span>
          </div>

          {indice < degraus.length - 1 && (
            <div aria-hidden="true" className="flex justify-center py-2">
              <span
                className="h-5 w-px"
                style={{
                  background:
                    "linear-gradient(180deg, transparent, rgb(var(--fly-primary-rgb) / .5), transparent)",
                }}
              />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
