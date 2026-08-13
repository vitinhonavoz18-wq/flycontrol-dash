-- Cobrança automática do ciclo mensal.
--
-- `payment_transactions` já existia como estrutura pronta para o gateway,
-- mas nada gravava nela ainda. Falta um único campo: o link de pagamento
-- que a InfinityPay gera para aquela cobrança específica — sem ele, o
-- cliente recebe a fatura calculada mas não tem para onde ir pagar.

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS checkout_url TEXT;

COMMENT ON COLUMN public.payment_transactions.checkout_url IS
  'Link de pagamento gerado na InfinityPay para esta cobrança específica.';

CREATE INDEX IF NOT EXISTS payment_transactions_invoice_idx
  ON public.payment_transactions(invoice_id);
