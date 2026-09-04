-- O caderno do "Vamos preparar seu FlyControl".
--
-- POR QUE UMA TABELA E NÃO VINTE COLUNAS NA LOJA
--
-- São doze a quatorze perguntas, e elas vão mudar com o tempo. Criar uma
-- coluna para cada uma encheria a ficha da loja de campos que quase nada
-- consulta — e cada pergunta nova viraria uma mudança de estrutura do banco.
--
-- É a diferença entre anotar o perfil do cliente numa ficha à parte e escrever
-- tudo na etiqueta da mesa.
--
-- O que o SISTEMA usa de verdade (o tipo de negócio, que decide o formato do
-- cardápio) continua na ficha da loja, na coluna `business_type` que já
-- existia. Aqui fica o resto: o que serve para entender o cliente e
-- recomendar caminhos.
create table if not exists public.onboarding_answers (
  company_id uuid primary key references public.pizzerias(id) on delete cascade,

  -- não_começou / em_andamento / concluído
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),

  -- Em qual pergunta ele parou. É isso que faz "continuar de onde parou"
  -- funcionar quando ele fecha o navegador ou troca de celular.
  current_step text,

  -- As respostas. Uma linha por loja, gravada a cada etapa.
  respostas jsonb not null default '{}'::jsonb,

  started_at timestamptz,
  last_activity_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists onboarding_answers_status_idx
  on public.onboarding_answers (status);

-- Cada loja só enxerga o próprio caderno.
--
-- Quem ESCREVE é sempre o servidor, com a chave mestra e depois de conferir o
-- dono — o navegador não tem permissão de escrita aqui. Assim, nem mexendo na
-- requisição alguém responde o onboarding de outra empresa.
alter table public.onboarding_answers enable row level security;

drop policy if exists "onboarding: o dono lê o próprio" on public.onboarding_answers;
create policy "onboarding: o dono lê o próprio"
  on public.onboarding_answers for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.pizzerias p
      where p.id = onboarding_answers.company_id and p.owner_id = auth.uid()
    )
  );

drop trigger if exists onboarding_answers_updated on public.onboarding_answers;
create trigger onboarding_answers_updated
  before update on public.onboarding_answers
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- NINGUÉM QUE JÁ É CLIENTE CAI NO QUESTIONÁRIO
--
-- Toda loja que já existe hoje entra marcada como CONCLUÍDA. Elas já estão
-- trabalhando; obrigar quem já usa o sistema a responder doze perguntas para
-- voltar a ver os próprios pedidos seria trancar o cliente do lado de fora da
-- própria loja.
--
-- A partir daqui, loja SEM linha nesta tabela é loja nova — e é ela que vê o
-- onboarding.
-- ─────────────────────────────────────────────────────────────────────────
insert into public.onboarding_answers
  (company_id, status, respostas, started_at, completed_at, last_activity_at)
select p.id, 'completed', '{"migrado": true}'::jsonb, now(), now(), now()
from public.pizzerias p
on conflict (company_id) do nothing;
