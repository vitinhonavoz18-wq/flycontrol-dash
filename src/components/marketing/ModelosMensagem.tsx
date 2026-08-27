import { useCallback, useEffect, useState } from "react";
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
import { Loader2, Plus, Pencil, Trash2, Copy, FileText } from "lucide-react";
import { toast } from "sonner";
import { listarModelos, salvarModelo, excluirModelo } from "@/lib/marketing/marketing.functions";
import { VARIAVEIS, DESCRICAO_VARIAVEIS, type Variavel } from "@/lib/marketing/templateVars";

/**
 * Modelos de mensagem.
 *
 * Serve para guardar o texto que funcionou. Quem já escreveu uma promoção que
 * trouxe gente de volta não quer reescrevê-la do zero no mês seguinte — quer
 * a mesma, com a data trocada.
 *
 * Os modelos são de cada estabelecimento. Um restaurante nunca vê o texto do
 * outro, nem por engano.
 */

const CATEGORIAS = [
  { valor: "promocao", rotulo: "Promoção" },
  { valor: "cupom", rotulo: "Cupom" },
  { valor: "novidade", rotulo: "Novidade" },
  { valor: "retorno", rotulo: "Trazer de volta" },
  { valor: "agradecimento", rotulo: "Agradecimento" },
];

type Modelo = {
  id: string;
  title: string;
  category: string;
  body: string;
  updated_at: string;
};

export function ModelosMensagem({ tenantId }: { tenantId: string }) {
  const buscar = useServerFn(listarModelos);
  const salvar = useServerFn(salvarModelo);
  const excluir = useServerFn(excluirModelo);

  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<Modelo | "novo" | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState("promocao");
  const [corpo, setCorpo] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await buscar({ data: { tenantId } });
      setModelos(r.modelos as Modelo[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui carregar os modelos");
    } finally {
      setCarregando(false);
    }
  }, [buscar, tenantId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrirNovo() {
    setTitulo("");
    setCategoria("promocao");
    setCorpo("");
    setEditando("novo");
  }

  function abrirEdicao(m: Modelo) {
    setTitulo(m.title);
    setCategoria(m.category);
    setCorpo(m.body);
    setEditando(m);
  }

  function duplicar(m: Modelo) {
    setTitulo(`${m.title} (cópia)`);
    setCategoria(m.category);
    setCorpo(m.body);
    setEditando("novo");
  }

  async function gravar() {
    setSalvando(true);
    try {
      await salvar({
        data: {
          tenantId,
          templateId: editando !== "novo" && editando ? editando.id : undefined,
          titulo,
          categoria,
          mensagem: corpo,
        },
      });
      toast.success("Modelo guardado");
      setEditando(null);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui guardar");
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(m: Modelo) {
    if (!window.confirm(`Apagar o modelo "${m.title}"?`)) return;
    try {
      await excluir({ data: { tenantId, templateId: m.id } });
      toast.success("Modelo apagado");
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui apagar");
    }
  }

  if (editando) {
    return (
      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <h3 className="font-semibold">{editando === "novo" ? "Novo modelo" : "Editar modelo"}</h3>

          <div className="space-y-2">
            <Label htmlFor="titulo">Nome do modelo</Label>
            <Input
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Promoção de terça"
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => (
                  <SelectItem key={c.valor} value={c.valor}>
                    {c.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="corpo">Mensagem</Label>
            <textarea
              id="corpo"
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              rows={8}
              maxLength={4000}
              className="w-full resize-none rounded-md border bg-background p-3 text-sm"
              placeholder={"Oi {{primeiro_nome}}! Hoje tem…"}
            />
            <div className="flex flex-wrap gap-1.5">
              {VARIAVEIS.map((v: Variavel) => (
                <button
                  key={v}
                  type="button"
                  title={DESCRICAO_VARIAVEIS[v]}
                  onClick={() => setCorpo((c) => `${c}{{${v}}}`)}
                  className="rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between border-t pt-4">
            <Button variant="ghost" onClick={() => setEditando(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={gravar} disabled={salvando || !titulo.trim() || !corpo.trim()}>
              {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={abrirNovo}>
          <Plus className="mr-1 h-4 w-4" />
          Novo modelo
        </Button>
      </div>

      {carregando && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!carregando && modelos.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-4 font-semibold">Nenhum modelo guardado</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Quando uma mensagem der resultado, guarde aqui. No mês seguinte é só trocar a data em
              vez de escrever tudo de novo.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {modelos.map((m) => (
          <Card key={m.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{m.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {CATEGORIAS.find((c) => c.valor === m.category)?.rotulo ?? m.category}
                  </p>
                </div>
                <div className="flex flex-shrink-0 gap-1">
                  <Button size="icon" variant="ghost" onClick={() => abrirEdicao(m)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => duplicar(m)} title="Duplicar">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => apagar(m)} title="Apagar">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
                {m.body}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
