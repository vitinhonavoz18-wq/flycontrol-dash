import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ScrollableTabs } from "@/components/layout/ScrollableTabs";
import { Megaphone } from "lucide-react";
import { VisaoGeral } from "@/components/marketing/VisaoGeral";
import { ClientesMarketing } from "@/components/marketing/ClientesMarketing";
import { Campanhas } from "@/components/marketing/Campanhas";
import { ModelosMensagem } from "@/components/marketing/ModelosMensagem";
import { ConfiguracoesWhatsApp } from "@/components/marketing/ConfiguracoesWhatsApp";
import { DescontoAceite } from "@/components/marketing/DescontoAceite";

export const Route = createFileRoute("/_app/marketing")({ component: MarketingPage });

/**
 * Marketing — o módulo de campanhas por WhatsApp.
 *
 * A ordem das abas segue o caminho que a pessoa realmente faz: primeiro ela
 * olha quantos clientes tem (Visão geral), depois vê quem são (Clientes),
 * depois cria a campanha, guarda o texto que deu certo (Modelos) e, quando
 * algo não sai, vai em Configurações ver se o WhatsApp caiu.
 *
 * A loja escolhida no topo vale para todas as abas. Quem tem uma loja só nem
 * vê o seletor — não faz sentido escolher entre uma opção.
 */

const ABAS = [
  { value: "visao", label: "Visão geral" },
  { value: "clientes", label: "Clientes" },
  { value: "campanhas", label: "Campanhas" },
  { value: "modelos", label: "Modelos de mensagem" },
  { value: "config", label: "Configurações" },
];

type Loja = { id: string; name: string };

function MarketingPage() {
  const { user, isSuperAdmin } = useAuth();
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [aba, setAba] = useState("visao");
  const [carregandoLojas, setCarregandoLojas] = useState(true);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      if (!user) return;
      let q = supabase
        .from("pizzerias")
        .select("id, name")
        .neq("status", "deleted")
        .neq("status", "inactive")
        .order("name");
      if (!isSuperAdmin) q = q.eq("owner_id", user.id);
      const { data } = await q;
      if (cancelado) return;
      const lista = (data ?? []) as Loja[];
      setLojas(lista);
      setTenantId((atual) => atual || lista[0]?.id || "");
      setCarregandoLojas(false);
    }
    void carregar();
    return () => {
      cancelado = true;
    };
  }, [user, isSuperAdmin]);

  if (!carregandoLojas && lojas.length === 0) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-md rounded-xl border border-dashed p-8 text-center">
          <Megaphone className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">Nenhuma loja por aqui</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            O Marketing trabalha em cima dos clientes de uma loja. Cadastre a sua para começar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Megaphone className="h-6 w-6 text-primary" />
            Marketing
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Traga de volta quem já comprou com você.
          </p>
        </div>

        {lojas.length > 1 && (
          <Select value={tenantId} onValueChange={setTenantId}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Escolha a loja" />
            </SelectTrigger>
            <SelectContent>
              {lojas.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Tabs value={aba} onValueChange={setAba} className="min-w-0">
        {/* A barra de abas mede o conteúdo dela, e cinco abas somam mais que a
            largura de um celular. Sem esta caixa segurando, ela empurraria a
            página inteira para o lado e apareceria rolagem horizontal. */}
        <div className="min-w-0 max-w-full">
          <ScrollableTabs items={ABAS} value={aba} />
        </div>

        {/* Cada aba só monta quando é aberta: sem isso, entrar em Marketing
            dispararia de uma vez a consulta de todas as cinco telas. */}
        {tenantId && (
          <div className="pt-4">
            <TabsContent value="visao" className="mt-0">
              <VisaoGeral tenantId={tenantId} aoTrocarAba={setAba} />
            </TabsContent>
            <TabsContent value="clientes" className="mt-0">
              <ClientesMarketing tenantId={tenantId} />
            </TabsContent>
            <TabsContent value="campanhas" className="mt-0">
              <Campanhas tenantId={tenantId} />
            </TabsContent>
            <TabsContent value="modelos" className="mt-0">
              <ModelosMensagem tenantId={tenantId} />
            </TabsContent>
            <TabsContent value="config" className="mt-0">
              <div className="space-y-4">
                <DescontoAceite tenantId={tenantId} />
                <ConfiguracoesWhatsApp tenantId={tenantId} />
              </div>
            </TabsContent>
          </div>
        )}
      </Tabs>
    </div>
  );
}
