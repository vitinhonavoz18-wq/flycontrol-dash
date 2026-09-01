-- Garantir que owner_id existe e está configurado corretamente
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pizzerias' AND column_name = 'owner_id') THEN
        ALTER TABLE public.pizzerias ADD COLUMN owner_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- Habilitar RLS se não estiver
ALTER TABLE public.pizzerias ENABLE ROW LEVEL SECURITY;

-- Limpar políticas existentes para evitar conflitos
DROP POLICY IF EXISTS "Owners can manage their pizzerias" ON public.pizzerias;
DROP POLICY IF EXISTS "Super admins can manage all pizzerias" ON public.pizzerias;
DROP POLICY IF EXISTS "Allow public creation for integration" ON public.pizzerias;
DROP POLICY IF EXISTS "Users can view their own pizzerias" ON public.pizzerias;
DROP POLICY IF EXISTS "Users can insert their own pizzerias" ON public.pizzerias;
DROP POLICY IF EXISTS "Users can update their own pizzerias" ON public.pizzerias;

-- Criar novas políticas
CREATE POLICY "Users can view their own pizzerias" 
ON public.pizzerias FOR SELECT 
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can insert their own pizzerias" 
ON public.pizzerias FOR INSERT 
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own pizzerias" 
ON public.pizzerias FOR UPDATE 
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'super_admin'));

-- Permitir que a API pública (service_role via SiteCreatorFly) insira pizzarias sem owner_id inicialmente se necessário
-- Nota: O endpoint de API usa supabaseAdmin (service_role), que ignora RLS. 
-- Mas para o dashboard, precisamos que o usuário autenticado consiga inserir.
