-- ══════════════════════════════════════════════════════════════════════════
-- REVERTER: volta os textos do banco para "FlyControl"
-- ══════════════════════════════════════════════════════════════════════════
--
-- Desfaz SOMENTE o que a migração `20261111120000_marca_flydelivery_nos_textos`
-- fez: a palavra da marca em oito frases. Nenhum dado é apagado.
--
-- QUANDO USAR
--
-- Só se a decisão for voltar a marca antiga por inteiro. Se o problema for
-- outro (uma tela quebrada, um pedido que não entra), isto NÃO resolve: esta
-- migração não mexeu em regra nenhuma, só em palavras.
--
-- POR QUE NÃO É "TROCAR TUDO DE VOLTA"
--
-- A ida trocou toda ocorrência de "FlyControl". A volta NÃO pode trocar toda
-- ocorrência de "FlyDelivery": esse nome já existia antes, para o aplicativo
-- do cliente final ("pedido pelo FlyDelivery", "Cliente FlyDelivery"). Trocar
-- tudo estragaria esses textos. Por isso aqui cada frase é citada por
-- extenso — é desfazer a etiqueta certa, não todas as etiquetas da prateleira.
--
-- COMO USAR: Supabase → SQL Editor → colar tudo → Run.
-- Pode rodar mais de uma vez sem estragar nada.

-- ── 1. Catálogo do Clube CENTS ───────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.clubs') IS NOT NULL THEN
    UPDATE public.clubs
       SET description = replace(description, 'crescimento do FlyDelivery', 'crescimento do FlyControl')
     WHERE description LIKE '%crescimento do FlyDelivery%';
  END IF;

  IF to_regclass('public.club_achievements') IS NOT NULL THEN
    UPDATE public.club_achievements
       SET description = replace(
             replace(description, 'primeiro pedido pelo FlyDelivery', 'primeiro pedido pelo FlyControl'),
             'história do FlyDelivery', 'história do FlyControl')
     WHERE description LIKE '%primeiro pedido pelo FlyDelivery%'
        OR description LIKE '%história do FlyDelivery%';
  END IF;
END
$$;

-- ── 2. As frases dentro das regras do banco ──────────────────────────────
DO $$
DECLARE
  f RECORD;
  definicao TEXT;
  nova TEXT;
  -- frase nova → frase antiga
  frases CONSTANT TEXT[][] := ARRAY[
    ['plano FlyDelivery ativo',                   'plano FlyControl ativo'],
    ['fatura do FlyDelivery em aberto',           'fatura do FlyControl em aberto'],
    ['alterados pela FlyDelivery',                'alterados pela FlyControl'],
    ['história do FlyDelivery',                   'história do FlyControl']
  ];
  i INT;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname AS nome
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind IN ('f', 'p')
       AND p.prosrc LIKE '%FlyDelivery%'
     ORDER BY p.proname
  LOOP
    definicao := pg_get_functiondef(f.oid);
    nova := definicao;
    FOR i IN 1 .. array_length(frases, 1) LOOP
      nova := replace(nova, frases[i][1], frases[i][2]);
    END LOOP;
    IF nova IS DISTINCT FROM definicao THEN
      EXECUTE nova;
      RAISE NOTICE 'Texto antigo restaurado na função public.%', f.nome;
    END IF;
  END LOOP;
END
$$;
