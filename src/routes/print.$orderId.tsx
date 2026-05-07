import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/print/$orderId")({ component: Print });

function Print() {
  const { orderId } = Route.useParams();
  const [o, setO] = useState<any>(null);
  const [pz, setPz] = useState<any>(null);

  useEffect(() => { (async () => {
    const { data } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (data) {
      setO(data);
      const { data: p } = await supabase.from("pizzerias").select("name, phone, address").eq("id", data.tenant_id).maybeSingle();
      setPz(p);
      setTimeout(() => window.print(), 400);
    }
  })(); }, [orderId]);

  if (!o) return <div className="p-6 text-sm">Carregando…</div>;
  const items = Array.isArray(o.items) ? o.items : [];

  return (
    <div className="mx-auto max-w-[80mm] bg-white p-4 font-mono text-[12px] text-black">
      <div className="text-center">
        <div className="text-base font-bold uppercase">{pz?.name ?? "Pedido"}</div>
        {pz?.phone && <div>{pz.phone}</div>}
        {pz?.address && <div>{pz.address}</div>}
        <div className="my-2 border-t border-dashed border-black"></div>
        <div className="font-bold">PEDIDO #{o.order_number}</div>
        <div>{new Date(o.created_at).toLocaleString("pt-BR")}</div>
      </div>
      <div className="my-2 border-t border-dashed border-black"></div>
      <div>
        <div><b>Cliente:</b> {o.customer_name}</div>
        <div><b>Tel:</b> {o.customer_phone}</div>
        {o.customer_address && <div><b>End:</b> {o.customer_address}</div>}
        {o.neighborhood && <div><b>Bairro:</b> {o.neighborhood}</div>}
      </div>
      <div className="my-2 border-t border-dashed border-black"></div>
      <ul>
        {items.map((it: any, i: number) => (
          <li key={i} className="flex justify-between">
            <span>{it.qty ?? it.quantity ?? 1}x {it.name ?? it.title ?? "Item"}</span>
            <span>R$ {Number(it.price ?? 0).toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <div className="my-2 border-t border-dashed border-black"></div>
      <div className="flex justify-between"><span>Subtotal</span><span>R$ {(Number(o.total) - Number(o.delivery_fee)).toFixed(2)}</span></div>
      <div className="flex justify-between"><span>Entrega</span><span>R$ {Number(o.delivery_fee).toFixed(2)}</span></div>
      <div className="flex justify-between text-base font-bold"><span>TOTAL</span><span>R$ {Number(o.total).toFixed(2)}</span></div>
      {o.payment_method && <div className="mt-2"><b>Pgto:</b> {o.payment_method}</div>}
      {o.change_for && <div><b>Troco para:</b> R$ {Number(o.change_for).toFixed(2)}</div>}
      {o.notes && <div className="mt-2"><b>Obs:</b> {o.notes}</div>}
      <div className="mt-4 text-center text-[10px]">FlyControl · Pedido recebido</div>
      <div className="no-print mt-4 text-center">
        <button onClick={() => window.print()} className="rounded border px-3 py-1 text-xs">Imprimir novamente</button>
      </div>
    </div>
  );
}
