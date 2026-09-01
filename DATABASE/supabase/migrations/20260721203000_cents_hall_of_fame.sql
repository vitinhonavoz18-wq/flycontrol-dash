-- CENTS Fase 6: Fidelização — Hall da Fama
-- club_customer_status é restrito (owner-only) por RLS; o Hall da Fama precisa
-- expor um recorte seguro e público (nome, nível, streak, legend) entre empresas
-- diferentes. Uma função SECURITY DEFINER expõe só esses campos, sem vazar
-- nenhum dado sensível (telefone, endereço, financeiro).

CREATE OR REPLACE FUNCTION public.club_get_hall_of_fame(
  p_club_id UUID DEFAULT '00000000-0000-0000-0000-0000000000c1',
  p_limit INT DEFAULT 10
) RETURNS TABLE (
  company_name TEXT,
  company_slug TEXT,
  level_name TEXT,
  level_icon TEXT,
  level_color TEXT,
  streak INT,
  legend BOOLEAN,
  lifetime_orders INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $$
  SELECT
    p.name,
    p.slug,
    l.name,
    l.icon,
    l.color,
    cs.current_streak,
    cs.legend,
    cs.lifetime_orders
  FROM public.club_customer_status cs
  JOIN public.pizzerias p ON p.id = cs.company_id
  LEFT JOIN public.club_levels l ON l.id = cs.current_level
  WHERE cs.club_id = p_club_id AND cs.hall_of_fame = true
  ORDER BY cs.legend DESC, cs.current_streak DESC, cs.lifetime_orders DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.club_get_hall_of_fame(UUID, INT) TO authenticated;
