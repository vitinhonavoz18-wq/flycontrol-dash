-- Remove qualquer role existente para o usuário e adiciona como super_admin
DO $$
DECLARE
    target_user_id uuid;
BEGIN
    SELECT id INTO target_user_id FROM auth.users WHERE email = 'arthurgarciaba@gmail.com';
    
    IF target_user_id IS NOT NULL THEN
        DELETE FROM public.user_roles WHERE user_id = target_user_id;
        INSERT INTO public.user_roles (user_id, role) VALUES (target_user_id, 'super_admin');
    END IF;
END $$;
