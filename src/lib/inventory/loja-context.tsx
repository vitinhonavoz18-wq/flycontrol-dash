import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Qual loja está sendo olhada agora, compartilhado por todas as telas do
 * módulo.
 *
 * POR QUE ISSO EXISTE
 *
 * O dono troca de loja uma vez, no topo, e o resto do módulo inteiro
 * acompanha. Sem isso, cada aba escolheria a loja por conta própria — e daria
 * para estar vendo o estoque da loja A na aba Produtos e vender pela loja B no
 * balcão, sem nada na tela avisando.
 *
 * O `tenantId` daqui é uma CONVENIÊNCIA DE TELA, nunca uma permissão: toda
 * função de servidor confere de novo se quem pediu é dono daquela loja. O
 * navegador diz qual loja quer ver; quem decide se pode é o servidor.
 */

type Loja = { id: string; name: string; slug?: string | null };

type Contexto = {
  lojas: Loja[];
  tenantId: string;
  setTenantId: (id: string) => void;
  carregandoLojas: boolean;
};

const LojaDoEstoque = createContext<Contexto | null>(null);

export function LojaDoEstoqueProvider({ children }: { children: ReactNode }) {
  const { user, isSuperAdmin } = useAuth();
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [carregandoLojas, setCarregandoLojas] = useState(true);

  useEffect(() => {
    if (!user) return;
    let ativo = true;
    (async () => {
      let q = supabase
        .from("pizzerias")
        .select("id, name, slug")
        .neq("status", "deleted")
        .neq("status", "inactive")
        .order("created_at");
      if (!isSuperAdmin) q = q.eq("owner_id", user.id);
      const { data } = await q;
      if (!ativo) return;
      const lista = (data ?? []) as Loja[];
      setLojas(lista);
      setTenantId((atual) => atual || lista[0]?.id || "");
      setCarregandoLojas(false);
    })();
    return () => {
      ativo = false;
    };
  }, [user, isSuperAdmin]);

  return (
    <LojaDoEstoque.Provider value={{ lojas, tenantId, setTenantId, carregandoLojas }}>
      {children}
    </LojaDoEstoque.Provider>
  );
}

export function useLojaDoEstoque() {
  const c = useContext(LojaDoEstoque);
  if (!c) throw new Error("useLojaDoEstoque precisa estar dentro de LojaDoEstoqueProvider");
  return c;
}
