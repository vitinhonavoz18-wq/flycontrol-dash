-- Complemento da migração anterior.
--
-- A tentativa anterior mandou "tire a permissão de escrever nestas duas
-- colunas". Não pegou: a permissão que existia era da FICHA INTEIRA, e o
-- banco não deixa recortar um pedaço de uma permissão dada por inteiro.
--
-- É como ter dado a chave do armário todo e depois pedir "essa chave não abre
-- a gaveta de cima" — não funciona assim. Tem que recolher a chave do armário
-- e entregar a chave só das gavetas certas.
--
-- Então: recolhe a permissão de escrita na ficha inteira e devolve apenas
-- nome e telefone. A caixinha "is_admin" e o número de identificação da ficha
-- deixam de ser escrevíveis pelo navegador.
revoke update on public.profiles from anon, authenticated;
revoke insert on public.profiles from anon, authenticated;

grant update (full_name, phone) on public.profiles to authenticated;
grant insert (id, full_name, phone) on public.profiles to authenticated;
