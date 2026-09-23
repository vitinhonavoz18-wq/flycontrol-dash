import { useState, type ReactNode } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { Tom } from "@/lib/afiliados/situacoes";
import { SITUACAO_DO_AFILIADO } from "@/lib/afiliados/adminRotulos";
import type { SituacaoDoAfiliado } from "@/lib/afiliados/portal";
import { cn } from "@/lib/utils";

/**
 * Peças do Painel Admin → Afiliados. Seguem o desenho do resto do painel
 * (cartões, tabelas e cores do tema claro/escuro), e não o preto fixo do
 * portal do parceiro: esta é a mesa de trabalho da equipe, não a vitrine.
 */

const TOM_ADMIN: Record<Tom, string> = {
  laranja: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  azul: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  verde: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  vermelho: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
  cinza: "border-border bg-muted text-muted-foreground",
};

export function SeloAdmin({ tom, children }: { tom: Tom; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        TOM_ADMIN[tom],
      )}
    >
      {children}
    </span>
  );
}

export function SeloDoAfiliado({ status }: { status: SituacaoDoAfiliado }) {
  const s = SITUACAO_DO_AFILIADO[status];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        s.classe,
      )}
    >
      {s.rotulo}
    </span>
  );
}

export function Kpi({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
  destaque,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  icone: React.ComponentType<{ className?: string }>;
  destaque?: boolean;
}) {
  return (
    <Card className={cn(destaque && "border-primary/50")}>
      <CardContent className="flex items-start gap-3 p-4">
        <Icone
          className={cn(
            "mt-0.5 h-5 w-5 shrink-0",
            destaque ? "text-primary" : "text-muted-foreground",
          )}
        />
        <div className="min-w-0">
          <div className="whitespace-nowrap text-xl font-bold leading-tight tabular-nums sm:text-2xl">
            {valor}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{rotulo}</div>
          {detalhe ? (
            <div className="mt-0.5 text-xs text-muted-foreground/80">{detalhe}</div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function Carregando({ linhas = 5 }: { linhas?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function Vazio({ titulo, texto }: { titulo: string; texto?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
      <Inbox className="h-6 w-6 text-muted-foreground" />
      <p className="font-medium">{titulo}</p>
      {texto ? <p className="max-w-md text-sm text-muted-foreground">{texto}</p> : null}
    </div>
  );
}

export function Erro({ mensagem, tentarDeNovo }: { mensagem: string; tentarDeNovo?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-8 text-center"
    >
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <p className="text-sm">{mensagem}</p>
      {tentarDeNovo ? (
        <Button variant="outline" size="sm" onClick={tentarDeNovo}>
          <RotateCw className="mr-2 h-4 w-4" /> Tentar de novo
        </Button>
      ) : null}
    </div>
  );
}

export function PaginacaoAdmin({
  pagina,
  total,
  porPagina,
  aoMudar,
}: {
  pagina: number;
  total: number;
  porPagina: number;
  aoMudar: (p: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {total} {total === 1 ? "registro" : "registros"}
      </span>
      {total > porPagina ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pagina <= 1}
            onClick={() => aoMudar(pagina - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Anterior</span>
          </Button>
          <span className="tabular-nums">
            {pagina} de {paginas}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagina >= paginas}
            onClick={() => aoMudar(pagina + 1)}
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Próxima</span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Seletor nativo com o visual dos campos do painel. */
export function SeletorAdmin({
  valor,
  aoMudar,
  opcoes,
  rotulo,
  className,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  opcoes: { valor: string; rotulo: string }[];
  rotulo: string;
  className?: string;
}) {
  return (
    <select
      aria-label={rotulo}
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      className={cn(
        "h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.rotulo}
        </option>
      ))}
    </select>
  );
}

/**
 * A confirmação das ações que mexem em dinheiro ou na situação de alguém.
 *
 * Nada acontece com um clique só: abre esta janela, diz em uma frase o que
 * vai acontecer, pede o motivo quando a regra exige, e só então chama o
 * banco. Enquanto o banco responde, o botão fica travado — dois cliques
 * rápidos não viram duas ações (e, se virassem, o banco recusaria a
 * segunda).
 */
export function ConfirmarAcao({
  aberto,
  aoFechar,
  titulo,
  descricao,
  rotuloDoBotao,
  perigosa,
  motivo,
  campoExtra,
  aoConfirmar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao: ReactNode;
  rotuloDoBotao: string;
  perigosa?: boolean;
  /** Quando presente, pede um texto com pelo menos `minimo` letras. */
  motivo?: { rotulo: string; minimo: number; obrigatorio: boolean; dica?: string };
  /** Um campo de uma linha a mais (ex.: comprovante do Pix). */
  campoExtra?: { rotulo: string; dica?: string; obrigatorio?: boolean };
  aoConfirmar: (dados: { motivo: string; extra: string }) => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [extra, setExtra] = useState("");
  const [enviando, setEnviando] = useState(false);

  const motivoOk = !motivo || !motivo.obrigatorio || texto.trim().length >= motivo.minimo;
  const extraOk = !campoExtra?.obrigatorio || extra.trim().length > 0;

  async function confirmar() {
    if (!motivoOk || !extraOk || enviando) return;
    setEnviando(true);
    try {
      await aoConfirmar({ motivo: texto.trim(), extra: extra.trim() });
      setTexto("");
      setExtra("");
      aoFechar();
    } catch {
      // Quem chamou já mostrou o erro; a janela fica aberta para corrigir.
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AlertDialog
      open={aberto}
      onOpenChange={(abrir) => {
        if (!abrir && !enviando) aoFechar();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">{descricao}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {motivo ? (
          <div className="space-y-1.5">
            <Label htmlFor="confirmar-motivo">{motivo.rotulo}</Label>
            <Textarea
              id="confirmar-motivo"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {motivo.dica ??
                (motivo.obrigatorio
                  ? `Obrigatório, mínimo de ${motivo.minimo} letras.`
                  : "Opcional.")}
            </p>
          </div>
        ) : null}
        {campoExtra ? (
          <div className="space-y-1.5">
            <Label htmlFor="confirmar-extra">{campoExtra.rotulo}</Label>
            <Input
              id="confirmar-extra"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              maxLength={200}
            />
            {campoExtra.dica ? (
              <p className="text-xs text-muted-foreground">{campoExtra.dica}</p>
            ) : null}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!motivoOk || !extraOk || enviando}
            onClick={(e) => {
              // Mantém a janela aberta até o banco responder.
              e.preventDefault();
              void confirmar();
            }}
            className={cn(
              perigosa && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {enviando ? "Aguarde..." : rotuloDoBotao}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
