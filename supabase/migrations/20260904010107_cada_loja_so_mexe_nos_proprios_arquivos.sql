-- SEGURANÇA: as fotos de uma loja não podem ser apagadas por outra.
--
-- O PROBLEMA
--
-- As regras dos arquivos (fotos de produto, artes de status, anexos de
-- cadastro) só perguntavam UMA coisa: "esse arquivo é da pasta menu-images?".
-- Se fosse, qualquer pessoa logada podia apagar ou trocar — inclusive as 60
-- fotos das outras 10 lojas.
--
-- É o depósito com uma porta só e nenhuma divisória: qualquer lojista que
-- entra alcança a prateleira de todo mundo. Bastava um concorrente criar uma
-- conta grátis para apagar as fotos do cardápio inteiro de outro.
--
-- A CORREÇÃO
--
-- Cada arquivo já guarda quem o enviou. Agora apagar e substituir só valem
-- para os próprios arquivos — ou para o administrador da plataforma.
--
-- É a divisória no depósito: continua a mesma porta, mas cada um só alcança a
-- própria prateleira.
--
-- O QUE NÃO MUDA: enviar arquivo continua igual, e o painel do administrador
-- também — a exclusão definitiva de uma loja é feita por dentro do sistema,
-- que tem a chave mestra e não passa por estas regras.

-- Fotos do cardápio
drop policy if exists "Authenticated delete menu images" on storage.objects;
drop policy if exists "Authenticated update menu images" on storage.objects;

create policy "menu images: apagar só o que é seu"
  on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images' and (owner = auth.uid() or public.is_admin()));

create policy "menu images: substituir só o que é seu"
  on storage.objects for update to authenticated
  using (bucket_id = 'menu-images' and (owner = auth.uid() or public.is_admin()))
  with check (bucket_id = 'menu-images' and (owner = auth.uid() or public.is_admin()));

-- Artes do FlyStatus
drop policy if exists "status-arts auth delete" on storage.objects;
drop policy if exists "status-arts auth update" on storage.objects;

create policy "status-arts: apagar só o que é seu"
  on storage.objects for delete to authenticated
  using (bucket_id = 'status-arts' and (owner = auth.uid() or public.is_admin()));

create policy "status-arts: substituir só o que é seu"
  on storage.objects for update to authenticated
  using (bucket_id = 'status-arts' and (owner = auth.uid() or public.is_admin()))
  with check (bucket_id = 'status-arts' and (owner = auth.uid() or public.is_admin()));

-- Anexos de cadastro. Esta pasta é privada e pode conter documento de
-- terceiro, então aqui até a LEITURA passa a ser só do dono.
drop policy if exists "onboarding_uploads_auth_delete" on storage.objects;
drop policy if exists "onboarding_uploads_auth_update" on storage.objects;
drop policy if exists "onboarding_uploads_auth_select" on storage.objects;

create policy "onboarding: ler só o que é seu"
  on storage.objects for select to authenticated
  using (bucket_id = 'onboarding-uploads' and (owner = auth.uid() or public.is_admin()));

create policy "onboarding: apagar só o que é seu"
  on storage.objects for delete to authenticated
  using (bucket_id = 'onboarding-uploads' and (owner = auth.uid() or public.is_admin()));

create policy "onboarding: substituir só o que é seu"
  on storage.objects for update to authenticated
  using (bucket_id = 'onboarding-uploads' and (owner = auth.uid() or public.is_admin()))
  with check (bucket_id = 'onboarding-uploads' and (owner = auth.uid() or public.is_admin()));
