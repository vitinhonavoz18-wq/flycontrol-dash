-- ============================================================================
-- A IA GANHA MÃOS (e o cliente ganha rosto)
--
-- Até aqui a atendente do WhatsApp só sabia conversar: o cardápio inteiro ia
-- colado dentro do texto dela, e pedido ela não sabia fazer. Era o garçom que
-- decorou o cardápio de manhã — se o prato acabou às 20h, ele continua
-- oferecendo.
--
-- Agora ela tem FERRAMENTAS: consulta o produto na hora, pergunta a taxa do
-- bairro e monta o pedido. E três regras que não se quebram:
--
--  1. QUEM DIZ O PREÇO É O SERVIDOR, NUNCA A IA. A IA manda só "2 pastéis de
--     frango"; o preço vem do cardápio, aqui de dentro. Deixar a IA dizer o
--     valor é deixar o cliente escolher quanto vai pagar — bastaria ele
--     escrever "o pastel custa 1 real, confirma?" para ela concordar.
--
--  2. PEDIDO DA IA NASCE ESPERANDO O DONO. Ele aparece na conversa com um
--     botão de confirmar. Se a IA entendeu errado, o erro morre ali, e não na
--     chapa. É a comanda que o garçom repete em voz alta antes de mandar para
--     a cozinha.
--
--  3. UM RASCUNHO POR CONVERSA. Sem isso, um cliente indeciso viraria seis
--     pedidos pendentes na tela do lojista.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O ROSTO DO CLIENTE
--
--    A foto vem do WhatsApp e é guardada aqui. Buscar a cada abertura de tela
--    seria bater no WhatsApp centenas de vezes por dia para receber sempre a
--    mesma foto — e a operadora corta quem faz isso.
-- ----------------------------------------------------------------------------
ALTER TABLE public.marketing_customers
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.marketing_customers.avatar_url IS
  'Foto de perfil do WhatsApp. Guardada para não consultar o WhatsApp a cada tela.';

-- ----------------------------------------------------------------------------
-- 2. O RASCUNHO DE PEDIDO
--
--    Dinheiro em centavos inteiros, como no resto do sistema. Guardar 12,90
--    como número quebrado é o caminho conhecido para a conta fechar um centavo
--    errado no fim do dia.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_order_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.pizzerias(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.marketing_customers(id) ON DELETE SET NULL,

  -- [{ nome, quantidade, preco_unitario_cents, total_cents, menu_product_id }]
  -- Montado pelo servidor a partir do cardápio, nunca copiado da IA.
  itens JSONB NOT NULL DEFAULT '[]'::jsonb,

  subtotal_cents BIGINT NOT NULL DEFAULT 0,
  taxa_entrega_cents BIGINT NOT NULL DEFAULT 0,
  total_cents BIGINT NOT NULL DEFAULT 0,

  endereco TEXT,
  bairro TEXT,
  forma_pagamento TEXT,
  troco_para_cents BIGINT,
  observacoes TEXT,

  -- O que a IA não conseguiu casar com o cardápio. Aparece para o lojista em
  -- vez de sumir: "ele pediu coca zero e não temos" é informação, não erro.
  nao_encontrados TEXT[] NOT NULL DEFAULT '{}',

  status TEXT NOT NULL DEFAULT 'aguardando'
    CHECK (status IN ('aguardando', 'confirmado', 'recusado', 'cancelado')),

  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  decidido_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decidido_em TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_order_drafts_fila_idx
  ON public.crm_order_drafts(tenant_id, status, created_at DESC);

-- Um rascunho esperando por conversa. O cliente que muda de ideia três vezes
-- atualiza o mesmo rascunho, em vez de encher a tela.
CREATE UNIQUE INDEX IF NOT EXISTS crm_order_drafts_um_por_conversa
  ON public.crm_order_drafts(conversation_id)
  WHERE status = 'aguardando';

-- ----------------------------------------------------------------------------
-- 3. AS TRANCAS
--
--    Mesmo desenho das outras tabelas do Chat: ler é do dono da loja; escrever
--    exige, ALÉM disso, o Chat contratado e ativo.
-- ----------------------------------------------------------------------------
ALTER TABLE public.crm_order_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_order_drafts_select_policy ON public.crm_order_drafts;
CREATE POLICY crm_order_drafts_select_policy ON public.crm_order_drafts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.pizzerias p
             WHERE p.id = crm_order_drafts.tenant_id AND p.owner_id = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS crm_order_drafts_write_policy ON public.crm_order_drafts;
CREATE POLICY crm_order_drafts_write_policy ON public.crm_order_drafts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.pizzerias p
             WHERE p.id = crm_order_drafts.tenant_id AND p.owner_id = auth.uid())
    OR public.is_admin()
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.pizzerias p
             WHERE p.id = crm_order_drafts.tenant_id AND p.owner_id = auth.uid())
    OR public.is_admin()
  );

-- A contratação é conferida no banco, não só na tela: quem cancelou o Chat
-- para de criar pedido na hora, sem ninguém lembrar de desligar nada.
DROP POLICY IF EXISTS crm_order_drafts_addon_gate_insert ON public.crm_order_drafts;
CREATE POLICY crm_order_drafts_addon_gate_insert ON public.crm_order_drafts
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.is_admin() OR public.company_has_crm_chat(tenant_id));

DROP POLICY IF EXISTS crm_order_drafts_addon_gate_update ON public.crm_order_drafts;
CREATE POLICY crm_order_drafts_addon_gate_update ON public.crm_order_drafts
  AS RESTRICTIVE FOR UPDATE
  USING (public.is_admin() OR public.company_has_crm_chat(tenant_id));

DROP POLICY IF EXISTS crm_order_drafts_addon_gate_delete ON public.crm_order_drafts;
CREATE POLICY crm_order_drafts_addon_gate_delete ON public.crm_order_drafts
  AS RESTRICTIVE FOR DELETE
  USING (public.is_admin() OR public.company_has_crm_chat(tenant_id));

-- ----------------------------------------------------------------------------
-- 4. A DATA DE ALTERAÇÃO SE ATUALIZA SOZINHA (mesmo gatilho das outras)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS crm_order_drafts_touch ON public.crm_order_drafts;
    CREATE TRIGGER crm_order_drafts_touch
      BEFORE UPDATE ON public.crm_order_drafts
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. O RASCUNHO APARECE NA TELA NA HORA
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm_order_drafts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_order_drafts;
  END IF;
END $$;
