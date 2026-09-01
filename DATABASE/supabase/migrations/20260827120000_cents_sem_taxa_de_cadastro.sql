-- CENTS deixa de ter taxa de cadastro.
--
-- O que muda para o cliente: entrar no FlyControl pelo CENTS não custa mais
-- nada. Ele usa os 30 dias grátis e, depois disso, paga só pelos pedidos que
-- realmente entraram. A cobrança de R$ 25,00 que aparecia na primeira conta
-- deixa de existir.
--
-- Por que uma versão NOVA de preço, em vez de corrigir a antiga: a tabela de
-- preços é um histórico, como o caderno de preços do restaurante. Não se
-- apaga o preço de ontem — escreve-se o de hoje na linha de baixo e risca-se
-- o anterior. Assim continua sendo possível saber quanto cada assinatura
-- contratou, e quando.
--
-- A versão 1 sai de circulação (is_active = false) porque o cadastro procura
-- a versão ativa do plano e espera encontrar exatamente uma.

-- Fecha a versão 1 do CENTS: continua registrada, mas não é mais oferecida.
UPDATE public.plan_price_versions pv
SET is_active = false,
    effective_until = COALESCE(pv.effective_until, now())
FROM public.plans p
WHERE pv.plan_id = p.id
  AND p.code = 'cents'
  AND pv.version = 1
  AND pv.is_active;

-- Versão 2: mesmos preços por pedido e mesma meta. A única diferença é a
-- taxa de cadastro, agora zero.
INSERT INTO public.plan_price_versions (
  plan_id, version, setup_fee_cents, monthly_fee_cents,
  default_order_unit_price_cents, promotional_order_unit_price_cents,
  promotion_threshold_orders, change_reason
)
SELECT p.id, 2, 0, 0, 70, 45, 500,
       'Taxa de cadastro removida: entrada gratuita no CENTS'
FROM public.plans p
WHERE p.code = 'cents'
  AND NOT EXISTS (
    SELECT 1 FROM public.plan_price_versions pv
    WHERE pv.plan_id = p.id AND pv.version = 2
  );
