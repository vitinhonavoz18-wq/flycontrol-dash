-- Foto de capa por categoria do cardápio
--
-- O QUE MUDA NA PRÁTICA
--
-- Até aqui só o produto tinha foto. Quando o cardápio do cliente é montado em
-- "Cards de Categoria" ou em "Navegação por Categorias", quem aparece na tela
-- primeiro é a CATEGORIA — e ela aparecia como um retângulo cinza com um
-- ícone de imagem quebrada. É a vitrine da padaria com as bandejas vazias: o
-- pão existe, só não dá para ver.
--
-- O site público já sabe mostrar essa foto há tempos (ele lê `image_url` da
-- categoria). O que faltava era o painel ter onde guardar e por onde enviar.
--
-- SEGURANÇA
--
-- A coluna entra numa tabela que já tem as regras de acesso montadas: cada
-- loja só enxerga e só edita as próprias categorias. Não é preciso mexer nisso
-- de novo — a coluna nova herda a mesma tranca da porta.
--
-- Guarda só o ENDEREÇO da foto, nunca a foto em si: o arquivo continua no
-- armazenamento de imagens, como sempre foi para as fotos de produto.

ALTER TABLE public.menu_categories
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.menu_categories.image_url IS
  'Endereço da foto de capa da categoria. Aparece no cardápio público nos modos "Cards de Categoria" e "Navegação por Categorias". Vazio = o cardápio mostra o cartão sem foto, como antes.';
