-- O guia de configuração: onde cada loja nova parou de configurar.
--
-- POR QUE AQUI DENTRO, E NÃO NUMA TABELA NOVA
--
-- `onboarding_answers` já é o caderno de preparação de cada loja: tem o
-- status, o passo atual e as respostas do questionário. Criar uma segunda
-- tabela para "o mesmo assunto em outro formato" é ter dois cadernos de
-- reservas no mesmo restaurante — um dia eles discordam, e aí ninguém sabe
-- qual vale.
--
-- As colunas novas levam o prefixo `guide_` porque o `status`/`current_step`
-- que já existem são do QUESTIONÁRIO. Se o guia usasse os mesmos campos, um
-- passo do guia apagaria o lugar onde o questionário parou.

alter table public.onboarding_answers
  add column if not exists guide_status text not null default 'not_started',
  add column if not exists guide_current_step text,
  add column if not exists guide_completed_steps jsonb not null default '[]'::jsonb,
  add column if not exists guide_started_at timestamptz,
  add column if not exists guide_completed_at timestamptz;

-- Só três valores existem. Sem isto, um erro de digitação em qualquer lugar do
-- código criaria um estado que nenhuma tela sabe tratar, e a loja ficaria
-- parada num limbo silencioso.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'onboarding_answers_guide_status_valido'
  ) then
    alter table public.onboarding_answers
      add constraint onboarding_answers_guide_status_valido
      check (guide_status in ('not_started', 'in_progress', 'completed'));
  end if;
end $$;

-- "Onde eu paro de perguntar?" é a pergunta que o painel faz a cada sessão.
create index if not exists onboarding_answers_guide_status_idx
  on public.onboarding_answers (guide_status)
  where guide_status <> 'completed';

-- ═════════════════════════════════════════════════════════════════════════
-- NINGUÉM QUE JÁ ESTÁ TRABALHANDO É PRESO NO GUIA
-- ═════════════════════════════════════════════════════════════════════════
--
-- Toda loja que existe HOJE é marcada como concluída. O guia é obrigatório,
-- e obrigatório aplicado a quem já está vendendo é uma catraca colocada no
-- meio do salão durante o almoço: o cliente que já estava sentado não
-- consegue nem sair nem continuar.
--
-- O guia só aparece para quem receber um caderno novo daqui para a frente —
-- a mesma regra do questionário, que já custou caro uma vez quando era o
-- contrário (ver 20260912120000).
update public.onboarding_answers
set guide_status = 'completed',
    guide_completed_at = coalesce(guide_completed_at, completed_at, now())
where guide_status <> 'completed';

comment on column public.onboarding_answers.guide_status is
  'Guia de configuração da loja: not_started | in_progress | completed. Independente do questionário (coluna status).';
comment on column public.onboarding_answers.guide_completed_steps is
  'Etapas já confirmadas por dado REAL do banco. Só cresce: etapa confirmada uma vez não volta a cobrar.';
