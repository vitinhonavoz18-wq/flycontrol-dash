import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowLeft, ArrowRight, Send, Users } from "lucide-react";
import { toast } from "sonner";
import {
  contarPublico,
  salvarCampanha,
  dispararCampanha,
} from "@/lib/marketing/marketing.functions";
import type { FiltroSegmento } from "@/lib/marketing/segments";
import {
  VARIAVEIS,
  DESCRICAO_VARIAVEIS,
  renderizarMensagem,
  variaveisDesconhecidas,
  type Variavel,
} from "@/lib/marketing/templateVars";
import { PreviaWhatsApp } from "./PreviaWhatsApp";

/**
 * O assistente de campanha, em três passos.
 *
 * Três passos e não um formulário só, por um motivo prático: cada passo tem
 * uma decisão diferente e um erro diferente. Quem erra o público não erra a
 * mensagem. Separar deixa o erro perto de onde ele acontece.
 *
 * O contador de público aparece já no passo 2, antes de escrever qualquer
 * coisa. Descobrir que o público é de 3 pessoas depois de ter escrito a
 * mensagem inteira é o tipo de coisa que faz alguém desistir do sistema.
 */

const TIPOS = [
  { valor: "promocao", rotulo: "Promoção" },
  { valor: "cupom", rotulo: "Cupom de desconto" },
  { valor: "novidade", rotulo: "Novidade no cardápio" },
  { valor: "frete_gratis", rotulo: "Frete grátis" },
  { valor: "cliente_inativo", rotulo: "Trazer cliente de volta" },
  { valor: "personalizada", rotulo: "Mensagem personalizada" },
];

const PUBLICOS: Array<{ id: string; rotulo: string; explicacao: string; filtro: FiltroSegmento }> =
  [
    {
      id: "todos",
      rotulo: "Todos que aceitam ofertas",
      explicacao: "Toda a sua base autorizada.",
      filtro: { tipo: "todos" },
    },
    {
      id: "sumidos15",
      rotulo: "Sumidos há 15 dias",
      explicacao: "Quem costumava pedir e parou faz pouco tempo.",
      filtro: { tipo: "inativos", dias: 15 },
    },
    {
      id: "sumidos30",
      rotulo: "Sumidos há 30 dias",
      explicacao: "O público clássico de campanha de retorno.",
      filtro: { tipo: "inativos", dias: 30 },
    },
    {
      id: "sumidos60",
      rotulo: "Sumidos há 60 dias",
      explicacao: "Faz tempo. Costuma precisar de um empurrão maior.",
      filtro: { tipo: "inativos", dias: 60 },
    },
    {
      id: "fieis",
      rotulo: "Clientes fiéis (5+ pedidos)",
      explicacao: "Quem já pediu bastante. Bom para novidade e agradecimento.",
      filtro: { tipo: "quantidade_pedidos", min: 5 },
    },
    {
      id: "gastam",
      rotulo: "Já gastaram mais de R$ 300",
      explicacao: "Os que mais deixam dinheiro na sua loja.",
      filtro: { tipo: "valor_gasto", minReais: 300 },
    },
    {
      id: "ativos30",
      rotulo: "Compraram nos últimos 30 dias",
      explicacao: "Quem está por perto agora.",
      filtro: { tipo: "ativos", dias: 30 },
    },
  ];

type Props = {
  tenantId: string;
  nomeRestaurante: string;
  aoFechar: () => void;
  aoConcluir: () => void;
};

export function AssistenteCampanha({ tenantId, nomeRestaurante, aoFechar, aoConcluir }: Props) {
  const contar = useServerFn(contarPublico);
  const salvar = useServerFn(salvarCampanha);
  const disparar = useServerFn(dispararCampanha);

  const [passo, setPasso] = useState(1);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("promocao");
  const [publicoId, setPublicoId] = useState("sumidos30");
  const [mensagem, setMensagem] = useState("");
  const [cupom, setCupom] = useState("");
  const [contagem, setContagem] = useState<number | null>(null);
  const [contando, setContando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const publico = useMemo(
    () => PUBLICOS.find((p) => p.id === publicoId) ?? PUBLICOS[0],
    [publicoId],
  );

  const atualizarContagem = useCallback(async () => {
    setContando(true);
    try {
      const r = await contar({ data: { tenantId, filtro: publico.filtro } });
      setContagem(r.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui contar o público");
      setContagem(null);
    } finally {
      setContando(false);
    }
  }, [contar, tenantId, publico]);

  useEffect(() => {
    if (passo >= 2) void atualizarContagem();
  }, [passo, atualizarContagem]);

  const erradas = variaveisDesconhecidas(mensagem);

  const previa = renderizarMensagem(mensagem, {
    nome: "Ana Paula Ribeiro",
    primeiro_nome: "Ana",
    nome_estabelecimento: nomeRestaurante,
    cupom: cupom || undefined,
    desconto: cupom ? "15%" : undefined,
    link_cardapio: "https://seusite.com.br",
    ultimo_pedido: "há 32 dias",
  });

  function inserirVariavel(v: Variavel) {
    setMensagem((m) => `${m}{{${v}}}`);
  }

  async function confirmar() {
    if (enviando) return;
    setEnviando(true);
    try {
      const { campaignId } = await salvar({
        data: {
          tenantId,
          nome,
          tipo,
          mensagem,
          filtro: publico.filtro,
          cupom: cupom || null,
        },
      });
      const r = await disparar({ data: { tenantId, campaignId } });
      if (r.jaDisparada) {
        toast.info("Esta campanha já tinha sido disparada.");
      } else {
        toast.success(`Campanha na fila: ${r.total} mensagem(ns) para sair.`);
      }
      aoConcluir();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui disparar a campanha");
    } finally {
      setEnviando(false);
    }
  }

  const podeAvancar =
    (passo === 1 && nome.trim().length > 0) ||
    (passo === 2 && (contagem ?? 0) > 0) ||
    (passo === 3 && mensagem.trim().length > 0 && erradas.length === 0);

  return (
    <Card>
      <CardContent className="space-y-6 p-5 md:p-6">
        <Passos atual={passo} />

        {passo === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome-campanha">Nome da campanha</Label>
              <Input
                id="nome-campanha"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Volta aí, novembro"
                maxLength={120}
              />
              <p className="text-xs text-muted-foreground">
                É só para você se achar depois no histórico. O cliente não vê este nome.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.valor} value={t.valor}>
                      {t.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {passo === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Quem vai receber</Label>
              <Select value={publicoId} onValueChange={setPublicoId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PUBLICOS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{publico.explicacao}</p>
            </div>

            <div className="rounded-xl border bg-muted/40 p-5 text-center">
              <div className="flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Users className="h-4 w-4" />
                Público estimado
              </div>
              {contando ? (
                <Loader2 className="mx-auto mt-3 h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <p className="mt-2 text-4xl font-bold text-primary">
                  {(contagem ?? 0).toLocaleString("pt-BR")}
                </p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                {contagem === 1 ? "cliente" : "clientes"}
              </p>

              {!contando && contagem === 0 && (
                <p className="mx-auto mt-3 max-w-sm text-sm text-amber-600 dark:text-amber-500">
                  Ninguém se encaixa. Lembre que só entram os clientes que marcaram, no site, que
                  querem receber ofertas — mesmo que você tenha muita gente cadastrada.
                </p>
              )}
            </div>
          </div>
        )}

        {passo === 3 && (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mensagem">Mensagem</Label>
                <textarea
                  id="mensagem"
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  rows={8}
                  maxLength={4000}
                  placeholder={"Oi {{primeiro_nome}}! Faz tempo que você não pede com a gente…"}
                  className="w-full resize-none rounded-md border bg-background p-3 text-sm"
                />
                <p className="text-xs text-muted-foreground">{mensagem.length}/4000 caracteres</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Clique para inserir
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {VARIAVEIS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => inserirVariavel(v)}
                      title={DESCRICAO_VARIAVEIS[v]}
                      className="rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted"
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Cada cliente recebe com o nome dele no lugar. Se algum não tiver o dado, o texto
                  se ajusta sozinho em vez de sair com um buraco.
                </p>
              </div>

              {tipo === "cupom" && (
                <div className="space-y-2">
                  <Label htmlFor="cupom">Código do cupom</Label>
                  <Input
                    id="cupom"
                    value={cupom}
                    onChange={(e) => setCupom(e.target.value.toUpperCase())}
                    placeholder="VOLTE15"
                    maxLength={30}
                  />
                  <p className="text-xs text-amber-600 dark:text-amber-500">
                    Atenção: hoje o código só viaja escrito na mensagem. O site de pedidos ainda não
                    valida cupom no fechamento — combine o desconto por fora até isso existir.
                  </p>
                </div>
              )}

              {erradas.length > 0 && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  Estas variáveis não existem: {erradas.map((v) => `{{${v}}}`).join(", ")}. Confira
                  a escrita.
                </p>
              )}
            </div>

            <div className="lg:sticky lg:top-4 lg:self-start">
              <PreviaWhatsApp nomeRestaurante={nomeRestaurante} mensagem={previa} />
            </div>
          </div>
        )}

        {passo === 4 && (
          <div className="space-y-4">
            <div className="rounded-xl border p-4">
              <h3 className="font-semibold">Confira antes de disparar</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Linha rotulo="Campanha" valor={nome} />
                <Linha rotulo="Público" valor={publico.rotulo} />
                <Linha
                  rotulo="Vai para"
                  valor={`${(contagem ?? 0).toLocaleString("pt-BR")} cliente(s)`}
                />
                {cupom && <Linha rotulo="Cupom" valor={cupom} />}
              </dl>
            </div>

            <PreviaWhatsApp nomeRestaurante={nomeRestaurante} mensagem={previa} />

            <p className="text-center text-sm text-muted-foreground">
              Depois de disparar, a lista de quem recebe fica congelada. Você pode pausar ou
              cancelar o que ainda não saiu — o que já foi entregue não volta atrás.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <Button
            variant="ghost"
            onClick={() => (passo === 1 ? aoFechar() : setPasso((p) => p - 1))}
            disabled={enviando}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            {passo === 1 ? "Cancelar" : "Voltar"}
          </Button>

          {passo < 4 ? (
            <Button onClick={() => setPasso((p) => p + 1)} disabled={!podeAvancar}>
              Continuar
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={confirmar} disabled={enviando}>
              {enviando ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1 h-4 w-4" />
              )}
              Disparar para {(contagem ?? 0).toLocaleString("pt-BR")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Passos({ atual }: { atual: number }) {
  const nomes = ["Campanha", "Público", "Mensagem", "Conferir"];
  return (
    <ol className="flex items-center gap-2 text-xs">
      {nomes.map((n, i) => {
        const numero = i + 1;
        const feito = numero < atual;
        const agora = numero === atual;
        return (
          <li key={n} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                agora
                  ? "bg-primary text-primary-foreground"
                  : feito
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {numero}
            </span>
            <span
              className={`hidden truncate sm:inline ${agora ? "font-semibold" : "text-muted-foreground"}`}
            >
              {n}
            </span>
            {numero < nomes.length && <span className="h-px flex-1 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right font-medium">{valor}</dd>
    </div>
  );
}
