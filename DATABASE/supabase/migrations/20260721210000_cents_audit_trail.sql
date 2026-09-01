-- CENTS Fase 7: Confiabilidade transversal — auditoria administrativa
-- club_audit_logs já existia (Fase 1) mas nada gravava nela. Toda alteração
-- em club_settings (preços/metas do clube) ou club_levels (níveis/benefícios)
-- afeta todas as empresas do clube de uma vez — precisa ficar registrada
-- automaticamente, sem depender do código cliente lembrar de chamar um log.

CREATE OR REPLACE FUNCTION public.club_audit_admin_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.club_audit_logs (user_id, action, table_name, old_value, new_value)
  VALUES (
    auth.uid(),
    'admin_update',
    TG_TABLE_NAME,
    to_jsonb(OLD),
    to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_club_audit_settings ON public.club_settings;
CREATE TRIGGER trg_club_audit_settings
  AFTER UPDATE ON public.club_settings
  FOR EACH ROW EXECUTE FUNCTION public.club_audit_admin_change();

DROP TRIGGER IF EXISTS trg_club_audit_levels ON public.club_levels;
CREATE TRIGGER trg_club_audit_levels
  AFTER UPDATE ON public.club_levels
  FOR EACH ROW EXECUTE FUNCTION public.club_audit_admin_change();

-- Leitura da auditoria pelo painel admin: já coberta pela policy
-- "club_audit_logs_admin_select" da Fase 1 (public.is_admin()).
