-- Plano interno de teste (R$0,20/mês) para validar o cadastro real e o
-- checkout da InfinityPay sem usar o preço de verdade do PREMIUM ou do CENTS.
--
-- Não aparece na página pública nem no seletor do cadastro — só é alcançável
-- por quem abre /signup?plan=teste direto. `is_public = false` segue o mesmo
-- padrão já usado por `legacy_full_access`.

-- A constraint em par (plan_type, billing_model) precisa aceitar o novo
-- código antes de qualquer pizzaria poder nascer com ele.
ALTER TABLE public.pizzerias
  DROP CONSTRAINT IF EXISTS pizzerias_plan_billing_pair_check;

-- O CHECK de plan_type nasceu sem nome explícito (inline no ADD COLUMN da
-- migration de restructure), então seu nome real depende do que o Postgres
-- gerou sozinho — pode não ser o padrão `pizzerias_plan_type_check`. Em vez
-- de arriscar um DROP CONSTRAINT com o nome errado (que deixaria a constraint
-- antiga presa, bloqueando 'teste' mesmo depois desta migration), localiza e
-- remove qualquer CHECK que exista de fato sobre essa coluna.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    WHERE con.conrelid = 'public.pizzerias'::regclass
      AND con.contype = 'c'
      AND att.attname = 'plan_type'
  LOOP
    EXECUTE format('ALTER TABLE public.pizzerias DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.pizzerias
  ADD CONSTRAINT pizzerias_plan_type_check CHECK (plan_type IN ('premium', 'cents', 'teste'));

ALTER TABLE public.pizzerias
  ADD CONSTRAINT pizzerias_plan_billing_pair_check CHECK (
    (plan_type = 'premium' AND billing_model = 'fixed') OR
    (plan_type = 'cents' AND billing_model = 'per_order') OR
    (plan_type = 'teste' AND billing_model = 'fixed')
  );

INSERT INTO public.plans (code, name, description, billing_model, is_active, is_public, sort_order)
VALUES (
  'teste', 'TESTE (interno)',
  'Plano interno para validar cadastro e checkout. Não é vendido a clientes.',
  'monthly_fixed', true, false, 100
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.plan_price_versions (
  plan_id, version, setup_fee_cents, monthly_fee_cents,
  default_order_unit_price_cents, promotional_order_unit_price_cents,
  promotion_threshold_orders, change_reason
)
SELECT p.id, 1, 0, 20, 0, 0, 0, 'Versão inicial — R$0,20 para teste de cadastro e checkout'
FROM public.plans p
WHERE p.code = 'teste'
  AND NOT EXISTS (
    SELECT 1 FROM public.plan_price_versions pv WHERE pv.plan_id = p.id AND pv.version = 1
  );
