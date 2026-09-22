import { Check, Circle } from "lucide-react";
import { ETAPAS_DO_GUIA, type IdDaEtapaDoGuia } from "@/lib/onboarding/guia/etapas";

export type ChecklistDeProntidaoProps = {
  concluidas: readonly IdDaEtapaDoGuia[];
};

/**
 * O resumo de prontidão, mostrado no fim do guia.
 *
 * POR QUE ELE EXISTE
 *
 * O lojista passou por seis telas diferentes em ordem, cada uma pedindo uma
 * coisa. No fim ele não tem ideia do que exatamente ficou configurado — só
 * que "respondeu um monte de coisa". Este resumo é a conferência do pedido
 * antes de sair da cozinha: ele lê a lista e reconhece o que fez.
 *
 * O QUE ELE NÃO É
 *
 * Não é um enfeite com tudo marcado. Cada linha vem das mesmas etapas
 * concluídas de verdade que o servidor calculou olhando a loja — inclusive as
 * duas que ainda estão por vir, que aparecem em aberto. Dizer "tudo pronto"
 * com Plano Cents e Pedido teste faltando seria o boletim que dá nota para
 * matéria que ninguém deu.
 */
export function ChecklistDeProntidao({ concluidas }: ChecklistDeProntidaoProps) {
  const feitas = new Set(concluidas);
  // A prontidão em si não entra na lista: ela É a lista.
  const linhas = ETAPAS_DO_GUIA.filter((e) => e.id !== "prontidao");

  return (
    <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto pr-1 text-sm sm:max-h-none">
      {linhas.map((etapa) => {
        const feita = feitas.has(etapa.id);
        return (
          <li
            key={etapa.id}
            className={`flex items-center gap-2 ${
              feita
                ? "font-semibold text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground"
            }`}
          >
            {feita ? (
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <Circle className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 truncate">{etapa.rotulo}</span>
            {/* O estado também em texto: quem usa leitor de tela não vê ícone,
                e quem não distingue verde não vê a cor. */}
            <span className="sr-only">{feita ? "concluído" : "ainda não"}</span>
            {!feita && (
              <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide">em breve</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
