-- O questionário de preparação voltava a cada login. Este arquivo fecha o
-- caderno de quem já é cliente.
--
-- O QUE ACONTECIA
--
-- A regra antiga era: loja SEM caderno é loja nova, então mostre o
-- questionário. Ela só funcionaria se todo cadastro abrisse um caderno — e
-- nenhum abria. O caderno só nascia quando a pessoa respondia a PRIMEIRA
-- pergunta.
--
-- Então caía no questionário, para sempre, a cada login:
--   • quem se cadastrou e fechou a aba antes de responder a primeira;
--   • toda loja criada pelo Painel Admin;
--   • toda loja restaurada depois de descadastrada.
--
-- Era a recepcionista barrando todo mundo que não estava na lista de visitas
-- do dia — inclusive quem trabalha no prédio há meses e só quer subir para a
-- própria sala.
--
-- A REGRA NOVA
--
-- O caderno é o convite. O cadastro passa a abrir um ('not_started'), e o
-- questionário aparece só para quem tem convite em aberto na mão. Quem não
-- tem caderno não é parado.
--
-- ESTA MIGRAÇÃO
--
-- Fecha o caderno de todas as lojas que já existem e estão em operação, para
-- que nenhuma delas continue sendo parada na portaria. Lojas descadastradas
-- ou apagadas ficam de fora: elas não entram no painel, e se um dia forem
-- restauradas é melhor que entrem sem convite do que com um convite velho.

insert into public.onboarding_answers
  (company_id, status, respostas, started_at, completed_at, last_activity_at)
select
  p.id,
  'completed',
  jsonb_build_object('migrado', true, 'motivo', 'loja_ja_em_operacao'),
  now(), now(), now()
from public.pizzerias p
where p.status not in ('deleted', 'inactive')
on conflict (company_id) do nothing;
