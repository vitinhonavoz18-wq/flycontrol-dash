-- Campos essenciais do site público que o FlyControl ainda não conseguia
-- configurar: tipo de negócio, slogan, cidade, WhatsApp exibido no rodapé
-- (o WhatsApp de pedidos já existe em `phone`) e os modos de atendimento
-- (delivery/retirada/consumo local) que o SiteCreatorFly já reconhece em
-- `restaurants.business_type/tagline/city/whatsapp_display/
-- delivery_enabled/pickup_enabled/table_enabled`.
ALTER TABLE public.pizzerias
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS whatsapp_display text,
  ADD COLUMN IF NOT EXISTS delivery_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pickup_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS table_enabled boolean NOT NULL DEFAULT false;
