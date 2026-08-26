import { useEffect, useState } from "react";

/**
 * A comanda que se imprime sozinha.
 *
 * É o elemento que carrega a página inteira. A razão: o que define a noite de
 * uma pizzaria não é gráfico nem painel — é o papel saindo da impressora da
 * cozinha. Mostrar o produto pela coisa que ele produz diz mais que qualquer
 * frase de venda.
 *
 * As linhas aparecem uma a uma, no ritmo de uma impressora térmica. Quem
 * pediu menos animação no sistema (a opção de acessibilidade do celular ou do
 * computador) vê a comanda inteira de uma vez, sem espera.
 */

type Linha =
  | { tipo: "titulo"; texto: string }
  | { tipo: "meta"; texto: string }
  | { tipo: "divisor" }
  | { tipo: "item"; qtd: string; nome: string; valor: string }
  | { tipo: "sub"; texto: string }
  | { tipo: "conta"; rotulo: string; valor: string }
  | { tipo: "total"; rotulo: string; valor: string }
  | { tipo: "carimbo"; texto: string };

/** Um pedido plausível de pizzaria — nomes, valores e horário coerentes. */
const COMANDA: Linha[] = [
  { tipo: "titulo", texto: "FLYCONTROL" },
  { tipo: "meta", texto: "PEDIDO #1042" },
  { tipo: "meta", texto: "19:42  ·  DELIVERY" },
  { tipo: "divisor" },
  { tipo: "item", qtd: "1x", nome: "PIZZA GRANDE", valor: "54,00" },
  { tipo: "sub", texto: "Calabresa / Catupiry" },
  { tipo: "sub", texto: "Borda: catupiry" },
  { tipo: "item", qtd: "2x", nome: "COCA-COLA 2L", valor: "25,00" },
  { tipo: "divisor" },
  { tipo: "conta", rotulo: "Subtotal", valor: "79,00" },
  { tipo: "conta", rotulo: "Entrega", valor: "8,00" },
  { tipo: "total", rotulo: "TOTAL", valor: "R$ 87,00" },
  { tipo: "divisor" },
  { tipo: "meta", texto: "ANA PAULA" },
  { tipo: "meta", texto: "R. DAS ACACIAS, 120" },
  { tipo: "divisor" },
  { tipo: "carimbo", texto: "impresso na cozinha" },
];

/** Papel térmico: nem branco puro, nem cinza — levemente quente e sujo. */
const PAPEL = "#F4EFE4";
const TINTA = "#16120E";

export function Comanda() {
  // Começa impressa. Se o JavaScript não rodar, ou se a pessoa pediu menos
  // animação, ela já está lá inteira — a página nunca aparece vazia.
  const [visiveis, setVisiveis] = useState(COMANDA.length);

  useEffect(() => {
    const querMenosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (querMenosMovimento) return;

    setVisiveis(0);
    let linha = 0;
    const timer = window.setInterval(() => {
      linha += 1;
      setVisiveis(linha);
      if (linha >= COMANDA.length) window.clearInterval(timer);
    }, 130);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="relative w-full max-w-[340px]">
      {/* Luz da impressora batendo no papel. */}
      <div
        aria-hidden="true"
        className="absolute -inset-8 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(255,90,0,0.35), transparent 70%)" }}
      />

      <div
        className="relative px-6 pb-3 pt-6 font-comanda text-[13px] leading-[1.5]"
        style={{
          background: PAPEL,
          color: TINTA,
          // Papel não é retângulo perfeito: a borda de baixo é serrilhada,
          // como quando se destaca da bobina.
          maskImage:
            "linear-gradient(#000 calc(100% - 10px), transparent 0), repeating-conic-gradient(from -45deg at bottom, #000 0deg 90deg, transparent 90deg 180deg)",
          maskSize: "100% 100%, 14px 20px",
          maskPosition: "top, bottom",
          maskRepeat: "no-repeat, repeat-x",
          WebkitMaskImage:
            "linear-gradient(#000 calc(100% - 10px), transparent 0), repeating-conic-gradient(from -45deg at bottom, #000 0deg 90deg, transparent 90deg 180deg)",
          WebkitMaskSize: "100% 100%, 14px 20px",
          WebkitMaskPosition: "top, bottom",
          WebkitMaskRepeat: "no-repeat, repeat-x",
        }}
      >
        {COMANDA.map((linha, i) => (
          <Impressa key={i} visivel={i < visiveis} linha={linha} />
        ))}

        {/* Espaço para o serrilhado não comer a última linha. */}
        <div className="h-4" aria-hidden="true" />
      </div>
    </div>
  );
}

function Impressa({ linha, visivel }: { linha: Linha; visivel: boolean }) {
  // A linha some para cima 2px ao aparecer: o papel avançando um passo.
  const estado = visivel ? "translate-y-0 opacity-100" : "translate-y-[2px] opacity-0";
  const base = `transition-all duration-200 ${estado}`;

  switch (linha.tipo) {
    case "titulo":
      return (
        <p className={`${base} mb-2 text-center text-[15px] font-bold tracking-[0.35em]`}>
          {linha.texto}
        </p>
      );

    case "meta":
      return (
        <p className={`${base} text-center text-[11px] tracking-[0.12em] opacity-70`}>
          {linha.texto}
        </p>
      );

    case "divisor":
      return (
        <div
          className={`${base} my-2 border-t border-dashed`}
          style={{ borderColor: "#16120E40" }}
        />
      );

    case "item":
      return (
        <div className={`${base} flex items-baseline gap-2`}>
          <span className="font-bold">{linha.qtd}</span>
          <span className="flex-1 truncate font-bold">{linha.nome}</span>
          <span className="font-bold">{linha.valor}</span>
        </div>
      );

    case "sub":
      return <p className={`${base} pl-7 text-[11px] opacity-60`}>{linha.texto}</p>;

    case "conta":
      return (
        <div className={`${base} flex justify-between text-[12px] opacity-75`}>
          <span>{linha.rotulo}</span>
          <span>{linha.valor}</span>
        </div>
      );

    case "total":
      return (
        <div className={`${base} mt-1 flex items-baseline justify-between text-[15px] font-bold`}>
          <span className="tracking-[0.15em]">{linha.rotulo}</span>
          <span>{linha.valor}</span>
        </div>
      );

    case "carimbo":
      return (
        <p className={`${base} text-center text-[11px] tracking-[0.1em] opacity-55`}>
          ✓ {linha.texto}
        </p>
      );
  }
}
