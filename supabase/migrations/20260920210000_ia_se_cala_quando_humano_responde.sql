-- ---------------------------------------------------------------------------
-- A IA SE CALA QUANDO UMA PESSOA DA EQUIPE RESPONDE
--
-- O PROBLEMA
--
-- A trava da IA morava só no fluxo do n8n, e ela só sabia de uma coisa: a
-- mensagem que o dono digita NO CELULAR dele, porque essa passa pelo WhatsApp
-- e volta para o fluxo.
--
-- Só que existe um segundo caminho, e é o mais usado: o atendente responde
-- PELO PAINEL. Essa mensagem sai do FlyControl direto para o WhatsApp e NUNCA
-- volta para o fluxo — ela é filtrada de propósito, senão a resposta voltaria
-- como se fosse pergunta nova. Resultado: a IA não ficava sabendo que um
-- humano tinha assumido e continuava respondendo por cima dele.
--
-- Para o cliente, eram dois atendentes falando ao mesmo tempo, cada um com
-- uma versão da história. É o garçom anotando o pedido enquanto o dono já
-- estava anotando na outra ponta da mesa.
--
-- A SOLUÇÃO
--
-- A trava sai do fluxo e vem para cá, porque o FlyControl é o ÚNICO lugar que
-- enxerga os DOIS caminhos: a mensagem do celular chega aqui pela porta de
-- entrada, e a do painel nasce aqui dentro.
--
-- Guardamos a HORA EM QUE A IA PODE VOLTAR A FALAR, e não um sim/não. Assim a
-- trava se solta sozinha quando a hora passa — ninguém precisa lembrar de
-- destravar, e uma conversa não fica presa para sempre porque alguém
-- respondeu uma vez num domingo.
-- ---------------------------------------------------------------------------

ALTER TABLE public.crm_conversations
  ADD COLUMN IF NOT EXISTS ia_pausada_ate TIMESTAMPTZ;

COMMENT ON COLUMN public.crm_conversations.ia_pausada_ate IS
  'Até quando a atendente de IA fica calada nesta conversa, porque uma pessoa '
  'da equipe assumiu. Vazio ou no passado = a IA pode responder.';

-- A busca é sempre "esta conversa está travada AGORA?", uma conversa por vez.
-- O índice existe para a varredura não crescer junto com o histórico da loja:
-- só interessam as que ainda estão travadas, e essas são poucas.
CREATE INDEX IF NOT EXISTS crm_conversations_ia_pausada_idx
  ON public.crm_conversations (tenant_id, ia_pausada_ate)
  WHERE ia_pausada_ate IS NOT NULL;
