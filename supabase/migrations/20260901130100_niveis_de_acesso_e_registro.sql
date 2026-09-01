-- ============================================================================
-- NÍVEIS DE ACESSO E LIVRO DE REGISTRO
-- ============================================================================
--
-- DOIS PROBLEMAS QUE ESTA MIGRAÇÃO RESOLVE
--
-- 1) Hoje só existem dois crachás: "dono de uma loja" e "administrador da
--    plataforma". E administrador pode TUDO — ver o faturamento de todo mundo,
--    apagar usuário, confirmar pagamento, excluir loja. Não dá para colocar
--    alguém no suporte sem entregar junto a chave do cofre.
--
--    É a chave-mestra do prédio dada ao porteiro da noite: ele precisava
--    abrir a portaria, e recebeu junto o acesso a todos os apartamentos.
--
--    Agora cada administrador recebe as chaves de que precisa, uma a uma.
--
-- 2) Não existia um caderno único dizendo quem fez o quê. Havia registro de
--    cobrança, registro de fidelidade e registro de exclusão de loja — três
--    cadernos separados, cada um de um assunto, e nada para o resto.
--
--    Agora existe um livro só: toda mexida nas coisas que importam fica
--    registrada com o nome de quem fez, a hora, e o antes e o depois.
--
--    O registro é feito PELO BANCO, não pela tela. É a diferença entre a
--    câmera do caixa e o funcionário anotando num papel: a câmera pega tudo,
--    inclusive o que ninguém anotou. Não importa se a alteração veio do
--    painel, do celular ou de uma chamada direta — cai no livro do mesmo jeito.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- PARTE 1 — AS CHAVES, UMA A UMA
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Qual chave. Texto livre de propósito: uma chave nova é uma linha, não uma
  -- migração de banco.
  permission TEXT NOT NULL,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A mesma chave duas vezes para a mesma pessoa não significa nada.
  UNIQUE (user_id, permission)
);

COMMENT ON TABLE public.admin_permissions IS
  'Chaves individuais de administrador. Quem é super_admin tem todas por definição e não precisa de linha aqui.';

ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

-- Cada um vê as próprias chaves; só o super_admin vê e mexe nas dos outros.
-- Sem isso, um administrador de suporte poderia se dar a chave do financeiro —
-- que é o mesmo que deixar o molho de chaves em cima do balcão da portaria.
DROP POLICY IF EXISTS "admin_permissions_leitura" ON public.admin_permissions;
CREATE POLICY "admin_permissions_leitura" ON public.admin_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "admin_permissions_gestao" ON public.admin_permissions;
CREATE POLICY "admin_permissions_gestao" ON public.admin_permissions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.admin_permissions TO authenticated;
GRANT ALL ON public.admin_permissions TO service_role;

/**
 * A pergunta que todo lugar sensível passa a fazer: "esta pessoa tem a chave
 * de tal coisa?"
 *
 * O super_admin responde sim para tudo — é o dono do prédio. Os demais
 * respondem sim só para as chaves que receberam.
 *
 * Ter UMA função só é o que impede a regra de divergir: se amanhã a definição
 * mudar, muda aqui e vale em todo canto ao mesmo tempo.
 */
CREATE OR REPLACE FUNCTION public.tem_permissao(p_permissao TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.user_id = auth.uid() AND ap.permission = p_permissao
      );
$$;

COMMENT ON FUNCTION public.tem_permissao(TEXT) IS
  'Confere uma chave específica. super_admin tem todas; os demais, só o que foi concedido.';

REVOKE EXECUTE ON FUNCTION public.tem_permissao(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.tem_permissao(TEXT) TO authenticated, service_role;

-- As chaves que existem hoje. Ficam registradas numa tabela para a tela do
-- administrador poder listá-las com o nome em português, sem repetir a lista
-- dentro do código.
CREATE TABLE IF NOT EXISTS public.admin_permission_catalog (
  permission TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  descricao TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 100
);

INSERT INTO public.admin_permission_catalog (permission, label, descricao, ordem) VALUES
  ('ver_financeiro',       'Ver o financeiro',
   'Enxergar faturamento, faturas e o caixa da plataforma.', 10),
  ('confirmar_pagamento',  'Confirmar pagamento',
   'Ativar, suspender ou reativar a assinatura de um cliente — ou seja, ligar e desligar o acesso dele.', 20),
  ('apagar_usuario',       'Apagar usuário',
   'Excluir a conta de uma pessoa e bloquear o e-mail dela.', 30),
  ('apagar_loja',          'Apagar loja',
   'Descadastrar ou excluir definitivamente um estabelecimento e tudo que é dele.', 40),
  ('redefinir_senha',      'Redefinir senha de terceiros',
   'Trocar a senha da conta de outra pessoa.', 50),
  ('gerenciar_templates',  'Gerenciar modelos e cardápios',
   'Criar, alterar e excluir modelos de cardápio e de mensagem usados pelas lojas.', 60),
  ('ver_dados_pessoais',   'Ver dados pessoais',
   'Enxergar telefone, e-mail e endereço de clientes finais.', 70),
  ('gerenciar_lojas',      'Gerenciar lojas',
   'Criar lojas, trocar plano e mexer nas configurações de um estabelecimento.', 80)
ON CONFLICT (permission) DO UPDATE
  SET label = EXCLUDED.label, descricao = EXCLUDED.descricao, ordem = EXCLUDED.ordem;

ALTER TABLE public.admin_permission_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalogo_leitura_autenticado" ON public.admin_permission_catalog;
CREATE POLICY "catalogo_leitura_autenticado" ON public.admin_permission_catalog
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.admin_permission_catalog TO authenticated;
GRANT ALL ON public.admin_permission_catalog TO service_role;


-- ---------------------------------------------------------------------------
-- PARTE 2 — O LIVRO DE REGISTRO
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id BIGSERIAL PRIMARY KEY,
  -- Quem. Fica NULO quando a ação foi do robô interno (fechamento de ciclo,
  -- webhook de pagamento) — e aí `origem` diz qual robô foi.
  user_id UUID,
  user_email TEXT,
  origem TEXT NOT NULL DEFAULT 'painel',
  -- O quê: 'criou', 'alterou', 'apagou'.
  acao TEXT NOT NULL,
  -- Em quê: nome da tabela e identificador da linha.
  entidade TEXT NOT NULL,
  entidade_id TEXT,
  -- De qual loja, quando dá para saber. É o que permite o dono ver o próprio
  -- histórico sem enxergar o dos outros.
  tenant_id UUID,
  -- O antes e o depois, só dos campos que realmente mudaram. Guardar a linha
  -- inteira encheria o banco de repetição e ainda esconderia a mudança no meio
  -- de trinta colunas iguais.
  mudancas JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.activity_logs IS
  'Livro único de registro: quem mexeu, no quê, quando, e o que mudou.';

CREATE INDEX IF NOT EXISTS activity_logs_tenant_idx ON public.activity_logs (tenant_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS activity_logs_user_idx ON public.activity_logs (user_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS activity_logs_entidade_idx ON public.activity_logs (entidade, entidade_id, criado_em DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Quem pode LER o livro: administrador com a chave do financeiro/auditoria vê
-- tudo; o dono de uma loja vê o que aconteceu na loja dele.
DROP POLICY IF EXISTS "activity_logs_leitura" ON public.activity_logs;
CREATE POLICY "activity_logs_leitura" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (tenant_id IS NOT NULL AND public.owns_pizzeria(auth.uid(), tenant_id))
  );

-- Ninguém ESCREVE no livro pela mão: nem apaga, nem corrige, nem inventa
-- linha. Só os gatilhos do banco escrevem, e eles rodam por baixo das
-- políticas. Um livro de registro que o próprio suspeito pode editar não é
-- registro nenhum — é rascunho.
GRANT SELECT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;

/**
 * O escrivão.
 *
 * Roda depois de cada criação, alteração ou exclusão nas tabelas vigiadas, e
 * anota só o que mudou de fato. Uma atualização que não muda nada não vira
 * linha no livro — senão o livro enche de "fulano salvou sem alterar nada".
 *
 * Campos de senha nunca entram, nem o valor antigo nem o novo: o livro registra
 * QUE a senha foi trocada, jamais QUAL é. E chave de API idem.
 *
 * Se o escrivão falhar por qualquer motivo, a operação original segue em
 * frente. Vale a mesma regra do motor de cobrança: um problema de registro não
 * pode impedir o restaurante de trabalhar.
 */
CREATE OR REPLACE FUNCTION public.registrar_atividade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_antes JSONB;
  v_depois JSONB;
  v_mudancas JSONB := '{}'::jsonb;
  v_chave TEXT;
  v_acao TEXT;
  v_id TEXT;
  v_tenant UUID;
  v_user UUID;
  v_email TEXT;
  v_origem TEXT;
  -- Nunca guardados: valor de senha, hash e chave de API.
  v_segredos TEXT[] := ARRAY[
    'password', 'password_hash', 'senha', 'api_key', 'token',
    'public_token', 'customer_token', 'token_hash', 'secret'
  ];
BEGIN
  v_user := auth.uid();

  IF v_user IS NULL THEN
    v_origem := 'servidor';
  ELSE
    v_origem := 'painel';
    SELECT email INTO v_email FROM auth.users WHERE id = v_user;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_acao := 'apagou';
    v_antes := to_jsonb(OLD);
    v_depois := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_acao := 'criou';
    v_antes := NULL;
    v_depois := to_jsonb(NEW);
  ELSE
    v_acao := 'alterou';
    v_antes := to_jsonb(OLD);
    v_depois := to_jsonb(NEW);
  END IF;

  -- Só os campos que mudaram. Segredo vira a palavra "(alterado)": o livro
  -- diz que mexeram na senha, sem nunca dizer qual é.
  IF TG_OP = 'UPDATE' THEN
    FOR v_chave IN SELECT jsonb_object_keys(v_depois) LOOP
      IF v_antes -> v_chave IS DISTINCT FROM v_depois -> v_chave THEN
        IF v_chave = ANY (v_segredos) THEN
          v_mudancas := v_mudancas || jsonb_build_object(
            v_chave, jsonb_build_object('de', '(oculto)', 'para', '(alterado)'));
        ELSE
          v_mudancas := v_mudancas || jsonb_build_object(
            v_chave, jsonb_build_object('de', v_antes -> v_chave, 'para', v_depois -> v_chave));
        END IF;
      END IF;
    END LOOP;

    -- Nada mudou de verdade: não gera linha.
    IF v_mudancas = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  ELSE
    v_mudancas := jsonb_build_object(
      CASE WHEN TG_OP = 'DELETE' THEN 'apagado' ELSE 'criado' END,
      -- Na criação/exclusão guardamos a linha, mas com os segredos raspados.
      (SELECT coalesce(jsonb_object_agg(
                 k, CASE WHEN k = ANY (v_segredos) THEN '"(oculto)"'::jsonb ELSE v END), '{}'::jsonb)
       FROM jsonb_each(coalesce(v_depois, v_antes)) AS t(k, v))
    );
  END IF;

  -- O identificador da linha e a loja a que ela pertence, quando existem.
  v_id := coalesce(v_depois ->> 'id', v_antes ->> 'id');
  v_tenant := NULLIF(coalesce(
    v_depois ->> 'tenant_id', v_antes ->> 'tenant_id',
    v_depois ->> 'company_id', v_antes ->> 'company_id',
    v_depois ->> 'restaurant_id', v_antes ->> 'restaurant_id',
    CASE WHEN TG_TABLE_NAME = 'pizzerias' THEN coalesce(v_depois ->> 'id', v_antes ->> 'id') END
  ), '')::UUID;

  INSERT INTO public.activity_logs (
    user_id, user_email, origem, acao, entidade, entidade_id, tenant_id, mudancas
  ) VALUES (
    v_user, v_email, v_origem, v_acao, TG_TABLE_NAME, v_id, v_tenant, v_mudancas
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

EXCEPTION WHEN OTHERS THEN
  -- Falhar o registro nunca pode derrubar a operação de quem está trabalhando.
  RAISE WARNING '[registro] não foi possível anotar % em %: %', TG_OP, TG_TABLE_NAME, SQLERRM;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

COMMENT ON FUNCTION public.registrar_atividade() IS
  'Escrivão do livro de registro. Anota só o que mudou e nunca grava senha nem chave.';

REVOKE EXECUTE ON FUNCTION public.registrar_atividade() FROM anon, authenticated, public;


-- As tabelas vigiadas. Ficam de fora, de propósito, `orders` e as tabelas de
-- eventos: um restaurante movimentado gera milhares de pedidos por dia, e o
-- livro viraria uma fita de caixa impossível de ler. Pedido já tem histórico
-- próprio (`order_status_history`) e registro de cobrança (`usage_events`).
DO $$
DECLARE
  v_tabela TEXT;
  v_vigiadas TEXT[] := ARRAY[
    'pizzerias',            -- a loja: plano, status, configuração, exclusão
    'subscriptions',        -- a assinatura: ativação, suspensão, cancelamento
    'user_roles',           -- quem virou administrador
    'admin_permissions',    -- quem ganhou ou perdeu qual chave
    'waiters',              -- criação, desativação e troca de senha de garçom
    'invoices',             -- faturas emitidas e baixadas
    'payment_transactions', -- cobranças e confirmações de pagamento
    'billing_cycles',       -- ciclos de 30 dias abertos e fechados
    'blocked_emails',       -- e-mails bloqueados
    'profiles'              -- dados cadastrais das pessoas
  ];
BEGIN
  FOREACH v_tabela IN ARRAY v_vigiadas LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_tabela
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_registro_%I ON public.%I', v_tabela, v_tabela);
      EXECUTE format(
        'CREATE TRIGGER trg_registro_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.registrar_atividade()',
        v_tabela, v_tabela);
    END IF;
  END LOOP;
END $$;
