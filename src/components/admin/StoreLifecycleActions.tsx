import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Loader2, PowerOff, Power, Trash2 } from "lucide-react";

interface StoreLifecycleActionsProps {
  pizzeria: {
    id: string;
    name: string;
    status?: string | null;
    owner_name?: string | null;
    owner_email?: string | null;
    plan_type?: string | null;
  };
  onChanged?: () => void;
  variant?: "buttons" | "icons";
}

/** Bearer do admin logado, exigido pelas rotas de ciclo de vida da loja. */
async function authHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

// Usado pelas telas "Usuários" e "FlyPizzarias" — mesmas chamadas, mesmo
// comportamento, para as duas nunca divergirem uma da outra.
export function StoreLifecycleActions({
  pizzeria,
  onChanged,
  variant = "buttons",
}: StoreLifecycleActionsProps) {
  const isActive = (pizzeria.status ?? "active") === "active";
  const [confirmOpen, setConfirmOpen] = useState<"deactivate" | "reactivate" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  async function runAction(action: "deactivate" | "reactivate") {
    setBusy(true);
    try {
      const resp = await fetch(`/api/pizzerias/${pizzeria.id}/${action}`, {
        method: "POST",
        headers: await authHeader(),
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && json?.success) {
        toast.success(
          action === "deactivate"
            ? "Loja descadastrada com sucesso."
            : "Loja reativada com sucesso.",
        );
        if (json.warning) toast.warning(json.warning);
        onChanged?.();
      } else {
        toast.error(
          `Não foi possível concluir a operação. Nenhum dado foi alterado. (${json?.error || resp.status})`,
        );
      }
    } catch (err: any) {
      toast.error(
        `Não foi possível concluir a operação. Nenhum dado foi alterado. (${err?.message || "erro de rede"})`,
      );
    } finally {
      setBusy(false);
      setConfirmOpen(null);
    }
  }

  async function runDelete() {
    setBusy(true);
    try {
      const resp = await fetch(`/api/pizzerias/${pizzeria.id}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ confirmName: deleteConfirmText }),
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && json?.success) {
        toast.success("Loja excluída permanentemente.");
        if (json.warning) toast.warning(json.warning);
        setDeleteOpen(false);
        setDeleteConfirmText("");
        onChanged?.();
      } else if (json?.error === "name_mismatch") {
        toast.error("O nome digitado não confere com o nome da loja.");
      } else {
        toast.error(
          `Não foi possível concluir a operação. Nenhum dado foi alterado. (${json?.error || resp.status})`,
        );
      }
    } catch (err: any) {
      toast.error(
        `Não foi possível concluir a operação. Nenhum dado foi alterado. (${err?.message || "erro de rede"})`,
      );
    } finally {
      setBusy(false);
    }
  }

  const buttonSize = variant === "icons" ? "icon" : "sm";

  return (
    <>
      <div className="flex items-center gap-2">
        {isActive ? (
          <Button
            variant="outline"
            size={buttonSize}
            title="Descadastrar loja"
            onClick={() => setConfirmOpen("deactivate")}
            disabled={busy}
          >
            <PowerOff className="h-4 w-4" />
            {variant === "buttons" && <span className="ml-2">Descadastrar</span>}
          </Button>
        ) : (
          <Button
            variant="outline"
            size={buttonSize}
            title="Reativar loja"
            onClick={() => setConfirmOpen("reactivate")}
            disabled={busy}
          >
            <Power className="h-4 w-4" />
            {variant === "buttons" && <span className="ml-2">Reativar</span>}
          </Button>
        )}
        <Button
          variant="destructive"
          size={buttonSize}
          title="Excluir permanentemente"
          onClick={() => setDeleteOpen(true)}
          disabled={busy}
        >
          <Trash2 className="h-4 w-4" />
          {variant === "buttons" && <span className="ml-2">Excluir</span>}
        </Button>
      </div>

      <AlertDialog
        open={confirmOpen !== null}
        onOpenChange={(open) => !open && setConfirmOpen(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmOpen === "deactivate" ? "Descadastrar FlyPizzaria" : "Reativar loja"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {confirmOpen === "deactivate" ? (
                  <p>
                    Esta ação irá desativar esta loja e impedir seu acesso ao sistema e ao cardápio
                    digital. Os dados serão preservados e a loja poderá ser reativada
                    posteriormente.
                  </p>
                ) : (
                  <p>
                    Deseja reativar esta loja? O acesso ao sistema e às funcionalidades da loja será
                    restaurado.
                  </p>
                )}
                <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
                  <div>
                    <span className="text-muted-foreground">Nome da loja: </span>
                    <span className="font-medium text-foreground">{pizzeria.name}</span>
                  </div>
                  {pizzeria.owner_name && (
                    <div>
                      <span className="text-muted-foreground">Proprietário: </span>
                      <span className="font-medium text-foreground">{pizzeria.owner_name}</span>
                    </div>
                  )}
                  {pizzeria.owner_email && (
                    <div>
                      <span className="text-muted-foreground">E-mail: </span>
                      <span className="font-medium text-foreground">{pizzeria.owner_email}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">ID da loja: </span>
                    <span className="font-mono text-foreground">{pizzeria.id}</span>
                  </div>
                  {pizzeria.plan_type && (
                    <div>
                      <span className="text-muted-foreground">Plano atual: </span>
                      <span className="font-medium text-foreground">{pizzeria.plan_type}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Status atual: </span>
                    <span className="font-medium text-foreground">
                      {isActive ? "Ativa" : "Desativada"}
                    </span>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (confirmOpen) runAction(confirmOpen);
              }}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : confirmOpen === "deactivate" ? (
                "Descadastrar loja"
              ) : (
                "Reativar loja"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteOpen(false);
            setDeleteConfirmText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">EXCLUSÃO PERMANENTE</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Esta operação excluirá permanentemente a loja e os dados relacionados. Esta ação
                  não poderá ser desfeita.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="confirm-delete-name">
                    Digite{" "}
                    <span className="font-mono font-semibold text-foreground">{pizzeria.name}</span>{" "}
                    para confirmar
                  </Label>
                  <Input
                    id="confirm-delete-name"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    autoComplete="off"
                    autoFocus
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || deleteConfirmText.trim() !== pizzeria.name}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                runDelete();
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir permanentemente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
