-- SEGURANÇA: loja sem dono não é loja de quem chegar primeiro.
--
-- O PROBLEMA
--
-- Existia uma regra dizendo: "se a loja está sem dono, qualquer pessoa logada
-- (que não seja consumidor) pode mexer nela". Junto com a regra de edição
-- normal, isso deixava essa pessoa se declarar dona.
--
-- É a chave da loja vazia pendurada do lado de fora: quem passar e girar,
-- entra — e leva junto o cardápio e a chave de integração.
--
-- Hoje só existe uma loja nessa situação, e ela nem está ativa. Mas a porta
-- estava destrancada.
--
-- A CORREÇÃO
--
-- Adotar uma loja sem dono passa a ser coisa de administrador da plataforma —
-- que é exatamente quem faz isso na tela "Integração com o Site Público",
-- hoje visível só para ele.
drop policy if exists "pizzerias_claim_unowned" on public.pizzerias;

create policy "pizzerias: só o administrador adota loja sem dono"
  on public.pizzerias for update to authenticated
  using (owner_id is null and public.is_admin())
  with check (public.is_admin());
