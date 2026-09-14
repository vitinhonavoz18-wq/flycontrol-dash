import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Pencil, Plus, Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { useLojaDoEstoque } from "@/lib/inventory/loja-context";
import {
  arquivarFornecedor,
  listarFornecedores,
  salvarFornecedor,
  type Fornecedor,
} from "@/lib/inventory/inventory.functions";

export const Route = createFileRoute("/_app/inventory/suppliers")({ component: Fornecedores });

/**
 * A agenda de quem abastece a loja.
 *
 * Serve para dois momentos: registrar de quem veio cada entrada de mercadoria
 * e ter o telefone à mão na hora de repor o que está acabando.
 *
 * Fornecedor não é apagado, é arquivado: as entradas antigas apontam para ele,
 * e sumir com o cadastro deixaria o histórico de compras sem dizer de quem
 * veio a mercadoria.
 */
function Fornecedores() {
  const { tenantId } = useLojaDoEstoque();

  const buscar = useServerFn(listarFornecedores);
  const salvar = useServerFn(salvarFornecedor);
  const arquivar = useServerFn(arquivarFornecedor);

  const [lista, setLista] = useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [mostrarArquivados, setMostrarArquivados] = useState(false);

  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Fornecedor | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    name: "",
    tradeName: "",
    taxId: "",
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    notes: "",
  });

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    setCarregando(true);
    try {
      setLista(await buscar({ data: { tenantId, incluirInativos: true } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar os fornecedores.");
    } finally {
      setCarregando(false);
    }
  }, [buscar, tenantId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrirNovo() {
    setEditando(null);
    setForm({
      name: "",
      tradeName: "",
      taxId: "",
      phone: "",
      whatsapp: "",
      email: "",
      address: "",
      notes: "",
    });
    setAberto(true);
  }

  function abrirEdicao(f: Fornecedor) {
    setEditando(f);
    setForm({
      name: f.name,
      tradeName: f.trade_name ?? "",
      taxId: f.tax_id ?? "",
      phone: f.phone ?? "",
      whatsapp: f.whatsapp ?? "",
      email: f.email ?? "",
      address: f.address ?? "",
      notes: f.notes ?? "",
    });
    setAberto(true);
  }

  async function gravar() {
    if (!tenantId) return;
    if (!form.name.trim()) {
      toast.error("O fornecedor precisa de um nome.");
      return;
    }
    setSalvando(true);
    try {
      await salvar({ data: { tenantId, id: editando?.id, ...form } });
      toast.success(editando ? "Fornecedor atualizado." : "Fornecedor cadastrado.");
      setAberto(false);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarArquivo(f: Fornecedor) {
    if (!tenantId) return;
    try {
      await arquivar({ data: { tenantId, id: f.id, ativo: !f.active } });
      toast.success(f.active ? `${f.name} foi arquivado.` : `${f.name} voltou para a lista.`);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível arquivar.");
    }
  }

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lista
      .filter((f) => (mostrarArquivados ? true : f.active))
      .filter(
        (f) =>
          !termo ||
          f.name.toLowerCase().includes(termo) ||
          (f.trade_name ?? "").toLowerCase().includes(termo) ||
          (f.phone ?? "").includes(termo) ||
          (f.whatsapp ?? "").includes(termo),
      );
  }, [busca, lista, mostrarArquivados]);

  if (carregando) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={mostrarArquivados} onCheckedChange={setMostrarArquivados} />
          Mostrar arquivados
        </label>
        <Button onClick={abrirNovo}>
          <Plus className="mr-2 h-4 w-4" />
          Novo fornecedor
        </Button>
      </div>

      {filtrados.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Truck className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nenhum fornecedor por aqui</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Cadastre quem abastece a loja para registrar de quem veio cada entrada e ter o contato
              à mão quando algo estiver acabando.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((f) => (
            <Card key={f.id} className={f.active ? "" : "opacity-60"}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{f.name}</p>
                    {f.trade_name && (
                      <p className="truncate text-xs text-muted-foreground">{f.trade_name}</p>
                    )}
                  </div>
                  {!f.active && (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">
                      arquivado
                    </span>
                  )}
                </div>

                <div className="space-y-0.5 text-sm text-muted-foreground">
                  {f.whatsapp && <p>WhatsApp: {f.whatsapp}</p>}
                  {f.phone && <p>Telefone: {f.phone}</p>}
                  {f.tax_id && <p>CNPJ: {f.tax_id}</p>}
                </div>

                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => abrirEdicao(f)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void alternarArquivo(f)}>
                    {f.active ? (
                      <>
                        <Archive className="mr-1.5 h-3.5 w-3.5" />
                        Arquivar
                      </>
                    ) : (
                      <>
                        <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
                        Reativar
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editando ? "Editar fornecedor" : "Novo fornecedor"}</SheetTitle>
          </SheetHeader>

          <div className="space-y-3 py-4">
            {(
              [
                ["name", "Nome *", "Distribuidora Central"],
                ["tradeName", "Razão social", "Central Distribuição LTDA"],
                ["taxId", "CNPJ", "00.000.000/0001-00"],
                ["whatsapp", "WhatsApp", "(11) 90000-0000"],
                ["phone", "Telefone", "(11) 3000-0000"],
                ["email", "E-mail", "contato@fornecedor.com.br"],
                ["address", "Endereço", "Rua das Entregas, 100"],
                ["notes", "Observações", "Entrega às terças e quintas"],
              ] as const
            ).map(([campo, rotulo, exemplo]) => (
              <div key={campo} className="space-y-1.5">
                <Label htmlFor={`f-${campo}`}>{rotulo}</Label>
                <Input
                  id={`f-${campo}`}
                  value={form[campo]}
                  onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))}
                  placeholder={exemplo}
                />
              </div>
            ))}
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void gravar()} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
