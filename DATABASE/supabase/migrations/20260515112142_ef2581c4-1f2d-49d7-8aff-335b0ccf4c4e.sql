-- Criar tabela de emails bloqueados
CREATE TABLE IF NOT EXISTS public.blocked_emails (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    user_id_antigo UUID,
    deleted_by UUID REFERENCES auth.users(id),
    deleted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.blocked_emails ENABLE ROW LEVEL SECURITY;

-- Apenas super_admin pode ver emails bloqueados
CREATE POLICY "Super admins can view blocked emails"
ON public.blocked_emails
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'super_admin'
    )
);

-- Adicionar campo de exclusão lógica em profiles se não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'profiles' AND column_name = 'deleted_at') THEN
        ALTER TABLE public.profiles ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Proteger o admin principal de exclusão no nível do banco (Trigger de proteção)
CREATE OR REPLACE FUNCTION public.check_admin_protection()
RETURNS TRIGGER AS $$
BEGIN
    -- Impedir exclusão do profile do admin principal
    IF OLD.id IN (SELECT id FROM auth.users WHERE email = 'vitinhonavoz18@gmail.com') THEN
        RAISE EXCEPTION 'A conta admin principal não pode ser excluída.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_main_admin
BEFORE DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.check_admin_protection();

-- Criar função para verificar email bloqueado no signup
CREATE OR REPLACE FUNCTION public.check_blocked_email_on_signup()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.blocked_emails WHERE email = NEW.email) THEN
        RAISE EXCEPTION 'Este email não pode mais ser usado para criar uma conta. Use outro email.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
