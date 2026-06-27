import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, KeyRound, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  listWaiters, createWaiter, updateWaiter, deleteWaiter,
} from "@/lib/waiterAuth.functions";

export const Route = createFileRoute("/_app/waiters")({ component: WaitersPage });

type Pizzeria = { id: string; name: string };
type Waiter = {
  id: string; full_name: string; phone: string | null;
  username: string; is_active: boolean;
  last_login_at: string | null; created_at: string;
};

function WaitersPage() {
  const { user, isSuperAdmin } = useAuth();
  const list = useServerFn(listWaiters);
  const create = useServerFn(createWaiter);
  const update = useServerFn(updateWaiter);
  const remove = useServerFn(deleteWaiter);

  const [pizzerias, setPizzerias] = useState<Pizzeria[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [loading, setLoading] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [openReset, setOpenReset] = useState<Waiter | null>(null);

  useEffect(() => {
    async function loadStores() {
      if (!user) return;
      let q = supabase.from("pizzerias").select("id, name").order("name");
      if (!isSuperAdmin) q = q.eq("owner_id", user.id);
      const { data } = await q;
      const items = (data || []) as Pizzeria[];
      setPizzerias(items);
      if (items.length && !tenantId) setTenantId(items[0].id);
    }
    loadStores();
    // eslint-disable-next-line
  }, [user, isSuperAdmin]);

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const rows = await list({ data: { tenantId } });
      setWaiters(rows as Waiter[]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { if (tenantId) load(); /* eslint-disable-next-line */ }, [tenantId]);

  async function handleToggleActive(w: Waiter, val: boolean) {
    try {
      await update({ data: { waiterId: w.id, isActive: val } });
      setWaiters((prev) => prev.map((x) => (x.id === w.id ? { ...x, is_active: val } : x)));
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleDelete(w: Waiter) {
    if (!confirm(`Excluir o garçom ${w.full_name}? Esta ação não pode ser desfeita.`)) return;
    try {
      await remove({ data: { waiterId: w.id } });
      setWaiters((prev) => prev.filter((x) => x.id !== w.id));
      toast.success("Garçom excluído");
    } catch (e: any) { toast.error(e.message); }
  }

  const selectedStoreName = useMemo(
    () => pizzerias.find((p) => p.id === tenantId)?.name || "",
    [pizzerias, tenantId],
  );

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" /> Garçons
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastre garçons com acesso limitado para atender mesas e lançar pedidos.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)} disabled={!tenantId}>
          <Plus className="h-4 w-4 mr-2" /> Novo Garçom
        </Button>
      </div>

      {pizzerias.length > 1 && (
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Label className="shrink-0">Loja:</Label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {pizzerias.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Garçons cadastrados {selectedStoreName && <span className="text-muted-foreground font-normal">— {selectedStoreName}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead className="text-center">Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                </TableCell></TableRow>
              ) : waiters.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum garçom cadastrado.
                </TableCell></TableRow>
              ) : waiters.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.full_name}</TableCell>
                  <TableCell><Badge variant="outline">{w.username}</Badge></TableCell>
                  <TableCell>{w.phone || "—"}</TableCell>
                  <TableCell>{w.last_login_at ? new Date(w.last_login_at).toLocaleString("pt-BR") : "Nunca"}</TableCell>
                  <TableCell className="text-center">
                    <Switch checked={w.is_active} onCheckedChange={(v) => handleToggleActive(w, v)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setOpenReset(w)}>
                      <KeyRound className="h-4 w-4 mr-1" /> Senha
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(w)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="pt-6 text-sm text-muted-foreground space-y-1">
          <p><b>Permissões do garçom:</b> abrir mesas, lançar pedidos, ver comandas abertas, solicitar fechamento, registrar pagamento.</p>
          <p><b>Restrições:</b> não edita cardápio, não acessa configurações, financeiro global ou cadastro de usuários.</p>
          <p>Os garçons acessam o sistema em <code className="bg-background px-1.5 py-0.5 rounded">/waiter-login</code>.</p>
        </CardContent>
      </Card>

      <CreateWaiterDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        tenantId={tenantId}
        onCreated={(w) => setWaiters((prev) => [w, ...prev])}
        createFn={create}
      />
      <ResetPasswordDialog
        waiter={openReset}
        onOpenChange={(o) => !o && setOpenReset(null)}
        updateFn={update}
      />
    </div>
  );
}

function CreateWaiterDialog({
  open, onOpenChange, tenantId, onCreated, createFn,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; tenantId: string;
  onCreated: (w: Waiter) => void;
  createFn: ReturnType<typeof useServerFn<typeof createWaiter>>;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setFullName(""); setPhone(""); setUsername(""); setPassword(""); }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const w = await createFn({ data: { tenantId, fullName, phone, username, password } });
      onCreated(w as Waiter);
      toast.success(`Garçom ${fullName} cadastrado`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo Garçom</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome Completo *</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Telefone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Usuário *</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ex: joao" required />
            </div>
            <div className="space-y-1.5">
              <Label>Senha *</Label>
              <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Cadastrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  waiter, onOpenChange, updateFn,
}: {
  waiter: Waiter | null;
  onOpenChange: (o: boolean) => void;
  updateFn: ReturnType<typeof useServerFn<typeof updateWaiter>>;
}) {
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setPwd(""); }, [waiter]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!waiter) return;
    setSaving(true);
    try {
      await updateFn({ data: { waiterId: waiter.id, newPassword: pwd } });
      toast.success("Senha redefinida");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!waiter} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Redefinir senha — {waiter?.full_name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nova senha</Label>
            <Input value={pwd} onChange={(e) => setPwd(e.target.value)} required minLength={4} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
