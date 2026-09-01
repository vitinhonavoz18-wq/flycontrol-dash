-- Reaplicação do período gratuito, parte 2: a porta que concede os 30 dias.
-- Continuação de 20260901171347.

CREATE OR REPLACE FUNCTION public.start_free_trial(
  p_subscription_id UUID,
  p_owner_email TEXT,
  p_document TEXT DEFAULT NULL,
  p_duration_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_email TEXT;
  v_document TEXT;
  v_start TIMESTAMPTZ := now();
  v_end TIMESTAMPTZ;
  v_cycle_id UUID;
  v_existing RECORD;
  v_written INTEGER;
BEGIN
  IF p_duration_days IS NULL OR p_duration_days <= 0 THEN
    p_duration_days := 30;
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'subscription_not_found');
  END IF;

  -- Ja esta no periodo gratuito: repetir a chamada devolve o mesmo estado em
  -- vez de comecar tudo de novo. Clique duplo e reenvio de formulario nao
  -- podem render 60 dias.
  IF v_sub.status = 'free_trial' AND v_sub.trial_ends_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'granted', true,
      'already_granted', true,
      'trial_started_at', v_sub.trial_started_at,
      'trial_ends_at', v_sub.trial_ends_at
    );
  END IF;

  -- Assinatura que ja passou do comeco nao volta para o gratuito.
  IF v_sub.status NOT IN ('pending_activation', 'pending_payment') THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'subscription_not_eligible');
  END IF;

  v_email := lower(btrim(coalesce(p_owner_email, '')));
  IF v_email = '' THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'missing_email');
  END IF;

  v_document := nullif(regexp_replace(coalesce(p_document, ''), '[^0-9]', '', 'g'), '');
  v_end := v_start + (p_duration_days || ' days')::INTERVAL;

  -- Escreve no caderno. O indice unico e quem decide: se este e-mail, este
  -- documento ou esta empresa ja ganharam 30 dias, a linha nao entra.
  BEGIN
    INSERT INTO public.trial_grants (
      company_id, subscription_id, owner_user_id, owner_email_normalized,
      document_digits, trial_started_at, trial_ends_at
    )
    SELECT v_sub.company_id, v_sub.id, pz.owner_id, v_email,
           v_document, v_start, v_end
    FROM public.pizzerias pz
    WHERE pz.id = v_sub.company_id;

    GET DIAGNOSTICS v_written = ROW_COUNT;
    IF v_written = 0 THEN
      -- Sem estabelecimento nao ha o que liberar. Melhor recusar do que
      -- conceder um trial sem registro no caderno.
      RETURN jsonb_build_object('granted', false, 'reason', 'company_not_found');
    END IF;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.trial_grants
    WHERE company_id = v_sub.company_id
       OR owner_email_normalized = v_email
       OR (v_document IS NOT NULL AND document_digits = v_document)
    LIMIT 1;

    RETURN jsonb_build_object(
      'granted', false,
      'reason', 'trial_already_used',
      'previous_trial_ends_at', v_existing.trial_ends_at
    );
  END;

  UPDATE public.subscriptions
  SET status = 'free_trial',
      activated_at = coalesce(activated_at, v_start),
      trial_started_at = v_start,
      trial_ends_at = v_end,
      billing_anchor_day = EXTRACT(DAY FROM v_end)::SMALLINT,
      -- Nada e cobrado no periodo gratuito. A primeira cobranca so aparece
      -- quando o ciclo de uso fechar, e essa data e escrita la.
      first_charge_at = NULL,
      updated_at = now()
  WHERE id = p_subscription_id;

  UPDATE public.pizzerias
  SET subscription_status = 'free_trial'
  WHERE id = v_sub.company_id;

  v_cycle_id := public.open_billing_cycle(
    p_subscription_id := p_subscription_id,
    p_cycle_start := v_start,
    p_unit_price_cents := 0,
    p_qualified_from_previous := false,
    p_cycle_type := 'free_trial',
    p_duration_days := p_duration_days
  );

  INSERT INTO public.subscription_events (
    subscription_id, company_id, event_type, previous_status, new_status, reason, metadata
  ) VALUES (
    p_subscription_id, v_sub.company_id, 'free_trial_started',
    v_sub.status, 'free_trial',
    'Periodo gratuito de ' || p_duration_days || ' dias concedido no cadastro',
    jsonb_build_object(
      'trial_started_at', v_start,
      'trial_ends_at', v_end,
      'billing_cycle_id', v_cycle_id,
      'duration_days', p_duration_days
    )
  );

  RETURN jsonb_build_object(
    'granted', true,
    'already_granted', false,
    'trial_started_at', v_start,
    'trial_ends_at', v_end,
    'billing_cycle_id', v_cycle_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_free_trial(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_free_trial(UUID, TEXT, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.start_free_trial(UUID, TEXT, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.start_free_trial(UUID, TEXT, TEXT, INTEGER) TO service_role;

-- O abridor de ciclo tambem nao e assunto do navegador.
REVOKE ALL ON FUNCTION public.open_billing_cycle(UUID, TIMESTAMPTZ, BIGINT, BOOLEAN, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_billing_cycle(UUID, TIMESTAMPTZ, BIGINT, BOOLEAN, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.open_billing_cycle(UUID, TIMESTAMPTZ, BIGINT, BOOLEAN, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.open_billing_cycle(UUID, TIMESTAMPTZ, BIGINT, BOOLEAN, TEXT, INTEGER) TO service_role;
