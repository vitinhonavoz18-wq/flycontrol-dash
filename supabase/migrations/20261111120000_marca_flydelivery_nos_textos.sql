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
