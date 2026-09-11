import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ScrollableTabs } from "@/components/layout/ScrollableTabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePlan } from "@/lib/plan-context";
import { RequireFeature } from "@/components/PremiumFeatureLock";
import { CrmNaoContratado } from "@/components/chat/CrmNaoContratado";
import { ChatCrm } from "@/components/chat/ChatCrm";
import { ConexaoWhatsApp } from "@/components/whatsapp/ConexaoWhatsApp";

export const Route = createFileRoute("/_app/chat")({ component: ChatPage });

/**
 * A aba Chat — o CRM de atendimento por WhatsApp.
 *
 * AS TRÊS PORTAS, EM ORDEM
 *
 * 1. Plano CENTS: a aba nem aparece no menu, e quem digitar /chat na barra de
 *    endereço encontra a tela de upgrade. As funções do servidor recusam do
 *    mesmo jeito, e o banco também — três trancas, não uma. Esconder a tela
 *    nunca foi a proteção.
 *
 * 2. Premium sem o Chat contratado: a aba aparece e leva à vitrine, com o
 *    botão do WhatsApp do suporte. É assim que ele descobre que o recurso
 *    existe.
 *
 * 3. Premium com o Chat contratado: o CRM funcionando.
 *
 * `RequireFeature` cuida das três — a mesma peça já usada por Mesas, Garçons e
 * Comissões. Não existe um sistema paralelo de permissão aqui.
 */

type Loja = { id: string; name: string };

/**
 * A aba "Conexão" fica DENTRO do Chat, e não escondida nas configurações.
 *
 * Quando o WhatsApp cai, é aqui que o lojista está — olhando uma lista de
 * conversas que parou de crescer. Obrigá-lo a caçar a tela de religar em
 * outro canto do painel, num sábado à noite com cliente esperando, é o tipo
 * de detalhe que faz ele ligar para o suporte em vez de resolver sozinho.
 */
const ABAS = [
  { value: "conversas", label: "Conversas" },
  { value: "conexao", label: "Conexão do WhatsApp" },
];

function ChatPage() {
  return (
    <RequireFeature feature="chat" semContratacao={<CrmNaoContratado />}>
      <ChatPageInner />
    </RequireFeature>
  );
}

function ChatPageInner() {
  const { user, isSuperAdmin } = useAuth();
  const { loading: carregandoPlano } = usePlan();
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [carregandoLojas, setCarregandoLojas] = useState(true);
  const [aba, setAba] = useState("conversas");

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

  if (carregandoPlano || carregandoLojas) {
    return (
      <div className="grid min-h-[60dvh] place-items-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (lojas.length === 0) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-md rounded-xl border border-dashed p-8 text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">Nenhuma loja por aqui</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            O Chat atende os clientes de uma loja. Cadastre a sua para começar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 md:px-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessageSquare className="h-6 w-6 text-primary" />
            Chat
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Todas as conversas do WhatsApp da loja em um lugar só.
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

      {tenantId && (
        <Tabs value={aba} onValueChange={setAba} className="min-w-0">
          <div className="px-4 pt-3 md:px-6">
            <ScrollableTabs items={ABAS} value={aba} />
          </div>

          {/* `forceMount` ficaria tentador para não perder a rolagem da lista
              ao trocar de aba, mas manteria a conferência de status do
              WhatsApp rodando o dia inteiro em segundo plano. */}
          <TabsContent value="conversas" className="mt-0">
            <ChatCrm key={tenantId} tenantId={tenantId} />
          </TabsContent>

          <TabsContent value="conexao" className="mt-0 p-4 md:p-6">
            <ConexaoWhatsApp key={tenantId} tenantId={tenantId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
