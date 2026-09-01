-- ETAPA 2 DA AUDITORIA — tranca as funções privilegiadas (SEC-07 e SEC-17).
--
-- PARTE 1 — AS CHAVES DO ESCRITÓRIO ESTAVAM PENDURADAS NA PORTA (SEC-07)
--
-- O Supabase publica um endereço na internet para toda função do esquema
-- `public`, e o Postgres, por padrão, deixa qualquer um executá-la. Só sai
-- dessa lista quem tem um REVOKE escrito.
--
-- O módulo de cobrança e o de marketing já fizeram isso. O Clube CENTS não —
-- e as funções dele têm poderes elevados: fecham o mês, abrem o mês, definem
-- o preço por pedido do ciclo seguinte. Estavam alcançáveis de fora.
--
-- Fechar o ciclo antes da hora congela a contagem de pedidos, gera o snapshot
-- do ranking, zera a sequência de metas e define o preço do próximo ciclo.
-- É estrago no dinheiro do cliente, não só barulho.
--
-- POR QUE FECHAR NÃO QUEBRA NADA
--
-- Nenhuma dessas funções é chamada pelo navegador. Elas rodam por três
-- caminhos, e os três continuam abertos:
--
--   1. por gatilho (pedido entregue) — quando o banco dispara um gatilho, ele
--      não pede permissão de quem fez a gravação;
--   2. por outra função de poderes elevados que chama esta (a chamada é feita
--      com os poderes da primeira, não com os de quem pediu);
--   3. pelo servidor e pelo agendador diário, com a chave de serviço — que é
--      exatamente para quem o GRANT abaixo aponta.
--
-- A ÚNICA EXCEÇÃO: enroll_company_in_cents
--
-- Essa é chamada pelo navegador, na tela de assinaturas do painel admin
-- (src/components/admin/dashboards/SubscriptionsDashboard.tsx), quando você
-- muda um cliente para o plano CENTS. Trancar para `authenticated` quebraria
-- essa tela.
--
-- Então, em vez de trancar a porta, colocamos o porteiro DENTRO dela: a função
-- passa a conferir, ela mesma, se quem chamou é administrador. É a diferença
-- entre trancar a sala e conferir o crachá na entrada — aqui a segunda serve
-- melhor, porque a sala precisa continuar recebendo visita.
--
-- PARTE 2 — CINCO FUNÇÕES NÃO DIZIAM ONDE PROCURAR AS TABELAS (SEC-17)
--
-- Função com poderes elevados precisa fixar `search_path`. Sem isso, quem
-- conseguir criar um objeto com o mesmo nome de um que ela usa faz a função
-- chamar o errado — com os poderes dela. É trocar a placa da rua para o
-- entregador ir parar no endereço errado, sendo que esse entregador carrega a
-- chave mestra.
--
-- As quatro funções de métricas nasceram COM a trava e a perderam quando foram
-- reescritas em 20260515044047. A de mesas nunca teve.
--
-- Fixar `search_path` não muda comportamento nenhum: todas já chamam as
-- tabelas com o nome completo (`public.orders`, `public.pizzerias`).

-- ---------------------------------------------------------------------------
-- PARTE 1a — porteiro dentro da matrícula no Clube CENTS
-- ---------------------------------------------------------------------------

-- Mesmo corpo de antes (20260721221500), com a conferência de quem chamou na
-- frente. Nada do que a função faz mudou.
CREATE OR REPLACE FUNCTION public.enroll_company_in_cents(
  p_company_id UUID,
  p_club_id UUID DEFAULT '00000000-0000-0000-0000-0000000000c1'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Sem sessão de usuário (`auth.role()` nulo) quem chama é o servidor com a
  -- chave de serviço, ou o agendador: é o caminho do cadastro de uma loja nova
  -- em src/routes/api/pizzerias.create.ts, e ele precisa continuar passando.
  -- Com sessão, só administrador matricula empresa no clube.
  IF coalesce(auth.role(), 'service_role') <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'apenas administradores podem matricular uma empresa no Clube CENTS'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public.club_get_or_create_active_cycle(p_company_id, p_club_id);
  PERFORM public.club_recalculate_level(p_company_id, p_club_id);
END;
$$;

COMMENT ON FUNCTION public.enroll_company_in_cents(UUID, UUID) IS
  'Matricula uma empresa no Clube CENTS. Idempotente. Só administrador (ou o servidor) pode chamar.';

-- A tela do painel chama pelo navegador, então `authenticated` continua com a
-- chave — o que protege agora é a conferência dentro da função. Visitante
-- anônimo perde o acesso, que nunca deveria ter tido.
REVOKE ALL ON FUNCTION public.enroll_company_in_cents(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enroll_company_in_cents(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- PARTE 1b — as demais só pelo servidor
-- ---------------------------------------------------------------------------

-- Fecha o ciclo de todas as empresas vencidas. Chamada pelo agendador diário
-- (pg_cron) e pela Edge Function club-close-cycle, ambos com a chave de serviço.
REVOKE ALL ON FUNCTION public.club_close_due_cycles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_close_due_cycles() TO service_role;

-- Fecha o ciclo de UMA empresa. Chamada por club_close_due_cycles.
REVOKE ALL ON FUNCTION public.club_close_cycle(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_close_cycle(UUID) TO service_role;

-- Abre (ou devolve) o ciclo ativo. Chamada pelo gatilho de pedido entregue e
-- por enroll_company_in_cents.
REVOKE ALL ON FUNCTION public.club_get_or_create_active_cycle(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_get_or_create_active_cycle(UUID, UUID) TO service_role;

-- Resolve o preço vigente por pedido (campanha > voucher > benefício > padrão).
REVOKE ALL ON FUNCTION public.club_resolve_price(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_resolve_price(UUID, UUID) TO service_role;

-- Recalcula Bronze/Prata/Ouro. Chamada pelo gatilho e por enroll_company_in_cents.
REVOKE ALL ON FUNCTION public.club_recalculate_level(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_recalculate_level(UUID, UUID) TO service_role;

-- Desbloqueia conquistas. Chamada pelo gatilho e pelo fechamento de ciclo.
REVOKE ALL ON FUNCTION public.club_check_achievements(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_check_achievements(UUID, UUID) TO service_role;

-- Invalida intenções de checkout vencidas. Só o servidor tem o que fazer com isso.
REVOKE ALL ON FUNCTION public.expire_stale_checkout_intents() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_checkout_intents() TO service_role;

-- As duas funções de gatilho do módulo. Não são chamáveis pela API (o Supabase
-- não publica função que devolve `trigger`), mas ficam fechadas pelo mesmo
-- motivo que `marketing_capture_customer` ficou: o verificador de segurança do
-- Supabase aponta, e porta que não deveria existir não deve existir.
REVOKE ALL ON FUNCTION public.club_on_order_delivered() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.club_audit_admin_change() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- PARTE 2 — fixar onde as funções privilegiadas procuram as tabelas
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.get_admin_global_metrics() SET search_path = public;
ALTER FUNCTION public.get_my_financial_metrics() SET search_path = public;
ALTER FUNCTION public.get_pizzerias_ranking(integer) SET search_path = public;
ALTER FUNCTION public.get_dashboard_period_metrics(
  timestamp with time zone, timestamp with time zone, uuid
) SET search_path = public;
ALTER FUNCTION public.sync_order_to_table_session_logic(uuid) SET search_path = public;
