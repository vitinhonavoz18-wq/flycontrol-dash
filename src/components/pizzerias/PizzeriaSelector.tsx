import { Check, ChevronsUpDown } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState } from "react";

interface Pizzeria {
  id: string;
  name: string;
}

interface PizzeriaSelectorProps {
  pizzerias: Pizzeria[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function PizzeriaSelector({ pizzerias, activeId, onSelect }: PizzeriaSelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedPizzeria = pizzerias.find((p) => p.id === activeId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[250px] justify-between bg-card text-card-foreground border-primary/20 hover:bg-primary/5 hover:border-primary/50 transition-all duration-300 shadow-sm"
        >
          <span className="truncate">
            {selectedPizzeria ? selectedPizzeria.name : "Selecionar Pizzaria..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0 border-primary/20 shadow-xl" align="start">
        <Command className="bg-card">
          <CommandInput placeholder="Buscar pizzaria..." className="h-9" />
          <CommandList>
            <CommandEmpty>Nenhuma pizzaria encontrada.</CommandEmpty>
            <CommandGroup>
              {pizzerias.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.name}
                  onSelect={() => {
                    onSelect(p.id);
                    setOpen(false);
                  }}
                  className="cursor-pointer hover:bg-primary/10 data-[selected=true]:bg-primary/20"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 text-primary",
                      activeId === p.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {p.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
