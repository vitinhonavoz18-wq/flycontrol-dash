-- These columns existed in the pre-migration (Lovable-managed) database but were
-- missing from this repo's migration history, discovered while restoring order data.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_reference text,
  ADD COLUMN IF NOT EXISTS delivery_type text,
  ADD COLUMN IF NOT EXISTS whatsapp_message text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS subtotal numeric;
