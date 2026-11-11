-- ══════════════════════════════════════════════════════════════════════════
-- VITRINE DO SITE — os alimentos que flutuam no topo da página inicial
-- ══════════════════════════════════════════════════════════════════════════
--
-- O topo da página pública passa a mostrar, um de cada vez, produtos de
-- verdade dos cardápios do FlyDelivery: hambúrguer, pizza, açaí, pastel...
--
-- POR QUE EXISTE UMA LISTA ESCOLHIDA, E NÃO "QUALQUER PRODUTO"
--
-- A foto pertence ao restaurante. Colocá-la na vitrine da plataforma é
-- divulgação — e só deve acontecer com produto que alguém da equipe olhou e
-- aprovou. Também protege contra o recorte que deu errado (meio lanche, borda
-- serrilhada) aparecer para todo visitante. É o cardápio da parede: alguém
-- escolhe as fotos que vão para lá.
--
-- Por isso:
--   • a equipe escolhe produtos (origem "manual", já aprovados) ou pede
--     sugestões automáticas (origem "automatica"), que esperam aprovação;
--   • a foto passa pelo recorte (scripts/vitrine-hero/preparar_vitrine.py);
--   • só aparece no site o que está aprovado, ligado e com recorte pronto.
--
-- O QUE O VISITANTE DO SITE CONSEGUE LER
--
-- Nada desta tabela diretamente. Ele só chama `hero_showcase_public()`, que
-- devolve o mínimo para desenhar a vitrine: nome do produto, tipo de comida e
-- o endereço da imagem recortada. Nome da loja, preço, quem cadastrou,
-- motivo de falha — nada disso sai.
--
-- NADA AQUI APAGA OU ALTERA DADO EXISTENTE. Só cria coisas novas.
-- Pode rodar mais de uma vez.

-- ── 1. A lista de destaques ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hero_showcase_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Se o produto for apagado do cardápio, o destaque sai junto.
  product_id        UUID NOT NULL REFERENCES public.menu_products(id) ON DELETE CASCADE,
  origin            TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'automatica')),
  approved          BOOLEAN NOT NULL DEFAULT false,
  enabled           BOOLEAN NOT NULL DEFAULT true,
  position          INTEGER NOT NULL DEFAULT 100,
  -- Tipo de comida (hamburguer, pizza, acai...) — serve para alternar tipos
  -- na vitrine em vez de mostrar três hambúrgueres seguidos.
  food_kind         TEXT,
  -- Nome mostrado para leitores de tela (texto alternativo da imagem).
  display_name      TEXT,
  status            TEXT NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente', 'processando', 'pronto', 'falhou')),
  status_detail     TEXT,
  attempts          INTEGER NOT NULL DEFAULT 0,
  -- A foto que foi recortada e a "impressão digital" dela: se a foto do
  -- produto não mudou, o recorte não é refeito.
  source_url        TEXT,
  source_hash       TEXT,
  -- O recorte fica num depósito separado; a foto original não é tocada.
  cutout_path       TEXT,
  cutout_path_small TEXT,
  cutout_width      INTEGER,
  cutout_height     INTEGER,
  -- Quanto da imagem recortada é comida (0..1). Usado para que uma pizza não
  -- apareça gigante ao lado de um pastel só porque a foto era maior.
  fill_ratio        NUMERIC(5, 4),
  quality           JSONB,
  processed_at      TIMESTAMPTZ,
  created_by        UUID DEFAULT auth.uid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hero_showcase_items_produto_unico UNIQUE (product_id)
);

CREATE INDEX IF NOT EXISTS hero_showcase_items_status_idx
  ON public.hero_showcase_items (status);

COMMENT ON TABLE public.hero_showcase_items IS
  'Produtos escolhidos para a vitrine animada do topo da página inicial. Só a equipe da plataforma edita.';

-- Data de alteração sempre certa, sem depender de quem escreve.
CREATE OR REPLACE FUNCTION public.hero_showcase_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hero_showcase_items_touch ON public.hero_showcase_items;
CREATE TRIGGER hero_showcase_items_touch
  BEFORE UPDATE ON public.hero_showcase_items
  FOR EACH ROW EXECUTE FUNCTION public.hero_showcase_touch();

-- ── 2. Quem mexe: só a equipe da plataforma ──────────────────────────────
ALTER TABLE public.hero_showcase_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hero_showcase_admin" ON public.hero_showcase_items;
CREATE POLICY "hero_showcase_admin" ON public.hero_showcase_items
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Visitante e lojista não leem a tabela: a porta deles é a função abaixo.
REVOKE ALL ON public.hero_showcase_items FROM anon;

-- ── 3. O que o site público lê ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hero_showcase_public()
RETURNS TABLE (
  id                UUID,
  nome              TEXT,
  tipo              TEXT,
  imagem            TEXT,
  imagem_pequena    TEXT,
  largura           INTEGER,
  altura            INTEGER,
  preenchimento     NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.id,
         COALESCE(NULLIF(h.display_name, ''), p.name),
         h.food_kind,
         h.cutout_path,
         h.cutout_path_small,
         h.cutout_width,
         h.cutout_height,
         h.fill_ratio
    FROM public.hero_showcase_items h
    JOIN public.menu_products p ON p.id = h.product_id
    JOIN public.pizzerias z ON z.id = p.pizzeria_id
   WHERE h.enabled
     AND h.approved
     AND h.status = 'pronto'
     AND h.cutout_path IS NOT NULL
     AND COALESCE(p.active, true)
     -- Loja descadastrada ou suspensa sai da vitrine na hora.
     AND COALESCE(z.is_active, true)
     AND z.status NOT IN ('deleted', 'inactive')
   ORDER BY (h.origin = 'manual') DESC, h.position, h.created_at
   LIMIT 12;
$$;

REVOKE ALL ON FUNCTION public.hero_showcase_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hero_showcase_public() TO anon, authenticated, service_role;

-- ── 4. Sugestões automáticas (só para a equipe) ──────────────────────────
--
-- Devolve produtos que PODERIAM ir para a vitrine: ativos, disponíveis, com
-- foto, de loja ativa, que não são bebida e que ainda não estão na lista.
-- A ordem já alterna categorias: primeiro um produto de cada categoria, depois
-- o segundo de cada uma, e assim por diante. A qualidade da foto só é medida
-- de verdade no recorte — sugestão ruim é recusada lá, com o motivo.
CREATE OR REPLACE FUNCTION public.hero_showcase_candidates(p_limit INTEGER DEFAULT 24)
RETURNS TABLE (
  product_id  UUID,
  nome        TEXT,
  categoria   TEXT,
  loja        TEXT,
  imagem      TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Somente a equipe da plataforma pode ver sugestões da vitrine.'
      USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT s.product_id, s.nome, s.categoria, s.loja, s.imagem
    FROM (
      SELECT p.id   AS product_id,
             p.name AS nome,
             COALESCE(c.name, '') AS categoria,
             z.name AS loja,
             p.image_url AS imagem,
             row_number() OVER (
               PARTITION BY lower(COALESCE(c.name, ''))
               ORDER BY p.updated_at DESC NULLS LAST, p.id
             ) AS ordem_na_categoria
        FROM public.menu_products p
        JOIN public.pizzerias z ON z.id = p.pizzeria_id
        LEFT JOIN public.menu_categories c ON c.id = p.category_id
       WHERE COALESCE(p.active, true)
         AND COALESCE(p.available, true)
         AND NULLIF(btrim(p.image_url), '') IS NOT NULL
         AND COALESCE(p.product_type, '') <> 'beverage'
         AND COALESCE(z.is_active, true)
         AND z.status NOT IN ('deleted', 'inactive')
         AND NOT EXISTS (
           SELECT 1 FROM public.hero_showcase_items h WHERE h.product_id = p.id
         )
    ) s
   ORDER BY s.ordem_na_categoria, s.categoria, s.nome
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 60);
END;
$$;

REVOKE ALL ON FUNCTION public.hero_showcase_candidates(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hero_showcase_candidates(INTEGER) TO authenticated;

-- ── 5. A fila do recorte (só para o processo automático) ─────────────────
--
-- Reserva até `p_limit` destaques para recortar:
--   • os pendentes (acabaram de ser escolhidos ou foram mandados refazer);
--   • os que travaram no meio há mais de 30 minutos;
--   • os prontos cuja FOTO DO PRODUTO MUDOU no cardápio — assim a vitrine
--     acompanha a foto nova sem ninguém precisar lembrar.
-- `FOR UPDATE SKIP LOCKED` garante que duas execuções ao mesmo tempo não
-- peguem o mesmo item — cada cozinheiro pega uma comanda diferente.
CREATE OR REPLACE FUNCTION public.hero_showcase_claim(p_limit INTEGER DEFAULT 8)
RETURNS TABLE (
  id           UUID,
  product_id   UUID,
  image_url    TEXT,
  source_hash  TEXT,
  cutout_path  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH escolhidos AS (
    SELECT h.id
      FROM public.hero_showcase_items h
      JOIN public.menu_products p ON p.id = h.product_id
     WHERE h.status = 'pendente'
        OR (h.status = 'processando' AND h.updated_at < now() - interval '30 minutes')
        OR (h.status = 'pronto' AND p.image_url IS DISTINCT FROM h.source_url)
     ORDER BY h.created_at
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 50)
     FOR UPDATE OF h SKIP LOCKED
  )
  UPDATE public.hero_showcase_items h
     SET status = 'processando',
         attempts = h.attempts + 1
    FROM escolhidos e, public.menu_products p
   WHERE h.id = e.id
     AND p.id = h.product_id
  RETURNING h.id, h.product_id, p.image_url, h.source_hash, h.cutout_path;
END;
$$;

REVOKE ALL ON FUNCTION public.hero_showcase_claim(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hero_showcase_claim(INTEGER) TO service_role;

-- Só conta quantos esperam recorte, sem reservar nada. O processo automático
-- pergunta isto primeiro: se a resposta for zero, ele termina em segundos,
-- sem baixar o modelo de recorte.
CREATE OR REPLACE FUNCTION public.hero_showcase_pending_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::INTEGER
    FROM public.hero_showcase_items h
    JOIN public.menu_products p ON p.id = h.product_id
   WHERE h.status = 'pendente'
      OR (h.status = 'processando' AND h.updated_at < now() - interval '30 minutes')
      OR (h.status = 'pronto' AND p.image_url IS DISTINCT FROM h.source_url);
$$;

REVOKE ALL ON FUNCTION public.hero_showcase_pending_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hero_showcase_pending_count() TO service_role;

-- ── 6. O depósito dos recortes ───────────────────────────────────────────
--
-- Público para LEITURA (o site precisa mostrar a imagem). Gravar, só o
-- processo do recorte, que usa a chave de serviço — sem regra de escrita
-- para mais ninguém.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('hero-showcase', 'hero-showcase', true, 5242880, ARRAY['image/webp', 'image/png'])
ON CONFLICT (id) DO NOTHING;
