import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type RestaurantTable = {
  id: string;
  tenant_id: string;
  table_number: string;
  table_name: string | null;
  public_token: string;
  qr_code_url: string | null;
  is_active: boolean;
  created_at: string;
  default_waiter_id: string | null;
  default_waiter_name?: string | null;
};

export type TableSession = {
  id: string;
  tenant_id: string;
  table_id: string;
  table_number: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  total_amount: number;
  subtotal_amount: number;
  service_fee_enabled: boolean;
  service_fee_percent: number;
  service_fee_amount: number;
  customer_name: string | null;
  table_name: string | null;
  waiter_id: string | null;
  waiter_name: string | null;
  order_count?: number;
};


export function useTables(tenantId: string | null) {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(false);

  function mapRow(r: any): RestaurantTable {
    return { ...r, default_waiter_name: r.default_waiter?.full_name ?? null };
  }

  async function loadTables() {
    if (!tenantId) return;
    setLoading(true);
    const selectStr = "*, default_waiter:waiters!restaurant_tables_default_waiter_id_fkey(id, full_name)";
    const { data, error } = await supabase
      .from("restaurant_tables")
      .select(selectStr)
      .eq("tenant_id", tenantId)
      .order("table_number");

    if (error) {
      toast.error("Erro ao carregar mesas: " + error.message);
      setLoading(false);
      return;
    }

    if (data.length === 0) {
      const { error: rpcError } = await supabase.rpc('generate_default_restaurant_tables', {
        p_restaurant_id: tenantId
      });

      if (rpcError) {
        console.error("Error generating default tables:", rpcError);
        setTables([]);
      } else {
        const { data: newData, error: newError } = await supabase
          .from("restaurant_tables")
          .select(selectStr)
          .eq("tenant_id", tenantId)
          .order("table_number");

        if (!newError && newData) {
          setTables((newData as any[]).map(mapRow));
        }
      }
    } else {
      setTables((data as any[]).map(mapRow));
    }
    setLoading(false);
  }

  async function addTable(tableNumber: string, tableName?: string) {
    if (!tenantId) return;
    
    // Auto-generate a secure public token (the trigger will also handle this, but it's good practice)
    const publicToken = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    
    const { data, error } = await supabase
      .from("restaurant_tables")
      .insert({
        tenant_id: tenantId,
        restaurant_id: tenantId,
        table_number: tableNumber,
        table_name: tableName || `Mesa ${tableNumber}`,
        public_token: publicToken,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      toast.error("Erro ao adicionar mesa: " + error.message);
      return null;
    }
    
    const newTable = data as RestaurantTable;
    setTables(prev => [...prev, newTable].sort((a, b) => a.table_number.localeCompare(b.table_number, undefined, { numeric: true })));
    return newTable;
  }

  async function updateTable(id: string, updates: Partial<RestaurantTable>) {
    const { default_waiter_name: _drop, ...clean } = updates as any;
    const { error } = await supabase
      .from("restaurant_tables")
      .update(clean)
      .eq("id", id);

    if (error) {
      toast.error("Erro ao atualizar mesa: " + error.message);
      return false;
    }
    
    // Reload to get the updated qr_code_url from trigger if it changed
    await loadTables();
    toast.success("Mesa atualizada com sucesso!");
    return true;
  }

  async function toggleTable(id: string, isActive: boolean) {
    const { error } = await supabase
      .from("restaurant_tables")
      .update({ is_active: isActive })
      .eq("id", id);

    if (error) {
      toast.error("Erro ao atualizar mesa: " + error.message);
    } else {
      setTables(prev => prev.map(t => t.id === id ? { ...t, is_active: isActive } : t));
    }
  }

  async function deleteTable(id: string) {
    const { error } = await supabase
      .from("restaurant_tables")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erro ao excluir mesa: " + error.message);
    } else {
      setTables(prev => prev.filter(t => t.id !== id));
      toast.success("Mesa excluída com sucesso!");
    }
  }

  useEffect(() => {
    if (tenantId) {
      loadTables();
    }
  }, [tenantId]);

  return { tables, loading, loadTables, addTable, updateTable, toggleTable, deleteTable };
}

export function useTableSessions(tenantId: string | null) {
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadSessions() {
    if (!tenantId) return;
    setLoading(true);
    
    // Using restaurant_id as confirmed by database schema
    const { data, error } = await supabase
      .from("table_sessions")
      .select(`
        *,
        table_session_orders(count),
        waiter:waiters(id, full_name)
      `)
      .eq("restaurant_id", tenantId)
      .eq("status", "open")
      .order("opened_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar sessões: " + error.message);
    } else {
      const mappedData = (data as any[]).map(s => ({
        id: s.id,
        tenant_id: s.restaurant_id,
        table_id: s.table_id,
        table_number: s.table_number,
        status: s.status,
        opened_at: s.opened_at,
        closed_at: s.closed_at,
        total_amount: Number(s.total_amount || 0),
        subtotal_amount: Number(s.subtotal_amount || 0),
        service_fee_enabled: s.service_fee_enabled,
        service_fee_percent: Number(s.service_fee_percent || 10),
        service_fee_amount: Number(s.service_fee_amount || 0),
        customer_name: s.customer_name,
        table_name: s.table_name,
        waiter_id: s.waiter_id ?? null,
        waiter_name: s.waiter?.full_name ?? null,
        order_count: s.table_session_orders?.[0]?.count || 0
      })) as TableSession[];
      setSessions(mappedData);
    }
    setLoading(false);
  }

  async function closeSession(sessionId: string) {
    const session = sessions.find((s) => s.id === sessionId);
    const { closeTableWorkflow } = await import("@/lib/closeTableWorkflow");
    const res = await closeTableWorkflow({
      sessionId,
      tableNumber: session?.table_number,
      restaurantId: session?.tenant_id,
    });
    if (!res.sessionClosed) {
      toast.error("Erro ao fechar mesa: " + (res.error || "desconhecido"));
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    toast.success("Mesa fechada com sucesso!");
  }

  useEffect(() => {
    if (tenantId) loadSessions();
  }, [tenantId]);

  async function toggleServiceFee(sessionId: string, enabled: boolean) {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    // Se ativando, use a taxa configurada na pizzaria (fonte da verdade).
    // Se a sessão já foi calculada com outra taxa, mantém sua própria.
    let percent = Number(session.service_fee_percent) || 10;
    if (enabled && tenantId) {
      const { data: p } = await supabase
        .from("pizzerias")
        .select("service_fee_percent")
        .eq("id", tenantId)
        .maybeSingle();
      if (p && p.service_fee_percent != null) {
        percent = Number(p.service_fee_percent);
      }
    }

    const subtotal = Number(session.subtotal_amount) || 0;
    const feeAmount = enabled ? subtotal * (percent / 100) : 0;
    const total = subtotal + feeAmount;

    const { error } = await supabase
      .from("table_sessions")
      .update({
        service_fee_enabled: enabled,
        service_fee_percent: percent,
        service_fee_amount: feeAmount,
        total_amount: total,
      })
      .eq("id", sessionId);

    if (error) {
      toast.error("Erro ao atualizar taxa de serviço: " + error.message);
    } else {
      setSessions(prev => prev.map(s => s.id === sessionId ? {
        ...s,
        service_fee_enabled: enabled,
        service_fee_percent: percent,
        service_fee_amount: feeAmount,
        total_amount: total,
      } : s));
      toast.success(enabled ? `Taxa de ${percent}% adicionada!` : "Taxa de serviço removida.");
    }
  }


  async function assignWaiter(sessionId: string, waiterId: string | null) {
    const { error } = await supabase
      .from("table_sessions")
      .update({ waiter_id: waiterId })
      .eq("id", sessionId);

    if (error) {
      toast.error("Erro ao atribuir garçom: " + error.message);
      return false;
    }
    await loadSessions();
    toast.success(waiterId ? "Garçom atribuído à mesa!" : "Garçom removido da mesa.");
    return true;
  }

  return { sessions, loading, loadSessions, closeSession, toggleServiceFee, assignWaiter };
}
