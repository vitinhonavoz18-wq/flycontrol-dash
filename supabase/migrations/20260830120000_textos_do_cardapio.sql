-- Confere os textos do cardápio no banco, e não só na tela.
--
-- POR QUE ISSO EXISTE
--
-- A tela de "Minha Loja" já limita o tamanho dos textos e tira marcação de
-- HTML antes de gravar. Só que a tela é o lado de fora: quem souber montar a
-- chamada por conta própria fala direto com o banco e passa por cima dela.
--
-- É a diferença entre o balcão e o cofre. O balcão confere quem entra, mas o
-- cofre também tem segredo próprio — porque um dia alguém entra pelos fundos.
--
-- O QUE ELE FAZ
--
-- Toda vez que a ficha de configurações de uma loja é gravada, este gatilho
-- olha o pacote `menu_texts` e:
--
--   * tira qualquer coisa entre < e >, para nenhum pedaço de código chegar à
--     página do cliente final;
--   * junta espaços repetidos e apara as pontas;
--   * corta no tamanho máximo de cada campo;
--   * descarta o que sobrar vazio — e campo ausente significa "usar o texto
--     padrão", que é como a loja volta ao original.
--
-- Ele NÃO recusa a gravação. Corrige e deixa passar: derrubar o salvamento
-- inteiro por causa de um espaço a mais faria o lojista perder o resto do que
-- estava editando.
--
-- OS LIMITES SÃO OS MESMOS DA TELA
--
-- 50 para a tarja, 50 para o título, 200 para a descrição. Se um dia mudarem
-- em `src/lib/site/menuTexts.ts`, precisam mudar aqui junto — e o teste
-- `menuTexts.db.test.ts` quebra quando os dois lados discordam.

CREATE OR REPLACE FUNCTION public.limpar_texto_do_cardapio(p_valor text, p_maximo integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    left(
      btrim(
        regexp_replace(
          regexp_replace(
            regexp_replace(COALESCE(p_valor, ''), '<[^>]*>', '', 'g'),
            '[\r\n\t]+', ' ', 'g'
          ),
          '\s{2,}', ' ', 'g'
        )
      ),
      p_maximo
    ),
    ''
  );
$$;

COMMENT ON FUNCTION public.limpar_texto_do_cardapio(text, integer) IS
  'Tira marcação de HTML, junta espaços e corta no limite. Devolve NULL quando não sobra texto.';

CREATE OR REPLACE FUNCTION public.sanear_textos_do_cardapio()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_textos jsonb;
  v_limpo jsonb := '{}'::jsonb;
  v_valor text;
  -- chave do campo -> tamanho máximo, iguais aos da tela.
  v_limites CONSTANT jsonb := '{"menu_badge": 50, "menu_title": 50, "menu_description": 200}'::jsonb;
  v_chave text;
BEGIN
  IF NEW.site_settings IS NULL OR jsonb_typeof(NEW.site_settings) <> 'object' THEN
    RETURN NEW;
  END IF;

  v_textos := NEW.site_settings -> 'menu_texts';

  -- Loja que nunca personalizou não tem esse pacote. Nada a fazer.
  IF v_textos IS NULL THEN
    RETURN NEW;
  END IF;

  -- Veio algo que não é um pacote de campos (uma lista, um número). Trata como
  -- "sem personalização" em vez de tentar adivinhar o que a pessoa quis.
  IF jsonb_typeof(v_textos) <> 'object' THEN
    NEW.site_settings := NEW.site_settings || jsonb_build_object('menu_texts', '{}'::jsonb);
    RETURN NEW;
  END IF;

  FOR v_chave IN SELECT jsonb_object_keys(v_limites) LOOP
    IF jsonb_typeof(v_textos -> v_chave) = 'string' THEN
      v_valor := public.limpar_texto_do_cardapio(
        v_textos ->> v_chave,
        (v_limites ->> v_chave)::integer
      );
      IF v_valor IS NOT NULL THEN
        v_limpo := v_limpo || jsonb_build_object(v_chave, v_valor);
      END IF;
    END IF;
  END LOOP;

  -- Só as chaves conhecidas sobrevivem: campo inventado por fora não fica
  -- guardado ocupando espaço na ficha da loja.
  NEW.site_settings := NEW.site_settings || jsonb_build_object('menu_texts', v_limpo);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sanear_textos_do_cardapio() IS
  'Limpa site_settings.menu_texts a cada gravação: sem HTML, dentro do limite, só as chaves conhecidas.';

DROP TRIGGER IF EXISTS trg_sanear_textos_do_cardapio ON public.pizzerias;

CREATE TRIGGER trg_sanear_textos_do_cardapio
  BEFORE INSERT OR UPDATE OF site_settings ON public.pizzerias
  FOR EACH ROW
  EXECUTE FUNCTION public.sanear_textos_do_cardapio();
