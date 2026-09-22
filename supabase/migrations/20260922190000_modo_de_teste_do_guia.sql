-- Modo de teste do guia de configuração.
--
-- POR QUE ELE PRECISA EXISTIR
--
-- O guia tem uma trava de segurança: loja que já recebeu pedido nunca é
-- parada por ele. Isso protege quem está no meio do expediente — mas também
-- impede que o dono da plataforma ABRA o guia de propósito numa loja sua para
-- conferir como ele ficou.
--
-- É o alarme de incêndio que não deixa nem o bombeiro testar se ele toca.
--
-- Esta coluna é a chave do bombeiro: ligada à mão, e só à mão, ela diz "esta
-- loja é um ensaio, pode parar". Nenhum cadastro liga isso sozinho; nenhuma
-- tela liga isso. Só um comando direto no banco, como este.

alter table public.onboarding_answers
  add column if not exists guide_test_mode boolean not null default false;

comment on column public.onboarding_answers.guide_test_mode is
  'Loja de ensaio: o guia ignora a trava "ja esta vendendo" e aparece mesmo com pedidos. Ligado so a mao, nunca por cadastro ou tela.';
