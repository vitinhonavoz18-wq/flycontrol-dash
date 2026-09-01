/**
 * A vitrine: o cardápio digital que o cliente final enxerga.
 *
 * O cardápio NÃO é servido por este sistema. Ele mora no SiteCreatorFly, que
 * tem banco de dados próprio. Os dois conversam pelo endpoint de
 * sincronização — o mesmo caminho que já leva mudança de preço e de horário.
 *
 * Por isso fechar o painel não fecha a vitrine, e vice-versa: são duas
 * fechaduras diferentes. Este arquivo existe para as duas serem sempre
 * viradas juntas.
 *
 * FECHAR E REABRIR ANDAM EM PAR
 *
 * Toda suspensão que fecha a vitrine precisa de um pagamento que a reabra.
 * Sem o par, o cliente paga, recupera o painel, os pedidos voltam a ser
 * aceitos pela API — e o site dele continua fechado para o cliente final, sem
 * ninguém entender por quê. É a porta que tranca sozinha e só abre com
 * chaveiro.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Loja = {
  slug: string | null;
  api_key: string | null;
  sync_endpoint: string | null;
  sf_restaurant_id: string | null;
  name: string | null;
  is_open: boolean | null;
};

export type ResultadoVitrine = { ok: boolean; erro?: string };

async function empurrar(companyId: string, aberta: boolean): Promise<ResultadoVitrine> {
  const { data } = await supabaseAdmin
    .from("pizzerias")
    .select("slug, api_key, sync_endpoint, sf_restaurant_id, name, is_open")
    .eq("id", companyId)
    .maybeSingle();

  const loja = data as Loja | null;

  // Loja que nunca foi provisionada no SiteCreatorFly não tem vitrine para
  // mexer. Não é erro: é o caso de quem só usa o painel.
  if (!loja?.sync_endpoint || !loja.sf_restaurant_id) return { ok: true };

  const { syncToExternal } = await import("@/utils/menuSync");
  const r = await syncToExternal({
    type: "restaurant",
    action: "update",
    externalId: loja.sf_restaurant_id,
    data: { name: loja.name, is_open: aberta },
    pizzeriaSlug: loja.slug ?? "",
    pizzeriaApiKey: loja.api_key ?? "",
    syncEndpoint: loja.sync_endpoint,
  });

  return r.success ? { ok: true } : { ok: false, erro: r.error ?? "erro desconhecido" };
}

/**
 * Fecha a vitrine porque a loja foi suspensa por falta de pagamento.
 *
 * `is_open: false` é o mesmo sinal do botão "fechar a loja" que o lojista já
 * usa quando encerra mais cedo — só que acionado pela cobrança, e não pela
 * mão dele.
 */
export function fecharVitrine(companyId: string): Promise<ResultadoVitrine> {
  return empurrar(companyId, false);
}

/**
 * Reabre a vitrine depois que o pagamento entrou.
 *
 * Devolve o valor VERDADEIRO de `is_open` da loja, e não um `true` fixo: o
 * lojista pode estar com a loja fechada por outro motivo — fora do horário,
 * feriado, falta de entregador. Reabrir à força colocaria a loja para receber
 * pedido numa hora em que ele não quer atender, e o problema teria sido
 * criado por nós.
 */
export async function reabrirVitrine(companyId: string): Promise<ResultadoVitrine> {
  const { data } = await supabaseAdmin
    .from("pizzerias")
    .select("is_open")
    .eq("id", companyId)
    .maybeSingle();

  const aberta = (data as { is_open: boolean | null } | null)?.is_open ?? true;
  return empurrar(companyId, aberta);
}
