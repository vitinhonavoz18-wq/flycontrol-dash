import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Percent, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { lerDescontoAceite, salvarDescontoAceite } from "@/lib/marketing/marketing.functions";

/**
 * O desconto que a loja dá a quem aceita receber ofertas.
 *
 * COMO ISSO APARECE PARA O CLIENTE
 *
 * No fim do pedido, do lado da caixinha "quero receber ofertas", ele lê
 * "ganhe 10% de desconto" — e o total já cai na hora, antes de ele pagar.
 *
 * DUAS COISAS QUE O DONO PRECISA SABER, E QUE A TELA DIZ
 *
 * 1. O desconto sai do bolso dele. Não é cupom da plataforma.
 * 2. Ele incide só sobre os produtos, nunca sobre a taxa de entrega — a taxa
 *    é dinheiro do entregador.
 *
 * O teto de 50% não é capricho: é para um zero digitado a mais ("100" em vez
 * de "10") não fazer a loja vender de graça a noite inteira antes de alguém
 * perceber.
 */

const TETO = 50;

export function DescontoAceite({ tenantId }: { tenantId: string }) {
  const ler = useServerFn(lerDescontoAceite);
  const salvar = useServerFn(salvarDescontoAceite);

  const [percent, setPercent] = useState("");
  const [salvo, setSalvo] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    ler({ data: { tenantId } })
      .then((r) => {
        if (cancelado) return;
        setSalvo(r.percent);
        setPercent(r.percent > 0 ? String(r.percent) : "");
      })
      .catch((e: Error) => !cancelado && toast.error(e.message))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [tenantId, ler]);

  const numero = Number(percent.replace(",", "."));
  const valido =
    percent.trim() === "" || (Number.isFinite(numero) && numero >= 0 && numero <= TETO);
  const mudou = percent.trim() === "" ? salvo !== 0 : numero !== salvo;

  async function gravar() {
    if (!valido) return;
    setSalvando(true);
    try {
      const r = await salvar({
        data: { tenantId, percent: percent.trim() === "" ? 0 : numero },
      });
      setSalvo(r.percent);
      setPercent(r.percent > 0 ? String(r.percent) : "");

      // Salvar aqui não basta: o site de pedidos tem banco próprio, e o valor
      // precisa ser empurrado para lá. Se o empurrão falhar, dizer "salvou" e
      // pronto faria o dono achar que está valendo no site quando não está.
      if (!r.sincronizou) {
        toast.warning(
          `Guardado no painel, mas o site de pedidos ainda não recebeu${
            r.erroSincronia ? `: ${r.erroSincronia}` : "."
          } Tente salvar de novo em instantes.`,
          { duration: 8000 },
        );
      } else {
        toast.success(
          r.percent > 0
            ? `Pronto: quem aceitar receber ofertas ganha ${r.percent}% de desconto. Já vale no site.`
            : "Desconto desligado. A caixinha continua aparecendo, sem oferta.",
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <Card>
        <CardContent className="flex justify-center p-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5 md:p-6">
        <div className="flex items-start gap-3">
          <Percent className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
          <div>
            <h3 className="font-semibold">Desconto para quem aceitar receber ofertas</h3>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">
              No fim do pedido, o cliente vê a oferta ao lado da caixinha e o total já cai na hora.
              É a troca: ele te dá permissão de mandar promoção, você dá um desconto.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor="desconto-percent">Percentual</Label>
            <div className="relative w-32">
              <Input
                id="desconto-percent"
                inputMode="decimal"
                value={percent}
                onChange={(e) => setPercent(e.target.value.replace(/[^0-9.,]/g, ""))}
                placeholder="0"
                className="pr-8"
                aria-invalid={!valido}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </div>

          <Button onClick={gravar} disabled={!valido || !mudou || salvando}>
            {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Salvar
          </Button>

          {salvo > 0 && (
            <p className="text-sm text-muted-foreground">
              Hoje está valendo <span className="font-bold text-foreground">{salvo}%</span>.
            </p>
          )}
        </div>

        {!valido && (
          <p className="text-sm text-destructive">
            Use um número de 0 a {TETO}. Deixe em branco ou 0 para não dar desconto nenhum.
          </p>
        )}

        {valido && numero > 0 && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium">Como fica um pedido de R$ 100,00 em produtos:</p>
            <p className="mt-1 text-muted-foreground">
              Desconto de {numero}% ={" "}
              <span className="font-bold text-foreground">
                {(Math.floor(100 * numero) / 100).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </span>{" "}
              a menos. A taxa de entrega não entra na conta.
            </p>
          </div>
        )}

        <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-500" />
          <p className="text-sm text-muted-foreground">
            Este desconto sai do seu bolso, em todo pedido de quem aceitar — não é cupom da
            plataforma. Como a caixinha já vem marcada no site, a maioria vai aceitar. Comece com um
            número que você aguentaria dar em todos os pedidos da noite.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
