-- Fix combos available_days column
-- This migration ensures the available_days column exists and is properly typed

BEGIN;

-- Check if column exists, if not add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'combos'
      AND column_name = 'available_days'
  ) THEN
    ALTER TABLE public.combos ADD COLUMN available_days TEXT[];
  END IF;
END $$;

-- Ensure column is TEXT array type (in case it exists but with wrong type)
ALTER TABLE public.combos
  ALTER COLUMN available_days SET DATA TYPE TEXT[];

-- Set default value
ALTER TABLE public.combos
  ALTER COLUMN available_days SET DEFAULT ARRAY[]::TEXT[];

-- Commit
COMMIT;
