import { useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { Check } from "lucide-react";
import {
  formatar,
  lerCor,
  paraHex,
  paraHslTexto,
  variacoes,
  type FormatoCor,
  type Hsl,
} from "@/lib/theme/color";

/**
 * Seletor de cor da marca.
 *
 * Feito à mão de propósito: o painel já tem tudo que ele precisa (Popover,
 * Sheet, Input, Button). Trazer uma biblioteca de fora só para isto seria
 * como comprar um forno industrial para esquentar um pão — pesa no
 * carregamento da página e traz manutenção que não é nossa.
 *
 * NO CELULAR ELE ABRE POR BAIXO, EM TELA CHEIA
 *
 * Um quadradinho de 200 pixels não se acerta com o dedo. No celular e no
 * tablet o seletor sobe pela base da tela, grande, com as áreas de toque no
 * tamanho que a mão precisa.
 */

const FORMATOS: { id: FormatoCor; rotulo: string }[] = [
  { id: "hex", rotulo: "HEX" },
  { id: "rgb", rotulo: "RGB" },
  { id: "hsl", rotulo: "HSL" },
];

type Props = {
  /** Cor atual. Nunca nula aqui: quem chama decide o que fazer com "sem cor". */
  valor: Hsl;
  /** Dispara a cada arrasto — é o que faz a prévia acompanhar o dedo. */
  onChange: (cor: Hsl) => void;
  rotulo: string;
  id?: string;
  disabled?: boolean;
};

export function ColorPicker({ valor, onChange, rotulo, id, disabled }: Props) {
  const [aberto, setAberto] = useState(false);
  const isMobile = useIsMobile();

  const gatilho = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setAberto(true)}
        aria-label={`Escolher ${rotulo}`}
        className="h-11 w-11 shrink-0 rounded-lg border-2 border-border shadow-sm transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        style={{ background: paraHslTexto(valor) }}
      />
      {/* O código também abre o seletor: é onde a mão vai primeiro quando a
          pessoa já tem o código do logo na cabeça. */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAberto(true)}
        className="h-11 flex-1 rounded-lg border border-input bg-background px-3 text-left font-mono text-sm transition-colors hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
      >
        {paraHex(valor)}
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <>
        {gatilho}
        <Sheet open={aberto} onOpenChange={setAberto}>
          <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
            <SheetHeader className="text-left">
              <SheetTitle>{rotulo}</SheetTitle>
            </SheetHeader>
            <div className="pb-6 pt-2">
              <PainelDeCor valor={valor} onChange={onChange} />
              <Button className="mt-5 h-12 w-full" onClick={() => setAberto(false)}>
                <Check className="mr-2 h-4 w-4" /> Pronto
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <div>{gatilho}</div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-4">
        <PainelDeCor valor={valor} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

/** O miolo: área de saturação/luz, matiz, código e variações. */
function PainelDeCor({ valor, onChange }: { valor: Hsl; onChange: (c: Hsl) => void }) {
  const [formato, setFormato] = useState<FormatoCor>("hex");
  const [texto, setTexto] = useState(() => formatar(valor, "hex"));
  const [invalido, setInvalido] = useState(false);

  // Enquanto a pessoa arrasta, o campo de código acompanha. Enquanto ela
  // digita, ele não é reescrito por baixo da mão — daí a comparação: só
  // reescreve quando a cor de fora realmente é outra.
  useEffect(() => {
    const atual = lerCor(texto);
    if (!atual || atual.h !== valor.h || atual.s !== valor.s || atual.l !== valor.l) {
      setTexto(formatar(valor, formato));
      setInvalido(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor.h, valor.s, valor.l, formato]);

  function digitou(novo: string) {
    setTexto(novo);
    const cor = lerCor(novo);
    if (cor) {
      setInvalido(false);
      onChange(cor);
    } else {
      setInvalido(true);
    }
  }

  const tons = useMemo(() => variacoes(valor), [valor]);

  return (
    <div className="space-y-3">
      <AreaSaturacaoLuz valor={valor} onChange={onChange} />
      <SliderMatiz valor={valor} onChange={onChange} />

      <div className="flex items-center gap-2">
        <span
          className="h-10 w-10 shrink-0 rounded-lg border-2 border-border"
          style={{ background: paraHslTexto(valor) }}
          aria-hidden="true"
        />
        <Input
          value={texto}
          onChange={(e) => digitou(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalido}
          aria-label="Código da cor"
          className={`h-10 flex-1 font-mono text-sm ${invalido ? "border-destructive" : ""}`}
        />
      </div>

      <div className="flex gap-1">
        {FORMATOS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFormato(f.id)}
            className={`h-8 flex-1 rounded-md border text-xs font-semibold transition-colors ${
              formato === f.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-input text-muted-foreground hover:border-primary/40"
            }`}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      {invalido && (
        <p className="text-xs text-destructive">
          Não reconheci esse código. Tente algo como #D7AC32, rgb(215, 172, 50) ou hsl(45, 68%,
          52%).
        </p>
      )}

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          Tons desta cor — clique para usar
        </p>
        <div className="flex gap-1.5">
          {tons.map((t) => (
            <button
              key={t.rotulo}
              type="button"
              title={t.rotulo}
              onClick={() => onChange(t.cor)}
              className="h-9 flex-1 rounded-md border border-border transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              style={{ background: paraHslTexto(t.cor) }}
            >
              <span className="sr-only">{t.rotulo}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Arrastar em duas dimensões ao mesmo tempo: para a direita a cor fica mais
 * viva, para baixo ela escurece.
 *
 * Usa eventos de ponteiro (`pointer`), que valem para mouse, dedo e caneta de
 * uma vez só — em vez de escrever a mesma coisa três vezes.
 */
function AreaSaturacaoLuz({ valor, onChange }: { valor: Hsl; onChange: (c: Hsl) => void }) {
  const areaRef = useRef<HTMLDivElement>(null);

  function posicaoParaCor(clientX: number, clientY: number) {
    const caixa = areaRef.current?.getBoundingClientRect();
    if (!caixa || caixa.width === 0 || caixa.height === 0) return;
    const x = Math.min(1, Math.max(0, (clientX - caixa.left) / caixa.width));
    const y = Math.min(1, Math.max(0, (clientY - caixa.top) / caixa.height));
    // Mesmo mapeamento do seletor que todo mundo já conhece: X é o quanto a
    // cor é "cheia", Y vai do branco ao preto.
    const s = x * 100;
    const l = (1 - y) * (100 - s / 2);
    onChange({ h: valor.h, s: Math.round(s * 100) / 100, l: Math.round(l * 100) / 100 });
  }

  function aoApontar(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    posicaoParaCor(e.clientX, e.clientY);
  }

  function aoArrastar(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    posicaoParaCor(e.clientX, e.clientY);
  }

  function pelasSetas(e: React.KeyboardEvent<HTMLDivElement>) {
    const passo = e.shiftKey ? 10 : 2;
    let { s, l } = valor;
    if (e.key === "ArrowRight") s += passo;
    else if (e.key === "ArrowLeft") s -= passo;
    else if (e.key === "ArrowUp") l += passo;
    else if (e.key === "ArrowDown") l -= passo;
    else return;
    e.preventDefault();
    onChange({
      h: valor.h,
      s: Math.min(100, Math.max(0, s)),
      l: Math.min(100, Math.max(0, l)),
    });
  }

  const x = valor.s;
  const denominador = 100 - valor.s / 2;
  const y = denominador === 0 ? 0 : 100 - (valor.l / denominador) * 100;

  return (
    <div
      ref={areaRef}
      role="application"
      aria-label="Área de saturação e luminosidade"
      tabIndex={0}
      onPointerDown={aoApontar}
      onPointerMove={aoArrastar}
      onKeyDown={pelasSetas}
      // `touch-none` impede a página de rolar junto quando o dedo arrasta
      // aqui dentro — sem isso, no celular a tela escorrega e a cor não muda.
      className="relative h-40 w-full cursor-crosshair touch-none rounded-lg border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${valor.h}, 100%, 50%))`,
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
        style={{
          left: `${Math.min(100, Math.max(0, x))}%`,
          top: `${Math.min(100, Math.max(0, y))}%`,
          background: paraHslTexto(valor),
        }}
      />
    </div>
  );
}

/** A faixa do arco-íris: escolhe a família da cor antes de afinar o tom. */
function SliderMatiz({ valor, onChange }: { valor: Hsl; onChange: (c: Hsl) => void }) {
  const faixaRef = useRef<HTMLDivElement>(null);

  function posicaoParaMatiz(clientX: number) {
    const caixa = faixaRef.current?.getBoundingClientRect();
    if (!caixa || caixa.width === 0) return;
    const x = Math.min(1, Math.max(0, (clientX - caixa.left) / caixa.width));
    onChange({ ...valor, h: Math.round(x * 360 * 100) / 100 });
  }

  return (
    <div
      ref={faixaRef}
      role="slider"
      aria-label="Matiz"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(valor.h)}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        posicaoParaMatiz(e.clientX);
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        posicaoParaMatiz(e.clientX);
      }}
      onKeyDown={(e) => {
        const passo = e.shiftKey ? 15 : 3;
        if (e.key === "ArrowRight") onChange({ ...valor, h: (valor.h + passo) % 360 });
        else if (e.key === "ArrowLeft") onChange({ ...valor, h: (valor.h - passo + 360) % 360 });
        else return;
        e.preventDefault();
      }}
      className="relative h-6 w-full cursor-pointer touch-none rounded-full border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      style={{
        background:
          "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
        style={{
          left: `${(valor.h / 360) * 100}%`,
          background: `hsl(${valor.h}, 100%, 50%)`,
        }}
      />
    </div>
  );
}
