import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/print/$orderId")({ component: Print });

function Print() {
  const { orderId } = Route.useParams();
  const [o, setO] = useState<any>(null);
  const [pz, setPz] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
      if (data) {
        setO(data);
        const { data: p } = await supabase
          .from("pizzerias")
          .select("name, phone, address")
          .eq("id", data.tenant_id)
          .maybeSingle();
        setPz(p);
        // Pequeno atraso para garantir renderização antes do diálogo de impressão
        setTimeout(() => window.print(), 800);
      }
    })();
  }, [orderId]);

  if (!o) return <div className="p-6 text-center text-sm">Carregando pedido...</div>;

  const items = Array.isArray(o.items) ? o.items : [];

  const formatCurrency = (value: any) => {
    const num = Number(value || 0);
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  return (
    <div className="mx-auto max-w-[80mm] bg-white p-4 font-sans text-[14px] leading-tight text-black print:p-0">
      {/* CABEÇALHO DA PIZZARIA */}
      <div className="mb-4 text-center">
        <div className="text-xl font-bold uppercase leading-none">{pz?.name ?? "Pizzaria"}</div>
        {pz?.phone && <div className="mt-1 text-base">{pz.phone}</div>}
        {pz?.address && <div className="text-xs">{pz.address}</div>}
        <div className="my-2 border-t-2 border-dashed border-black"></div>
        <div className="text-lg font-bold">PEDIDO #{o.order_number}</div>
        <div className="text-sm">{new Date(o.created_at).toLocaleString("pt-BR")}</div>
      </div>

      <div className="my-2 border-t border-dashed border-black"></div>

      {/* DADOS DO CLIENTE */}
      <div className="space-y-1">
        <div>
          <span className="font-bold">Cliente:</span>{" "}
          <span className="text-base">{o.customer_name}</span>
        </div>
        <div>
          <span className="font-bold">Telefone:</span>{" "}
          <span className="text-base">{o.customer_phone}</span>
        </div>
        {o.customer_address && (
          <div>
            <span className="font-bold">Endereço:</span>{" "}
            <span className="text-base">{o.customer_address}</span>
          </div>
        )}
        {o.neighborhood && (
          <div>
            <span className="font-bold">Bairro:</span>{" "}
            <span className="text-base">{o.neighborhood}</span>
          </div>
        )}
        {o.delivery_type && (
          <div className="mt-1 inline-block bg-black px-2 py-0.5 text-xs font-bold uppercase text-white">
            Tipo: {o.delivery_type === "delivery" ? "Entrega" : "Retirada/Balcão"}
          </div>
        )}
      </div>

      <div className="my-3 border-t-2 border-dashed border-black"></div>

      {/* ITENS DO PEDIDO */}
      <div className="mb-2 font-bold uppercase">Itens do Pedido:</div>
      <div className="space-y-4">
        {items.map((it: any, i: number) => {
          const qty = it.qty ?? it.quantity ?? 1;
          const name = it.product_name ?? it.name ?? it.title ?? it.nome ?? "Item";
          const price = Number(it.unit_price ?? it.price ?? 0);
          const subtotal = Number(it.total_price ?? it.total ?? it.subtotal ?? (price * qty));
          
          // Sabores (para pizzas)
          const flavors = Array.isArray(it.flavors) ? it.flavors : [];
          const selectedFlavors = Array.isArray(it.selected_flavors) ? it.selected_flavors : [];
          const allFlavors = [...new Set([...flavors, ...selectedFlavors])];

          // Ingredientes/Adicionais
          const ingredients = Array.isArray(it.ingredients) ? it.ingredients : 
                             (typeof it.ingredients === 'string' ? [it.ingredients] : []);
          const additions = Array.isArray(it.additions) ? it.additions : 
                           Array.isArray(it.adicionais) ? it.adicionais : [];
          
          return (
            <div key={i} className="border-b border-gray-100 pb-2 last:border-0">
              <div className="flex items-start justify-between gap-2">
                <span className="font-bold">
                  {qty}x {name}
                  {it.size && <span className="text-sm font-normal"> ({it.size})</span>}
                </span>
                <span className="whitespace-nowrap font-bold">{formatCurrency(subtotal)}</span>
              </div>

              {/* Detalhes da Pizza */}
              {allFlavors.length > 0 && (
                <div className="ml-4 mt-1">
                  <div className="text-xs font-bold uppercase">Sabores:</div>
                  {allFlavors.map((f: string, idx: number) => (
                    <div key={idx} className="text-sm leading-tight">• {f}</div>
                  ))}
                </div>
              )}

              {/* Borda */}
              {(it.crust || it.borda) && (
                <div className="ml-4 mt-1">
                  <span className="text-xs font-bold uppercase">Borda:</span>{" "}
                  <span className="text-sm">{it.crust || it.borda}</span>
                </div>
              )}

              {/* Ingredientes */}
              {ingredients.length > 0 && (
                <div className="ml-4 mt-1">
                  <div className="text-xs font-bold uppercase">Ingredientes:</div>
                  <div className="text-xs italic">{ingredients.join(", ")}</div>
                </div>
              )}

              {/* Adicionais */}
              {additions.length > 0 && (
                <div className="ml-4 mt-1">
                  <div className="text-xs font-bold uppercase">Adicionais:</div>
                  {additions.map((add: any, idx: number) => (
                    <div key={idx} className="text-sm">+ {typeof add === 'string' ? add : (add.name || add.nome)}</div>
                  ))}
                </div>
              )}

              {/* Observação do Item */}
              {(it.notes || it.observacao || it.item_notes) && (
                <div className="ml-4 mt-1 rounded bg-gray-50 p-1 text-xs">
                  <span className="font-bold">Obs Item:</span> {it.notes || it.observacao || it.item_notes}
                </div>
              )}
              
              {qty > 1 && (
                <div className="mt-1 text-right text-[10px] text-gray-500">
                  Valor unitário: {formatCurrency(price)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="my-3 border-t-2 border-dashed border-black"></div>

      {/* TOTAIS */}
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span>{formatCurrency(o.subtotal || (Number(o.total) - Number(o.delivery_fee)))}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Taxa de Entrega</span>
          <span>{formatCurrency(o.delivery_fee)}</span>
        </div>
        <div className="flex justify-between border-t border-black pt-1 text-lg font-bold">
          <span>TOTAL</span>
          <span>{formatCurrency(o.total)}</span>
        </div>
      </div>

      <div className="my-3 border-t border-dashed border-black"></div>

      {/* PAGAMENTO E OBS GERAIS */}
      <div className="space-y-2">
        {o.payment_method && (
          <div>
            <span className="font-bold">Forma de Pagamento:</span>
            <div className="text-base uppercase">{o.payment_method}</div>
          </div>
        )}
        {o.change_for && Number(o.change_for) > 0 && (
          <div className="bg-gray-100 p-1">
            <span className="font-bold">Troco para:</span>{" "}
            <span className="text-base font-bold">{formatCurrency(o.change_for)}</span>
          </div>
        )}
        {o.notes && (
          <div className="mt-2 border-l-4 border-black pl-2">
            <span className="font-bold">Observações Gerais:</span>
            <div className="text-sm italic">{o.notes}</div>
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-gray-200 pt-2 text-center text-[10px] text-gray-400">
        <div>FlyControl · Sistema de Gestão para Pizzarias</div>
        <div>Impressão em {new Date().toLocaleString("pt-BR")}</div>
      </div>

      <div className="no-print mt-8 flex flex-col gap-2">
        <button
          onClick={() => window.print()}
          className="w-full rounded-md bg-black py-3 font-bold text-white transition-opacity hover:opacity-90"
        >
          IMPRIMIR COMANDA
        </button>
        <button
          onClick={() => window.history.back()}
          className="w-full rounded-md border border-gray-300 py-2 text-sm text-gray-600"
        >
          Voltar para o Painel
        </button>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0 !important; padding: 0 !important; }
          @page { margin: 0; }
        }
      `}</style>
    </div>
  );
}
