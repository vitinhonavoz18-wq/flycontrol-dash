import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Circle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { sinaisDaLoja } from "@/lib/onboarding/onboarding.functions";
import {
  primeirosPassos,
  tudoFeito,
  quantosFeitos,
  type SinaisDaLoja,
} from "@/lib/onboarding/primeirosPassos";

/**
 * "Prepare sua loja" — a lista de primeiros passos no painel.
 *
 * ELA É UM ANDAIME, NÃO UM MÓVEL
 *
 * Aparece só enquanto falta alguma coisa e some sozinha quando tudo estiver
 * feito. Um painel que fica para sempre lembrando de tarefas concluídas vira
 * ruído, e ruído a gente aprende a não ler.
 *
 * NADA SE MARCA SOZINHO
 *
 * Cada item é conferido contra um dado real: produto cadastrado, pedido
 * recebido, cardápio no ar. Passo que se marca sozinho é boletim que dá nota
 * para matéria que ninguém deu.
 */
export function PrimeirosPassosCard() {
  const buscar = useServerFn(sinaisDaLoja);
  const [sinais, setSinais] = useState<SinaisDaLoja | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = (await buscar({ data: undefined })) as SinaisDaLoja | null;
      setSinais(r && typeof r.produtos === "number" ? r : null);
    } catch {
      setSinais(null);
    }
  }, [buscar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!sinais || tudoFeito(sinais)) return null;

  const passos = primeirosPassos(sinais);
  const { feitos, total } = quantosFeitos(sinais);

  return (
    <Card className="mb-6 border-primary/20 bg-gradient-to-br from-card to-primary/5">
      <CardContent className="p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Prepare sua loja
          </p>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            {feitos} de {total}
          </span>
        </div>

        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {passos.map((passo) => {
            const conteudo = (
              <>
                {passo.feito ? (
                  <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span
                  className={passo.feito ? "text-muted-foreground line-through" : "font-semibold"}
                >
                  {passo.rotulo}
                </span>
              </>
            );
            return (
              <li key={passo.id}>
                {passo.para && !passo.feito ? (
                  <Link
                    to={passo.para}
                    className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-muted"
                  >
                    {conteudo}
                  </Link>
                ) : (
                  <div className="flex min-h-10 items-center gap-2 px-2 text-sm">{conteudo}</div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
