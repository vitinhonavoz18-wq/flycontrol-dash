DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pizzerias_claim_unowned' AND tablename = 'pizzerias') THEN
        CREATE POLICY "pizzerias_claim_unowned" ON public.pizzerias
        FOR UPDATE
        TO authenticated
        USING (owner_id IS NULL OR is_admin())
        WITH CHECK (owner_id = auth.uid() OR is_admin());
    END IF;
END $$;
