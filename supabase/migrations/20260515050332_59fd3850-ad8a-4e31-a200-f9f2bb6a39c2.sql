-- Ensure user is admin in profiles
UPDATE public.profiles 
SET is_admin = TRUE 
WHERE id = 'e0f663c0-34ed-43c7-95d7-d072d2d5d389';

-- Ensure user has super_admin role in user_roles
INSERT INTO public.user_roles (user_id, role)
VALUES ('e0f663c0-34ed-43c7-95d7-d072d2d5d389', 'super_admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Fix function permissions
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon;
