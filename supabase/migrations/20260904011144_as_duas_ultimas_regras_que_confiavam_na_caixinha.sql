-- Termina de tirar a caixinha "is_admin" da ficha de circulação.
--
-- Duas regras ainda perguntavam "essa pessoa tem a caixinha de administrador
-- marcada na ficha dela?" — justamente a caixinha que qualquer pessoa logada
-- conseguia marcar até a correção anterior. Eram estas que davam a mão às
-- comandas de mesa de TODOS os restaurantes.
--
-- Não basta ter trancado a caixinha: enquanto existir alguém disposto a
-- aceitá-la, ela continua sendo um crachá. Aqui as duas passam a conferir a
-- mesma lista oficial de papéis que o resto do sistema usa.
drop policy if exists "Users can manage sessions of their pizzerias" on public.table_sessions;
create policy "comandas: do dono da loja, ou do administrador"
  on public.table_sessions for all
  using (
    public.is_admin()
    or exists (select 1 from public.pizzerias p
               where p.id = table_sessions.restaurant_id and p.owner_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.pizzerias p
               where p.id = table_sessions.restaurant_id and p.owner_id = auth.uid())
  );

drop policy if exists "Users can manage session orders" on public.table_session_orders;
create policy "pedidos da comanda: do dono da loja, ou do administrador"
  on public.table_session_orders for all
  using (
    public.is_admin()
    or exists (select 1 from public.table_sessions s
               join public.pizzerias p on p.id = s.restaurant_id
               where s.id = table_session_orders.table_session_id and p.owner_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.table_sessions s
               join public.pizzerias p on p.id = s.restaurant_id
               where s.id = table_session_orders.table_session_id and p.owner_id = auth.uid())
  );
