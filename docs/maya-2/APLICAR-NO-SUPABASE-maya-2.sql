-- ═══════════════════════════════════════════════════════════════════════════
-- MAYA 2.0 — tabelas do atendimento do próprio FlyControl
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O QUE ISTO FAZ
--
-- Cria 4 tabelas NOVAS. Não altera, não apaga e não lê nenhuma tabela que já
-- existe. Pode rodar mais de uma vez sem estragar nada.
--
--   maya_conversas  → uma linha por contato: a MAYA está livre ou pausada
--                     (equipe conduzindo)? pediu para parar? o que já se sabe
--                     do lead (segmento, volume, plano de interesse)?
--   maya_mensagens  → o que o cliente, a MAYA e a equipe escreveram. O número
--                     da mensagem no WhatsApp é ÚNICO: se o n8n entregar o
--                     mesmo recado duas vezes, a segunda é recusada pelo banco
--                     — e a MAYA não responde duas vezes.
--   maya_turnos     → cada vez que a MAYA pensou: qual versão das instruções
--                     usou, o que decidiu, se o conferente precisou corrigir,
--                     quanto tempo levou. É o "caixa-preta" do atendimento.
--   maya_eventos    → transferências para a equipe, pausas, opt-outs.
--
-- QUEM CONSEGUE LER
--
-- Só o servidor do FlyControl (chave de serviço) e o super_admin logado.
-- RLS ligada e nenhuma regra para o público: pelo navegador, um visitante
-- não lê uma linha. Lojistas também não — isto é do FlyControl, não deles.
--
-- COMO APLICAR: Supabase → SQL Editor → colar tudo → Run.
-- COMO DESFAZER: docs/maya-2/REVERTER-NO-SUPABASE-maya-2.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.maya_conversas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canal          TEXT NOT NULL CHECK (canal IN ('whatsapp', 'instagram', 'site')),
  contato        TEXT NOT NULL CHECK (length(contato) BETWEEN 3 AND 64),
  nome           TEXT CHECK (nome IS NULL OR length(nome) <= 120),
  humano_ate     TIMESTAMPTZ,
  opt_out_em     TIMESTAMPTZ,
  apresentou_em  TIMESTAMPTZ,
  ficha          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Um contato = uma conversa por canal. Duas mensagens chegando juntas não
  -- criam duas fichas para a mesma pessoa.
  CONSTRAINT maya_conversas_um_por_contato UNIQUE (canal, contato)
);

CREATE TABLE IF NOT EXISTS public.maya_turnos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id         UUID NOT NULL REFERENCES public.maya_conversas(id) ON DELETE CASCADE,
  ultima_mensagem_id  UUID NOT NULL,
  status              TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'respondido')),
  modo                TEXT NOT NULL CHECK (modo IN ('sombra', 'ativo')),
  versao_prompt       TEXT NOT NULL,
  versao_comercial    TEXT NOT NULL,
  volumes             JSONB NOT NULL DEFAULT '[]'::jsonb,
  intencao            TEXT,
  proxima_acao        TEXT,
  precisa_humano      BOOLEAN,
  substituida         BOOLEAN,
  alertas             JSONB NOT NULL DEFAULT '[]'::jsonb,
  latencia_ms         INT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  respondido_em       TIMESTAMPTZ,
  -- Um turno por "última mensagem": o n8n repetindo o pedido não faz a MAYA
  -- pensar (e responder) duas vezes.
  CONSTRAINT maya_turnos_um_por_mensagem UNIQUE (ultima_mensagem_id)
);

CREATE TABLE IF NOT EXISTS public.maya_mensagens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id  UUID NOT NULL REFERENCES public.maya_conversas(id) ON DELETE CASCADE,
  autor        TEXT NOT NULL CHECK (autor IN ('cliente', 'maya', 'equipe')),
  texto        TEXT NOT NULL DEFAULT '' CHECK (length(texto) <= 8000),
  external_id  TEXT,
  turno_id     UUID REFERENCES public.maya_turnos(id) ON DELETE SET NULL,
  modo         TEXT NOT NULL CHECK (modo IN ('sombra', 'ativo')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- O mesmo recado do WhatsApp só entra uma vez (mensagens sem número, como as
-- da própria MAYA, ficam de fora da regra).
CREATE UNIQUE INDEX IF NOT EXISTS maya_mensagens_external_id_unico
  ON public.maya_mensagens (conversa_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS maya_mensagens_conversa_idx
  ON public.maya_mensagens (conversa_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.maya_eventos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id  UUID NOT NULL REFERENCES public.maya_conversas(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL CHECK (tipo IN (
                 'transferencia', 'pausa_equipe', 'liberada_pela_equipe',
                 'opt_out', 'resposta_bloqueada', 'anti_loop')),
  detalhe      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maya_eventos_tipo_idx ON public.maya_eventos (tipo, created_at DESC);
CREATE INDEX IF NOT EXISTS maya_turnos_data_idx ON public.maya_turnos (created_at DESC);

-- ── Tranca: só servidor e super_admin ──────────────────────────────────────
ALTER TABLE public.maya_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maya_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maya_turnos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maya_eventos   ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.maya_conversas, public.maya_mensagens, public.maya_turnos, public.maya_eventos
  FROM anon, authenticated;
GRANT SELECT ON public.maya_conversas, public.maya_mensagens, public.maya_turnos, public.maya_eventos
  TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['maya_conversas', 'maya_mensagens', 'maya_turnos', 'maya_eventos'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_super_admin_le', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''super_admin''))',
      t || '_super_admin_le', t);
  END LOOP;
END $$;

COMMENT ON TABLE public.maya_conversas IS 'MAYA 2.0: estado de cada contato do atendimento do FlyControl (pausa humana, opt-out, ficha do lead).';
COMMENT ON TABLE public.maya_turnos IS 'MAYA 2.0: cada resposta da IA, com versão das instruções, decisão e correções do conferente.';
