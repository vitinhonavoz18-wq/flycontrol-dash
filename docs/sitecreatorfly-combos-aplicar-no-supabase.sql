-- =====================================================================
-- APLICAR NO SUPABASE DO SITECREATORFLY (projeto SITECREATORFLY),
-- não no do FlyControl.
--
-- JÁ FOI APLICADO em 11/09/2026. Este arquivo fica como registro, porque
-- o repositório do SiteCreatorFly não vive junto com o do FlyControl e o
-- histórico dessa mudança se perderia.
--
-- POR QUE ISTO EXISTE
--
-- Criar um combo no painel falhava com:
--   "Could not find the 'available_days' column of 'combos' in the
--    schema cache"
--
-- A mensagem apontava para o lugar errado. A tabela `combos` do FlyControl
-- sempre teve essa coluna. Quem recusava era o SITE: o painel manda o combo
-- para cá antes de salvar, e esta tabela não tinha onde guardar descrição,
-- foto, preço original, dias da semana nem horário. Como o cadastro era
-- recusado inteiro, nenhum combo jamais chegou ao site — a tabela estava
-- zerada.
--
-- É o pedido chegando num formulário com menos campos do que o cliente
-- preencheu: falta espaço para metade da informação, e o pedido inteiro
-- volta recusado em vez de entrar pela metade.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Os campos que o painel envia e o site não guardava
-- ---------------------------------------------------------------------
ALTER TABLE public.combos ADD COLUMN IF NOT EXISTS description    text;
ALTER TABLE public.combos ADD COLUMN IF NOT EXISTS image_url      text;
ALTER TABLE public.combos ADD COLUMN IF NOT EXISTS original_price numeric;
ALTER TABLE public.combos ADD COLUMN IF NOT EXISTS start_time     time;
ALTER TABLE public.combos ADD COLUMN IF NOT EXISTS end_time       time;

-- Mesmo vocabulário do painel: seg/ter/qua/qui/sex/sab/dom.
-- Padrão "todos os dias" para combo já existente não sumir do cardápio.
ALTER TABLE public.combos ADD COLUMN IF NOT EXISTS available_days text[]
  DEFAULT ARRAY['seg','ter','qua','qui','sex','sab','dom']::text[];

-- ---------------------------------------------------------------------
-- 2. O grupo deixa de ser obrigatório na entrada
--
-- O site organiza combos em grupos; o painel não tem esse conceito e nunca
-- envia um. A coluna era obrigatória, então todo combo vindo de fora era
-- recusado antes mesmo de ser lido.
-- ---------------------------------------------------------------------
ALTER TABLE public.combos ALTER COLUMN group_id DROP NOT NULL;

-- ---------------------------------------------------------------------
-- 3. Quem não traz grupo, ganha um
--
-- É o garçom levando para a mesa livre quando o cliente chega sem reserva,
-- em vez de mandar embora por não estar na lista.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.combos_preenche_grupo_padrao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  IF NEW.group_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_group_id
  FROM public.combo_groups
  WHERE restaurant_id = NEW.restaurant_id
  ORDER BY sort_order, created_at
  LIMIT 1;

  IF v_group_id IS NULL THEN
    INSERT INTO public.combo_groups (restaurant_id, title, sort_order)
    VALUES (NEW.restaurant_id, 'Combos', 0)
    RETURNING id INTO v_group_id;
  END IF;

  NEW.group_id := v_group_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS combos_preenche_grupo_padrao ON public.combos;
CREATE TRIGGER combos_preenche_grupo_padrao
  BEFORE INSERT ON public.combos
  FOR EACH ROW
  EXECUTE FUNCTION public.combos_preenche_grupo_padrao();

-- ---------------------------------------------------------------------
-- 4. Fazer a API reler o formato da tabela
--
-- Sem isto a API continua respondendo pelo desenho antigo por alguns
-- minutos, como o garçom usando o cardápio da semana passada.
-- ---------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- IMPORTANTE PARA QUEM FOR MEXER NO PAINEL DEPOIS
--
-- A API do SiteCreatorFly RECEBE os nomes do painel (combo_price, active,
-- highlight) e ela mesma traduz para os nomes das colunas daqui (price,
-- is_active, is_highlighted). É assim que produto e categoria já
-- sincronizam — 379 itens e 15 categorias no ar provam isso.
--
-- Ou seja: NÃO renomeie os campos em src/utils/menuSync.ts para os nomes
-- das colunas deste banco. Parece a correção certa e quebra a integração
-- inteira. Há teste em menuSync.test.ts travando esse contrato.
--
-- =====================================================================
-- O QUE AINDA FALTA NO SITE (não dá para fazer daqui)
--
-- 1. EXIBIÇÃO. Agora o site GUARDA dias e horários, mas quem decide o que
--    aparece na tela do cliente é o código do SiteCreatorFly. Enquanto ele
--    não ler available_days / start_time / end_time, um combo marcado para
--    "sex, sáb, dom das 18h às 23h" fica salvo certo e continua aparecendo
--    todos os dias. Mesma coisa para original_price: o dado do "de R$ 90
--    por R$ 50" já chega, mas o preço riscado só aparece quando a tela usar
--    o campo.
--
-- 2. CAMPOS QUE A API PODE ESTAR DESCARTANDO. O erro original reclamava de
--    available_days, e não de description — que vai antes no pacote. Isso
--    sugere que a API do site monta o próprio objeto e talvez ignore
--    description, image_url, original_price, start_time e end_time. As
--    colunas já existem aqui; se depois de tudo isso algum desses campos
--    continuar chegando vazio no site, o ajuste é no código da API do
--    SiteCreatorFly, não no painel.
-- =====================================================================
