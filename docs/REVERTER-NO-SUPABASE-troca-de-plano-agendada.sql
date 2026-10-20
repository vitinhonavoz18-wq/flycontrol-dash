-- =============================================================================
-- REVERTER (SQL Editor) — troca de plano agendada (20261020120000)
--
-- Não apaga a tabela (apagar é destrutivo e desnecessário: o código antigo
-- simplesmente não a lê). O que esta reversão faz é DESARMAR as trocas
-- pendentes, para que nenhuma seja aplicada se o código novo continuar no ar
-- por algum tempo. O histórico fica guardado.
--
-- Ordem recomendada: 1) publicar de novo o código anterior; 2) rodar isto.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '10s';

UPDATE public.subscription_plan_changes
SET status = 'canceled',
    canceled_at = now(),
    updated_at = now(),
    note = coalesce(note || ' | ', '') || 'desarmada pela reversão de ' || now()::date
WHERE status IN ('scheduled', 'awaiting_team');

DO $pos$
DECLARE v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM public.subscription_plan_changes
   WHERE status IN ('scheduled', 'awaiting_team');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CONFERENCIA: ainda ha % troca(s) pendente(s)', v_count;
  END IF;
END $pos$;

COMMIT;

-- Trocas que JÁ foram aplicadas (status applied) não são desfeitas aqui: a
-- assinatura já está no plano novo e a fatura já saiu nele. Desfazer uma
-- delas é decisão caso a caso (ver relatório).
SELECT status, count(*) FROM public.subscription_plan_changes GROUP BY status;
