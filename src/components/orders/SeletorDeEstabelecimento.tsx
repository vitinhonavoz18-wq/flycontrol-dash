import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  LOJAS_POR_PAGINA,
  TODOS_OS_ESTABELECIMENTOS,
  termoDeBuscaDeLoja,
} from "@/lib/orders/buscaDePedidos";

export type LojaOpcao = { id: string; name: string };

interface Props {
  /** `TODOS_OS_ESTABELECIMENTOS` ou o id da loja escolhida. */
  value: string;
  onChange: (value: string, loja: LojaOpcao | null) => void;
  id?: string;
}

/**
 * Seletor pesquisável de estabelecimento, só para o administrador geral.
 *
 * A lista vem do banco aos poucos (30 por vez) e a pesquisa pelo nome é feita
 * no banco, não na tela — assim continua leve mesmo com centenas de lojas,
 * como o cardápio que mostra as categorias primeiro em vez de imprimir todos
 * os pratos de uma vez.
 *
 * Ele não dá poder nenhum por si só: quem não é administrador recebe do banco
 * apenas as próprias lojas, mesmo que este componente apareça por engano.
 */
export function SeletorDeEstabelecimento({ value, onChange, id }: Props) {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const [lojas, setLojas] = useState<LojaOpcao[]>([]);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhida, setEscolhida] = useState<LojaOpcao | null>(null);
  // Só a resposta da pesquisa mais recente vale (digitação rápida gera várias).
  const pedidoAtual = useRef(0);

  async function carregar(termo: string, inicio: number) {
    const meu = ++pedidoAtual.current;
    setCarregando(true);
    setErro(null);
    let q = supabase
      .from("pizzerias")
      .select("id, name")
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(inicio, inicio + LOJAS_POR_PAGINA - 1);
    if (termo) q = q.ilike("name", `%${termo}%`);
    const { data, error } = await q;
    if (meu !== pedidoAtual.current) return;
    setCarregando(false);
    if (error) {
      setErro("Não foi possível carregar os estabelecimentos.");
      return;
    }
    const novas = (data ?? []) as LojaOpcao[];
    setLojas((antes) => (inicio === 0 ? novas : [...antes, ...novas]));
    setTemMais(novas.length === LOJAS_POR_PAGINA);
  }

  // Pesquisa no banco com uma pequena espera depois da digitação.
  useEffect(() => {
    if (!open) return;
    const termo = termoDeBuscaDeLoja(texto);
    const t = setTimeout(() => carregar(termo, 0), termo ? 300 : 0);
    return () => clearTimeout(t);
  }, [texto, open]);

  // "Limpar" volta o valor para "todos": esquece a loja lembrada.
  useEffect(() => {
    if (value === TODOS_OS_ESTABELECIMENTOS) setEscolhida(null);
  }, [value]);

  const rotulo =
    value === TODOS_OS_ESTABELECIMENTOS
      ? "Todos os estabelecimentos"
      : (escolhida?.name ?? "Selecione um estabelecimento");

  function escolher(v: string, loja: LojaOpcao | null) {
    setEscolhida(loja);
    onChange(v, loja);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Estabelecimento"
          className="w-full justify-between font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Store className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{rotulo}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[240px] max-w-[calc(100vw-2rem)] p-0"
        align="start"
      >
        {/* shouldFilter=false: a pesquisa é feita no banco, não na lista. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Pesquisar estabelecimento..."
            value={texto}
            onValueChange={setTexto}
            className="h-9"
          />
          <CommandList>
            {!carregando && !erro && (
              <CommandEmpty>Nenhum estabelecimento encontrado.</CommandEmpty>
            )}
            <CommandGroup>
              <CommandItem
                value={TODOS_OS_ESTABELECIMENTOS}
                onSelect={() => escolher(TODOS_OS_ESTABELECIMENTOS, null)}
                className="cursor-pointer font-medium"
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 text-primary",
                    value === TODOS_OS_ESTABELECIMENTOS ? "opacity-100" : "opacity-0",
                  )}
                />
                Todos os estabelecimentos
              </CommandItem>
              {lojas.map((l) => (
                <CommandItem
                  key={l.id}
                  value={l.id}
                  onSelect={() => escolher(l.id, l)}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 text-primary",
                      value === l.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{l.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {erro && (
              <div className="px-3 py-2 text-sm text-destructive" role="alert">
                {erro}{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => carregar(termoDeBuscaDeLoja(texto), 0)}
                >
                  Tentar de novo
                </button>
              </div>
            )}
            {carregando && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
              </div>
            )}
            {!carregando && temMais && (
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-primary hover:bg-muted"
                onClick={() => carregar(termoDeBuscaDeLoja(texto), lojas.length)}
              >
                Carregar mais estabelecimentos
              </button>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
