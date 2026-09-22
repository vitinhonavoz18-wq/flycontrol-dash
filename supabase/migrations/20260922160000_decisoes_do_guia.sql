-- As escolhas que o lojista faz DENTRO do guia de configuração.
--
-- POR QUE ISTO PRECISA EXISTIR
--
-- Quase toda etapa do guia se fecha sozinha olhando a loja: tem produto? tem
-- forma de pagamento? O banco responde e pronto.
--
-- Mas "meu estabelecimento não usa adicionais" não é um dado que se possa
-- olhar. Uma loja sem nenhum adicional cadastrado e uma loja que NÃO USA
-- adicionais são idênticas no banco — e sem guardar a resposta, o guia ficaria
-- perguntando a mesma coisa para sempre. É o garçom que volta de cinco em
-- cinco minutos perguntando se o cliente quer sobremesa depois de ele já ter
-- dito que não.
--
-- Então aqui ficam só as respostas que NÃO dá para deduzir. Tudo que o banco
-- sabe responder continua sendo perguntado ao banco.

alter table public.onboarding_answers
  add column if not exists guide_decisions jsonb not null default '{}'::jsonb;

comment on column public.onboarding_answers.guide_decisions is
  'Escolhas do lojista dentro do guia que nao dao para deduzir dos dados (ex.: "nao uso adicionais"). Tudo que o banco sabe responder NAO entra aqui.';
