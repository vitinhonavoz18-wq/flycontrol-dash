-- Rede de segurança: garante a coluna available_days em combos.
--
-- Nota de diagnóstico, para quem vier depois: o erro "Could not find the
-- 'available_days' column of 'combos'" que aparecia ao criar combo NÃO vinha
-- daqui. A coluna sempre existiu neste banco. A recusa vinha do banco do
-- SiteCreatorFly, que não tinha os campos que o painel envia — a correção de
-- verdade está em docs/sitecreatorfly-combos-aplicar-no-supabase.sql.
--
-- Esta migração fica como proteção para bancos recriados do zero.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'combos'
      AND column_name = 'available_days'
  ) THEN
    ALTER TABLE public.combos ADD COLUMN available_days TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;
END $$;
