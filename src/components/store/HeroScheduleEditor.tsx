import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ImageUpload } from "@/components/ui/image-upload";
import { VideoUpload } from "@/components/ui/video-upload";
import { AlertTriangle, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import {
  FUSOS,
  FUSO_PADRAO,
  NOME_CURTO_DO_DIA,
  TODOS_OS_DIAS,
  capaDoMomento,
  conflitosDoCandidato,
  horarioDosMinutos,
  lerProgramacao,
  minutosDoHorario,
  novoId,
  ordenarPeriodos,
  paraGravar,
  resumoDosDias,
  type CapaFixa,
  type DiaDaSemana,
  type PeriodoDoHero,
  type ProgramacaoDoHero,
} from "@/lib/site/heroSchedule";

/**
 * A aba de capa programada, dentro de "Minha Loja → Capa (Hero)".
 *
 * O QUE ESTA TELA FAZ PELO LOJISTA
 *
 * Ele monta uma vez a agenda de capas — café da manhã de manhã, promoção de
 * almoço ao meio-dia, pizza à noite — e não precisa mais entrar aqui para
 * trocar nada. O cardápio troca sozinho na hora certa.
 *
 * NADA É APAGADO AO DESLIGAR
 *
 * O interruptor geral apenas suspende a automação: as programações continuam
 * guardadas. É o timer da vitrine — desligar não joga fora a decoração, só
 * para de acender.
 */

type Props = {
  /** O pacotinho de configurações da loja, direto do banco. */
  siteSettings: unknown;
  /** A capa fixa que a loja já tem, para a prévia do que acontece no fallback. */
  capaFixa: CapaFixa;
  aoSalvar: (programacao: Record<string, unknown>) => Promise<boolean>;
  salvando?: boolean;
};

const RASCUNHO_NOVO = (): PeriodoDoHero => ({
  id: novoId(),
  nome: "",
  inicio: "06:00",
  fim: "11:59",
  dias: [...TODOS_OS_DIAS],
  tipo: "imagem",
  url: "",
  ativo: true,
});

export function HeroScheduleEditor({ siteSettings, capaFixa, aoSalvar, salvando }: Props) {
  const salva = useMemo(() => lerProgramacao(siteSettings), [siteSettings]);
  const [prog, setProg] = useState<ProgramacaoDoHero>(salva);
  const [editando, setEditando] = useState<PeriodoDoHero | null>(null);
  const [excluindo, setExcluindo] = useState<PeriodoDoHero | null>(null);

  // Um relógio de um minuto só para o cartão "no ar agora" não ficar parado
  // enquanto o lojista mexe na tela. É a única coisa que roda em repetição
  // aqui, e roda no painel — não no cardápio do cliente.
  const [tique, setTique] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setTique(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const noAr = useMemo(() => capaDoMomento(prog, capaFixa, tique), [prog, capaFixa, tique]);

  async function gravar(novo: ProgramacaoDoHero) {
    const antes = prog;
    setProg(novo);
    const ok = await aoSalvar(paraGravar(novo));
    if (!ok) setProg(antes);
  }

  const periodos = ordenarPeriodos(prog.periodos);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Capa programada por horário
          </CardTitle>
          <CardDescription>
            Prepare capas diferentes para cada momento do dia. O cardápio troca sozinho na hora
            certa, sem você precisar entrar aqui.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Modo */}
          <div className="space-y-2">
            <Label>Modo da capa</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["fixo", "Capa fixa", "Uma capa só, até você trocar."],
                  ["programado", "Capa programada", "Troca sozinha conforme o horário."],
                ] as const
              ).map(([id, titulo, ajuda]) => (
                <button
                  key={id}
                  type="button"
                  disabled={salvando}
                  onClick={() => void gravar({ ...prog, modo: id })}
                  className={`rounded-xl border-2 p-3 text-left transition-colors ${
                    prog.modo === id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <p className="text-sm font-bold">{titulo}</p>
                  <p className="text-xs text-muted-foreground">{ajuda}</p>
                </button>
              ))}
            </div>
          </div>

          {prog.modo === "programado" && (
            <>
              {/* Interruptor geral */}
              <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold">Automação</p>
                  <p className="text-xs text-muted-foreground">
                    Desligar volta para a capa fixa na hora, sem apagar as programações.
                  </p>
                </div>
                <Switch
                  checked={prog.automacaoLigada}
                  disabled={salvando}
                  onCheckedChange={(v) => void gravar({ ...prog, automacaoLigada: v })}
                  aria-label="Ligar ou desligar a automação da capa"
                />
              </div>

              {/* Fuso */}
              <div className="space-y-1.5">
                <Label htmlFor="fuso-da-loja">Fuso horário da loja</Label>
                <select
                  id="fuso-da-loja"
                  value={prog.fuso || FUSO_PADRAO}
                  disabled={salvando}
                  onChange={(e) => void gravar({ ...prog, fuso: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm"
                >
                  {FUSOS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  O horário que vale é o da sua loja. O celular do cliente pode estar com a hora
                  errada, e mesmo assim a capa certa aparece.
                </p>
              </div>

              {/* No ar agora */}
              <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
                <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" /> No ar agora
                </p>
                {noAr.periodo ? (
                  <>
                    <p className="mt-1 text-sm font-bold">{noAr.periodo.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {noAr.periodo.inicio} — {noAr.periodo.fim} ·{" "}
                      {resumoDosDias(noAr.periodo.dias)} ·{" "}
                      {noAr.periodo.tipo === "video" ? "Vídeo" : "Imagem"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-sm font-bold">Capa fixa</p>
                    <p className="text-xs text-muted-foreground">{explicar(noAr.motivo)}</p>
                  </>
                )}
                {noAr.url && <Previa tipo={noAr.tipo} url={noAr.url} />}
              </div>

              {/* Linha do dia */}
              {periodos.length > 0 && <LinhaDoDia periodos={periodos} />}

              {/* Lista */}
              <div className="space-y-2">
                {periodos.length === 0 && (
                  <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Nenhum período programado ainda. Enquanto não houver, o cardápio mostra a capa
                    fixa.
                  </p>
                )}

                {periodos.map((p) => {
                  const batendo = conflitosDoCandidato(p, periodos);
                  return (
                    <div
                      key={p.id}
                      className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
                        batendo.length > 0 ? "border-destructive/50 bg-destructive/5" : ""
                      }`}
                    >
                      <Previa tipo={p.tipo} url={p.url} pequena />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold">{p.nome}</p>
                          {!p.ativo && <Badge variant="outline">Inativo</Badge>}
                          {noAr.periodo?.id === p.id && (
                            <Badge className="bg-green-600 hover:bg-green-600">No ar</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {p.inicio} — {p.fim} · {resumoDosDias(p.dias)} ·{" "}
                          {p.tipo === "video" ? "Vídeo" : "Imagem"}
                        </p>
                        {batendo.length > 0 && (
                          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            Horário sobreposto com {batendo.map((x) => x.nome).join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditando({ ...p })}
                          aria-label={`Editar ${p.nome}`}
                          disabled={salvando}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setExcluindo(p)}
                          aria-label={`Excluir ${p.nome}`}
                          disabled={salvando}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={() => setEditando(RASCUNHO_NOVO())}
                disabled={salvando}
              >
                <Plus className="h-4 w-4" /> Adicionar período
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {editando && (
        <EditorDePeriodo
          periodo={editando}
          existentes={periodos}
          salvando={salvando}
          aoFechar={() => setEditando(null)}
          aoConfirmar={(p) => {
            const outros = prog.periodos.filter((x) => x.id !== p.id);
            void gravar({ ...prog, periodos: ordenarPeriodos([...outros, p]) });
            setEditando(null);
          }}
        />
      )}

      <AlertDialog open={!!excluindo} onOpenChange={(v) => !v && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a programação "{excluindo?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. Se esta programação estiver no ar agora, o cardápio
              passa na hora para outra programação válida ou para a capa fixa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const alvo = excluindo;
                setExcluindo(null);
                if (alvo) {
                  void gravar({
                    ...prog,
                    periodos: prog.periodos.filter((x) => x.id !== alvo.id),
                  });
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function explicar(motivo: string): string {
  switch (motivo) {
    case "automacao_desligada":
      return "A automação está desligada. As programações continuam guardadas.";
    case "sem_periodo_no_horario":
      return "Nenhuma programação cobre este horário.";
    case "sem_midia_programada":
      return "Nenhuma programação com mídia e dia definidos.";
    default:
      return "O modo está em capa fixa.";
  }
}

/** Prévia pequena da mídia. Vídeo entra mudo e sem controles, só para conferir. */
function Previa({ tipo, url, pequena }: { tipo: string; url: string; pequena?: boolean }) {
  if (!url) return null;
  const classe = pequena
    ? "h-14 w-20 shrink-0 rounded-lg object-cover"
    : "mt-2 h-28 w-full rounded-lg object-cover";
  return tipo === "video" ? (
    <video src={url} className={classe} muted loop playsInline preload="metadata" />
  ) : (
    <img src={url} alt="" className={classe} loading="lazy" decoding="async" />
  );
}

/**
 * A régua do dia, das 00h às 24h, com cada período no lugar dele.
 *
 * São divs coloridas posicionadas por porcentagem — nenhuma biblioteca de
 * gráfico. Um período que vira a meia-noite aparece como dois pedaços: o fim
 * do dia e o começo, que é como ele realmente acontece.
 */
function LinhaDoDia({ periodos }: { periodos: PeriodoDoHero[] }) {
  const faixas = periodos.flatMap((p) => {
    if (!p.ativo || !p.url) return [];
    const i = minutosDoHorario(p.inicio);
    const f = minutosDoHorario(p.fim);
    if (i === null || f === null) return [];
    const pedacos =
      f >= i
        ? [[i, f + 1]]
        : [
            [i, 1440],
            [0, f + 1],
          ];
    return pedacos.map(([a, b], k) => ({
      chave: `${p.id}-${k}`,
      nome: p.nome,
      esquerda: (a / 1440) * 100,
      largura: ((b - a) / 1440) * 100,
    }));
  });

  return (
    <div className="space-y-1">
      <div className="relative h-7 w-full overflow-hidden rounded-lg bg-muted">
        {faixas.map((f) => (
          <div
            key={f.chave}
            title={f.nome}
            className="absolute inset-y-0 border-r border-background bg-primary/70"
            style={{ left: `${f.esquerda}%`, width: `${f.largura}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        {["00h", "06h", "12h", "18h", "24h"].map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
    </div>
  );
}

function EditorDePeriodo({
  periodo,
  existentes,
  salvando,
  aoFechar,
  aoConfirmar,
}: {
  periodo: PeriodoDoHero;
  existentes: PeriodoDoHero[];
  salvando?: boolean;
  aoFechar: () => void;
  aoConfirmar: (p: PeriodoDoHero) => void;
}) {
  const [p, setP] = useState<PeriodoDoHero>(periodo);

  const batendo = useMemo(() => conflitosDoCandidato(p, existentes), [p, existentes]);
  const horarioOk = minutosDoHorario(p.inicio) !== null && minutosDoHorario(p.fim) !== null;
  const podeSalvar =
    horarioOk && p.dias.length > 0 && p.url.trim().length > 0 && batendo.length === 0;

  const alternarDia = (d: DiaDaSemana) =>
    setP((x) => ({
      ...x,
      dias: x.dias.includes(d)
        ? x.dias.filter((y) => y !== d)
        : [...x.dias, d].sort((a, b) => a - b),
    }));

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{periodo.nome ? "Editar período" : "Novo período"}</DialogTitle>
          <DialogDescription>Escolha quando esta capa deve aparecer no cardápio.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="periodo-nome">Nome do período</Label>
            <Input
              id="periodo-nome"
              value={p.nome}
              placeholder="Café da manhã, Almoço, Happy Hour…"
              maxLength={40}
              onChange={(e) => setP({ ...p, nome: e.target.value })}
              className="text-base sm:text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Só para você se organizar. O cliente não vê este nome.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="periodo-inicio">Começa às</Label>
              <Input
                id="periodo-inicio"
                type="time"
                value={p.inicio}
                onChange={(e) => setP({ ...p, inicio: e.target.value })}
                className="text-base sm:text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="periodo-fim">Termina às</Label>
              <Input
                id="periodo-fim"
                type="time"
                value={p.fim}
                onChange={(e) => setP({ ...p, fim: e.target.value })}
                className="text-base sm:text-sm"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            O horário final entra por inteiro. Terminar às 11:59 e começar o próximo às 12:00 não
            deixa buraco. Pode virar a meia-noite: 22:00 às 03:00 funciona.
          </p>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Dias</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setP({ ...p, dias: p.dias.length === 7 ? [] : [...TODOS_OS_DIAS] })}
              >
                {p.dias.length === 7 ? "Limpar" : "Todos os dias"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TODOS_OS_DIAS.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={p.dias.includes(d)}
                  onClick={() => alternarDia(d)}
                  className={`h-10 min-w-[3rem] rounded-lg border px-2 text-xs font-bold transition-colors ${
                    p.dias.includes(d)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary/40"
                  }`}
                >
                  {NOME_CURTO_DO_DIA[d]}
                </button>
              ))}
            </div>
            {p.dias.length === 0 && (
              <p className="text-xs text-destructive">Escolha ao menos um dia.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de mídia</Label>
            <div className="flex gap-2">
              {(["imagem", "video"] as const).map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={p.tipo === t ? "default" : "outline"}
                  // Trocar o tipo limpa o endereço: uma imagem no lugar de um
                  // vídeo mostraria um quadrado quebrado no cardápio.
                  onClick={() => setP({ ...p, tipo: t, url: "" })}
                >
                  {t === "imagem" ? "Imagem" : "Vídeo"}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Mídia</Label>
            {p.tipo === "video" ? (
              <VideoUpload
                value={p.url || null}
                onChange={(url) => setP({ ...p, url: url ?? "" })}
                folder="hero"
                disabled={salvando}
              />
            ) : (
              <ImageUpload
                value={p.url || null}
                onChange={(url) => setP({ ...p, url: url ?? "" })}
                folder="hero"
                disabled={salvando}
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <div>
              <p className="text-sm font-bold">Ativo</p>
              <p className="text-xs text-muted-foreground">
                Desligado, fica guardado sem entrar no ar.
              </p>
            </div>
            <Switch
              checked={p.ativo}
              onCheckedChange={(v) => setP({ ...p, ativo: v })}
              aria-label="Período ativo"
            />
          </div>

          {batendo.length > 0 && (
            <div className="flex gap-2 rounded-xl border border-destructive/50 bg-destructive/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="text-sm">
                <p className="font-bold text-destructive">
                  Já existe um Hero programado para parte deste horário.
                </p>
                <p className="text-xs text-muted-foreground">
                  Conflita com: {batendo.map((x) => `${x.nome} (${x.inicio}—${x.fim})`).join(", ")}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!podeSalvar || salvando}
            onClick={() =>
              aoConfirmar({
                ...p,
                nome: p.nome.trim() || `${p.inicio} — ${p.fim}`,
                inicio: horarioDosMinutos(minutosDoHorario(p.inicio) ?? 0),
                fim: horarioDosMinutos(minutosDoHorario(p.fim) ?? 0),
              })
            }
          >
            Salvar período
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
