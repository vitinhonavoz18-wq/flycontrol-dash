-- Taxa de entrega por bairro.
--
-- O QUE MUDA NA PRÁTICA
--
-- Até agora a loja tinha UMA taxa de entrega para o mundo inteiro: o cliente
-- do outro lado da cidade pagava o mesmo do vizinho da esquina. Quem fazia a
-- conta certa era o dono, na mão, no WhatsApp, depois do pedido fechado.
--
-- Aqui nasce o caderninho de bairros: cada bairro atendido com o seu preço.
-- O cliente escolhe o bairro dele no site e já vê quanto vai pagar, antes de
-- fechar o pedido.
--
-- POR QUE O VALOR NÃO ESTÁ EM CENTAVOS INTEIROS AQUI
--
-- A regra do projeto é dinheiro em centavos inteiros, e ela vale para a
-- COBRANÇA (o que a plataforma fatura do lojista) — lá um centavo errado vira
-- fatura errada.
--
-- Esta taxa é outra coisa: é preço de cardápio, e ela precisa casar exatamente
-- com dois campos que já existem e já são decimais — `pizzerias.delivery_fee`,
-- aqui do lado, e `delivery_zones.fee`, no SiteCreatorFly. Guardar em centavos
-- só aqui obrigaria a converter na ida e na volta da sincronização, e toda
-- conversão a mais é uma chance a mais de a taxa chegar cem vezes maior no
-- cardápio do cliente. Uma régua só para os três lugares.
--
-- UM BAIRRO, UM PREÇO
--
-- O índice único impede o mesmo bairro cadastrado duas vezes na mesma loja.
-- É o caderno de reservas que só aceita um nome por mesa: se tentar escrever
-- "Centro" de novo, a caneta trava — em vez de deixar dois "Centro" com
-- preços diferentes e o sistema escolhendo um deles na hora do pedido.
-- A comparação ignora maiúsculas e espaços nas pontas, senão "Centro",
-- "centro" e "Centro " passariam como bairros diferentes.

CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pizzeria_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  neighborhood TEXT NOT NULL,
  fee NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- O id desta mesma zona lá no SiteCreatorFly. É por ele que uma edição
  -- encontra a linha certa do outro lado, em vez de criar uma cópia nova a
  -- cada vez que o dono corrige a taxa.
  external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT delivery_zones_bairro_nao_vazio CHECK (btrim(neighborhood) <> ''),
  CONSTRAINT delivery_zones_taxa_nao_negativa CHECK (fee >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_zones_um_bairro_por_loja
  ON public.delivery_zones (pizzeria_id, lower(btrim(neighborhood)));

CREATE INDEX IF NOT EXISTS delivery_zones_por_loja
  ON public.delivery_zones (pizzeria_id, sort_order);

ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;

-- Quem mexe é o dono da loja (ou o administrador da plataforma). Mesma regra
-- que já vale para produtos e categorias — um porteiro só, com a mesma lista.
DROP POLICY IF EXISTS "Manage delivery_zones" ON public.delivery_zones;
CREATE POLICY "Manage delivery_zones" ON public.delivery_zones
  FOR ALL
  USING (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id))
  WITH CHECK (is_admin() OR owns_pizzeria(auth.uid(), pizzeria_id));

-- O cliente que está montando o pedido precisa ver os bairros e as taxas da
-- loja — é o que o cardápio mostra no momento da entrega. Só de lojas ativas,
-- e só leitura.
DROP POLICY IF EXISTS "delivery_zones_public_select" ON public.delivery_zones;
CREATE POLICY "delivery_zones_public_select" ON public.delivery_zones
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pizzerias
      WHERE pizzerias.id = delivery_zones.pizzeria_id
        AND pizzerias.status = 'active'
    )
  );

COMMENT ON TABLE public.delivery_zones IS
  'Bairros atendidos pela loja e a taxa de entrega de cada um. Sincroniza com a tabela de mesmo nome no SiteCreatorFly pelo external_id.';
