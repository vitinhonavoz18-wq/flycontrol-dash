-- ══════════════════════════════════════════════════════════════════════════
-- APLICAR NO SUPABASE: marca FlyDelivery nos textos + trava de pedido repetido
-- ══════════════════════════════════════════════════════════════════════════
--
-- POR QUE ESTE ARQUIVO EXISTE
--
-- A atualização automática do banco (GitHub → "Migrações do banco") está
-- falhando desde outubro: a chave que o GitHub usa para entrar no Supabase não
-- tem permissão. Enquanto isso não for consertado, as mudanças do banco
-- precisam ser coladas à mão — este arquivo junta as duas desta entrega.
--
-- COMO USAR
--   1. Supabase → SQL Editor → New query.
--   2. Cole este arquivo inteiro e clique em Run.
--   3. Na aba de mensagens devem aparecer avisos como
--      "Marca atualizada no texto da função ..." e "Trava de pedido único criada."
--
-- É SEGURO: não apaga nem altera pedidos, clientes, produtos ou lojas. Pode
-- rodar mais de uma vez. Para desfazer: docs/REVERTER-NO-SUPABASE-marca-flydelivery.sql
--
-- Conteúdo idêntico a:
--   supabase/migrations/20261111120000_marca_flydelivery_nos_textos.sql
--   supabase/migrations/20261111130000_pedido_externo_unico.sql

-- ══════════════════════════════════════════════════════════════════════════
-- A MARCA NOVA NOS TEXTOS GUARDADOS NO BANCO  (FlyControl → FlyDelivery)
-- ══════════════════════════════════════════════════════════════════════════
--
-- O painel trocou de nome. Quase todo texto que o lojista lê mora no código
-- das telas e já foi trocado lá. Mas alguns poucos moram AQUI, no banco:
--
--   • a descrição do Clube CENTS e de duas conquistas
--     ("Você recebeu seu primeiro pedido pelo FlyControl");
--   • a frase de três recusas que o banco devolve quando barra uma ação
--     ("Há uma fatura do FlyControl em aberto...").
--
-- Sem esta migração, o lojista veria FlyDelivery na tela inteira e, de vez em
-- quando, FlyControl numa mensagem — a placa nova na fachada e o carimbo
-- antigo no recibo.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ (de propósito)
--
--   • Não renomeia tabela, coluna, função nem índice. `flycontrol_fiqon_logs`,
--     `flycontrol_id` e companhia continuam com o nome que têm: o site de
--     pedidos e o painel procuram por eles com esse nome.
--   • Não muda regra nenhuma. Nas funções, troca-se só a palavra dentro do
--     texto; quem pode, quem não pode e quanto custa ficam idênticos.
--   • Não apaga nem cria registro. Só corrige a palavra em textos existentes.
--   • Não reescreve histórico: avisos e eventos JÁ registrados no passado
--     ficam como foram escritos.
--
-- Pode rodar mais de uma vez sem estragar nada: na segunda vez não acha mais
-- o nome antigo e não faz nada.

-- ── 1. Textos do catálogo do Clube CENTS ─────────────────────────────────
--
-- `to_regclass` confere se a tabela existe antes de mexer — num banco onde o
-- Clube ainda não foi instalado, este trecho simplesmente passa direto.
DO $$
BEGIN
  IF to_regclass('public.clubs') IS NOT NULL THEN
    UPDATE public.clubs
       SET description = replace(description, 'FlyControl', 'FlyDelivery')
     WHERE description LIKE '%FlyControl%';
  END IF;

  IF to_regclass('public.club_achievements') IS NOT NULL THEN
    UPDATE public.club_achievements
       SET description = replace(description, 'FlyControl', 'FlyDelivery')
     WHERE description LIKE '%FlyControl%';
  END IF;
END
$$;

-- ── 2. A frase dentro das regras do banco ────────────────────────────────
--
-- Em vez de colar aqui uma cópia de cada função com a palavra trocada (e
-- correr o risco de colar uma versão VELHA por cima de uma correção mais
-- recente), este trecho pede ao próprio banco a versão que está valendo
-- agora, troca só a palavra e grava de volta.
--
-- É corrigir o nome no cardápio que está na parede hoje, e não reimprimir o
-- cardápio a partir de um arquivo antigo.
--
-- A busca diferencia maiúsculas de minúsculas: só "FlyControl" (como se
-- escreve a marca) é trocado. Os nomes técnicos são todos em minúsculas
-- ("flycontrol_...") e por isso ficam de fora.
--
-- Dono, permissões de execução e configurações de segurança de cada função
-- são preservados: "CREATE OR REPLACE" troca o corpo e mantém o resto.
DO $$
DECLARE
  f RECORD;
  definicao TEXT;
BEGIN
  FOR f IN
    SELECT p.oid, n.nspname AS esquema, p.proname AS nome
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind IN ('f', 'p')          -- funções e procedimentos comuns
       AND p.prosrc LIKE '%FlyControl%'
     ORDER BY p.proname
  LOOP
    definicao := pg_get_functiondef(f.oid);
    EXECUTE replace(definicao, 'FlyControl', 'FlyDelivery');
    RAISE NOTICE 'Marca atualizada no texto da função %.%', f.esquema, f.nome;
  END LOOP;
END
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- O MESMO PEDIDO DO SITE NÃO ENTRA DUAS VEZES  (a trava do lado do banco)
-- ══════════════════════════════════════════════════════════════════════════
--
-- O site de pedidos reenvia o pedido quando não recebe a resposta do painel.
-- O painel passou a conferir, antes de gravar, se aquele pedido já existe
-- (ver `src/lib/orders/pedidoRepetido.ts`).
--
-- Essa conferência resolve quase tudo, menos um caso: dois reenvios chegando
-- no MESMO instante. Os dois perguntam "já existe?", os dois ouvem "não", e os
-- dois gravam. Só o banco consegue impedir isso, porque só ele vê as duas
-- gravações ao mesmo tempo.
--
-- É como o caderno de reservas só aceitar um nome por mesa — se dois
-- atendentes tentarem escrever ao mesmo tempo, a caneta de um deles trava.
--
-- O QUE A TRAVA COBRE
--
-- Só pedido vindo do site (`source = 'sitecreatorfly'`) e que tenha número de
-- série. Pedido lançado no painel, pelo garçom ou pelo aplicativo não tem
-- nada a ver com isto e continua como sempre.
--
-- A CAUTELA
--
-- Se o banco JÁ tiver pedidos repetidos de antes (o defeito existia), criar a
-- trava daria erro e pararia a publicação inteira. Por isso este arquivo
-- CONFERE primeiro: se houver repetidos antigos, ele NÃO cria a trava, avisa
-- quantos são e termina sem erro. A proteção do painel continua valendo; a
-- trava do banco fica para depois de alguém olhar esses repetidos — ver
-- `docs/FLYDELIVERY-MIGRACAO.md`.
--
-- Nenhum pedido é apagado ou alterado por este arquivo, em nenhum caso.
-- Pode rodar mais de uma vez sem estragar nada.

DO $$
DECLARE
  repetidos BIGINT;
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RAISE NOTICE 'Tabela de pedidos não encontrada; nada a fazer.';
    RETURN;
  END IF;

  IF to_regclass('public.orders_pedido_externo_unico') IS NOT NULL THEN
    RAISE NOTICE 'A trava de pedido único já existe; nada a fazer.';
    RETURN;
  END IF;

  SELECT count(*) INTO repetidos
    FROM (
      SELECT 1
        FROM public.orders
       WHERE external_order_id IS NOT NULL
         AND source = 'sitecreatorfly'
       GROUP BY tenant_id, external_order_id
      HAVING count(*) > 1
    ) grupos;

  IF repetidos > 0 THEN
    RAISE NOTICE
      'Trava de pedido único NÃO criada: % número(s) de série já aparecem em mais de um pedido. Nada foi alterado.',
      repetidos;
    RETURN;
  END IF;

  CREATE UNIQUE INDEX orders_pedido_externo_unico
    ON public.orders (tenant_id, external_order_id)
    WHERE external_order_id IS NOT NULL AND source = 'sitecreatorfly';

  RAISE NOTICE 'Trava de pedido único criada.';
END
$$;
