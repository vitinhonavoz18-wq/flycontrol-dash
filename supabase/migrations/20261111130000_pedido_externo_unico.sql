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
