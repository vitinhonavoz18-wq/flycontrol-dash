import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type RestaurantTable = {
  id: string;
  tenant_id: string;
  table_number: string;
  table_name: string | null;
  public_token: string;
  is_active: boolean;
  created_at: string;
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
};

export function useTables(tenantId: string | null) {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadTables() {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("restaurant_tables")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("table_number");

    if (error) {
      toast.error("Erro ao carregar mesas: " + error.message);
    } else {
      setTables(data as RestaurantTable[]);
    }
    setLoading(false);
  }

  async function addTable(tableNumber: string, tableName?: string) {
    if (!tenantId) return;
    const { data, error } = await supabase
      .from("restaurant_tables")
      .insert({
        tenant_id: tenantId,
        table_number: tableNumber,
        table_name: tableName || null,
      })
      .select()
      .single();

    if (error) {
      toast.error("Erro ao adicionar mesa: " + error.message);
      return null;
    }
    setTables(prev => [...prev, data as RestaurantTable].sort((a, b) => a.table_number.localeCompare(b.table_number, undefined, { numeric: true })));
    return data as RestaurantTable;
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
    }
  }

  useEffect(() => {
    if (tenantId) loadTables();
  }, [tenantId]);

  return { tables, loading, loadTables, addTable, toggleTable, deleteTable };
}

export function useTableSessions(tenantId: string | null) {
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadSessions() {
    if (!tenantId) return;
    setLoading(true);
    // Note: The database schema might use restaurant_id instead of tenant_id for table_sessions
    // based on previous migration attempts and existing tables.
    const { data, error } = await supabase
      .from("table_sessions")
      .select("*")
      .or(`tenant_id.eq.${tenantId},restaurant_id.eq.${tenantId}`)
      .eq("status", "open")
      .order("opened_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar sessões: " + error.message);
    } else {
      // Map potential database field names to our type
      const mappedData = (data as any[]).map(s => ({
        id: s.id,
        tenant_id: s.tenant_id || s.restaurant_id,
        table_id: s.table_id,
        table_number: s.table_number,
        status: s.status,
        opened_at: s.opened_at,
        closed_at: s.closed_at,
        total_amount: Number(s.total_amount || 0)
      })) as TableSession[];
      setSessions(mappedData);
    }
    setLoading(false);
  }

  async function closeSession(sessionId: string) {
    const { error } = await supabase
      .from("table_sessions")
      .update({ status: "closed", closed_at: new Date().toISOString() } as any)
      .eq("id", sessionId);

    if (error) {
      toast.error("Erro ao fechar mesa: " + error.message);
    } else {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      toast.success("Mesa fechada com sucesso!");
    }
  }

  useEffect(() => {
    if (tenantId) loadSessions();
  }, [tenantId]);

  return { sessions, loading, loadSessions, closeSession };
}
