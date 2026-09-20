-- Em quais categorias do cardápio cada adicional aparece.
--
-- O PROBLEMA
--
-- Hoje todo adicional cadastrado aparece em TODO produto. Quem tem pastelaria
-- com açaí vê "Bacon" sendo oferecido no açaí, e "Leite Ninho" sendo oferecido
-- no pastel de carne.
--
-- É o garçom levando a bandeja inteira de acompanhamentos para todas as mesas:
-- a mesa que pediu sobremesa não quer ver a farofa, e quem pediu feijoada não
-- quer ver o granulado.
--
-- POR QUE UMA TABELA E NÃO UMA COLUNA
--
-- Um adicional vale para VÁRIAS categorias, e uma categoria tem VÁRIOS
-- adicionais. Guardar isso numa coluna da ficha do adicional (uma lista de
-- nomes, por exemplo) significaria reescrever a lista inteira a cada mudança e
-- não teria como o banco conferir se a categoria existe de verdade.
--
-- Aqui cada linha é um vínculo: "este adicional vale nesta categoria". É o
-- caderninho de quem-com-quem, uma linha por par.
--
-- O ADICIONAL CONTINUA SENDO CADASTRADO UMA VEZ SÓ
--
-- Vincular Bacon a Pastéis e a Hambúrgueres não cria dois Bacons. Mudar o
-- preço do Bacon muda nos dois lugares, porque é o mesmo Bacon. Tirar o Bacon
-- de Hambúrgueres não apaga o Bacon — só apaga o vínculo.
--
-- ═════════════════════════════════════════════════════════════════════════
-- A REGRA QUE PROTEGE QUEM JÁ ESTÁ VENDENDO
-- ═════════════════════════════════════════════════════════════════════════
--
-- ADICIONAL SEM NENHUM VÍNCULO VALE EM TODAS AS CATEGORIAS.
--
-- Esta migração NÃO cria vínculo nenhum. Todos os adicionais que já existem
-- continuam aparecendo exatamente onde apareciam ontem — nenhum some do
-- cardápio de ninguém no momento em que isto entrar no ar.
--
-- Fosse o contrário (sem vínculo = não aparece), publicar isto apagaria os
-- adicionais de todas as lojas de uma vez, e o dono só descobriria pelo
-- cliente ligando para perguntar cadê o bacon.
--
-- O vínculo passa a valer quando o lojista escolhe as categorias na tela.

create table if not exists public.menu_extra_categories (
  id uuid primary key default gen_random_uuid(),

  -- Apagar o adicional apaga os vínculos dele. Apagar a categoria apaga os
  -- vínculos daquela categoria — e NÃO apaga o adicional, que continua valendo
  -- nas outras categorias (ou volta a valer em todas, se aquela era a única).
  extra_id uuid not null references public.menu_extras(id) on delete cascade,
  category_id uuid not null references public.menu_categories(id) on delete cascade,

  created_at timestamptz not null default now(),

  -- O mesmo par não pode ser gravado duas vezes. É o caderno de reservas que
  -- só aceita um nome por mesa: se tentar escrever o segundo, a caneta trava.
  constraint menu_extra_categories_par_unico unique (extra_id, category_id)
);

-- Duas perguntas são feitas o tempo todo, e cada índice responde uma:
--   "quais categorias este adicional atende?" (tela de edição)
--   "quais adicionais esta categoria tem?"    (cardápio do cliente)
create index if not exists menu_extra_categories_extra_idx
  on public.menu_extra_categories (extra_id);
create index if not exists menu_extra_categories_category_idx
  on public.menu_extra_categories (category_id);

alter table public.menu_extra_categories enable row level security;

-- Quem manda aqui é o dono do adicional. As duas políticas são as MESMAS de
-- `menu_extras`, alcançadas através do adicional: sem isso, bastaria descobrir
-- o número de um adicional de outra loja para vincular o que quisesse nele.
drop policy if exists "Manage menu_extra_categories" on public.menu_extra_categories;
create policy "Manage menu_extra_categories"
  on public.menu_extra_categories for all
  using (
    exists (
      select 1 from public.menu_extras e
      where e.id = menu_extra_categories.extra_id
        and (public.is_admin() or public.owns_pizzeria(auth.uid(), e.pizzeria_id))
    )
  )
  with check (
    exists (
      select 1 from public.menu_extras e
      where e.id = menu_extra_categories.extra_id
        and (public.is_admin() or public.owns_pizzeria(auth.uid(), e.pizzeria_id))
    )
    and exists (
      -- A categoria também precisa ser da mesma loja. Sem esta metade, um dono
      -- poderia vincular o próprio adicional a uma categoria do vizinho.
      select 1
      from public.menu_categories c
      join public.menu_extras e2 on e2.id = menu_extra_categories.extra_id
      where c.id = menu_extra_categories.category_id
        and c.pizzeria_id = e2.pizzeria_id
    )
  );

-- Leitura pública pelas mesmas condições de `menu_extras`: o cardápio precisa
-- saber onde cada adicional vale, e só de loja ativa.
drop policy if exists "menu_extra_categories_public_select" on public.menu_extra_categories;
create policy "menu_extra_categories_public_select"
  on public.menu_extra_categories for select
  using (
    exists (
      select 1
      from public.menu_extras e
      join public.pizzerias p on p.id = e.pizzeria_id
      where e.id = menu_extra_categories.extra_id
        and e.active = true
        and p.status = 'active'
    )
  );
