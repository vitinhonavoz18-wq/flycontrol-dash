import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Sandwich, Pizza, Croissant, Utensils } from "lucide-react";
import { MENU_TEMPLATES, applyMenuTemplate, type MenuTemplateKey } from "./menuTemplates";

interface MenuTemplatePickerProps {
  pizzeriaId: string;
  onApplied: () => void;
  onSkip: () => void;
}

const TEMPLATE_ICONS: Record<MenuTemplateKey, typeof Sandwich> = {
  hamburgueria: Sandwich,
  pizzaria: Pizza,
  pastelaria: Croissant,
};

export function MenuTemplatePicker({ pizzeriaId, onApplied, onSkip }: MenuTemplatePickerProps) {
  const [applying, setApplying] = useState<MenuTemplateKey | null>(null);

  async function handlePick(key: MenuTemplateKey) {
    setApplying(key);
    const result = await applyMenuTemplate(pizzeriaId, key);
    setApplying(null);

    if (!result.ok) {
      toast.error("Não deu para aplicar o modelo: " + result.error);
      return;
    }
    toast.success(`Cardápio de ${MENU_TEMPLATES[key].label} criado! Agora é só editar.`);
    onApplied();
  }

  return (
    <div className="mx-auto max-w-3xl py-8 text-center">
      <h2 className="text-xl font-bold">Como é o seu cardápio?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Escolha um modelo pronto pra começar mais rápido — depois é só editar os produtos e preços
        do jeito que a sua loja funciona.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(Object.values(MENU_TEMPLATES) as (typeof MENU_TEMPLATES)[MenuTemplateKey][]).map(
          (template) => {
            const Icon = TEMPLATE_ICONS[template.key];
            const isApplying = applying === template.key;
            return (
              <Card
                key={template.key}
                role="button"
                tabIndex={0}
                onClick={() => !applying && handlePick(template.key)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && !applying) handlePick(template.key);
                }}
                className={`cursor-pointer text-left transition-colors hover:border-primary/50 hover:bg-primary/5 ${
                  applying && !isApplying ? "pointer-events-none opacity-50" : ""
                }`}
              >
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    {isApplying ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold">{template.label}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          },
        )}

        <Card
          role="button"
          tabIndex={0}
          onClick={() => !applying && onSkip()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !applying) onSkip();
          }}
          className={`cursor-pointer text-left transition-colors hover:border-primary/50 hover:bg-primary/5 ${
            applying ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <CardContent className="flex items-start gap-4 p-5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Utensils className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold">Outro</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Nenhum dos modelos combina com o meu negócio — prefiro montar do zero.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
