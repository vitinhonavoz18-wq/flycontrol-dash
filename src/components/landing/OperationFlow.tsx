import { Reveal } from "./primitivos";

/**
 * As seis etapas da operação, em fita.
 *
 * VENDER → ATENDER → ORGANIZAR → ANALISAR → FIDELIZAR → CRESCER
 *
 * No computador a fita é horizontal, porque a leitura acompanha o tempo: uma
 * coisa depois da outra, da esquerda para a direita. No celular vira vertical
 * pelo mesmo motivo — lá, "depois" é "embaixo".
 *
 * Cada etapa acende sozinha ao entrar na tela, com um atraso a mais que a
 * anterior. O efeito é o de uma esteira ligando, não o de seis caixas
 * piscando ao mesmo tempo.
 *
 * Cada frase descreve algo que o FlyControl realmente faz. Nenhuma promete
 * resultado — "cresça 30%" não é um recurso, é um chute.
 */

const ETAPAS = [
  { titulo: "Vender", texto: "Cardápio digital e pedidos entrando pelo site da sua loja." },
  { titulo: "Atender", texto: "Pedido na tela, comanda na cozinha, status para o cliente." },
  { titulo: "Organizar", texto: "Mesas, garçons, comandas e produtos no mesmo lugar." },
  { titulo: "Analisar", texto: "Faturamento, ticket médio e desempenho por produto." },
  { titulo: "Fidelizar", texto: "Base de clientes e campanhas para quem já comprou." },
  { titulo: "Crescer", texto: "Mais lojas, mais canais, a mesma operação." },
] as const;

export function OperationFlow() {
  return (
    <ol
      className="mt-16 grid gap-px overflow-hidden md:grid-cols-3 xl:grid-cols-6"
      style={{ background: "var(--fly-border-subtle)" }}
    >
      {ETAPAS.map((etapa, indice) => (
        <Reveal as="li" key={etapa.titulo} atraso={indice * 90}>
          <div className="h-full px-6 py-8" style={{ background: "var(--fly-background)" }}>
            <span
              className="font-mono text-[12px] tabular-nums"
              style={{ color: "var(--fly-primary)" }}
            >
              {String(indice + 1).padStart(2, "0")}
            </span>
            <h3
              className="mt-4 text-[22px] tracking-[-0.02em]"
              style={{ color: "var(--fly-text-primary)" }}
            >
              {etapa.titulo}
            </h3>
            <p
              className="mt-2 text-[15px] leading-[1.55]"
              style={{ color: "var(--fly-text-secondary)" }}
            >
              {etapa.texto}
            </p>
          </div>
        </Reveal>
      ))}
    </ol>
  );
}
