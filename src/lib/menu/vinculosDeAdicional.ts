/**
 * Os vínculos entre um adicional e as categorias em que ele aparece.
 *
 * A REGRA QUE MANDA EM TUDO AQUI
 *
 * Adicional SEM nenhum vínculo aparece em TODAS as categorias.
 *
 * Ela existe para proteger quem já está vendendo: no dia em que esta
 * funcionalidade entrou no ar, nenhum adicional tinha vínculo, e nenhum
 * sumiu do cardápio de ninguém. Fosse ao contrário — sem vínculo, não
 * aparece — a publicação teria apagado os adicionais de todas as lojas de
 * uma vez, e o dono só descobriria pelo cliente ligando para perguntar cadê
 * o bacon.
 */

export type VinculoDeCategoria = { id: string; name: string; external_id?: string | null };

/**
 * O que precisa ser gravado e o que precisa ser apagado para a lista de
 * vínculos virar a lista escolhida.
 *
 * Apaga só o que saiu e grava só o que entrou, em vez de apagar tudo e
 * regravar. Apagar e regravar funcionaria, mas perderia a data de cada
 * vínculo e escreveria no banco linhas que já estavam certas — é refazer o
 * cardápio inteiro porque mudou um item.
 */
export function diferencaDeVinculos(
  atuais: string[],
  escolhidas: string[],
): { inserir: string[]; remover: string[] } {
  const antes = new Set(atuais);
  const depois = new Set(escolhidas);
  return {
    inserir: [...depois].filter((id) => !antes.has(id)),
    remover: [...antes].filter((id) => !depois.has(id)),
  };
}

/**
 * Os códigos que o cardápio público entende.
 *
 * O FlyControl e o site do cliente guardam a mesma categoria com números
 * diferentes: cada lado tem o seu. O `external_id` é o número que o site usa
 * — é o crachá de visitante, válido só lá dentro.
 *
 * Categoria que nunca foi sincronizada não tem crachá, e por isso o vínculo
 * dela não tem como viajar. Em vez de mandar um número que o site não
 * reconhece (e ver o adicional sumir do cardápio sem explicação), esta função
 * devolve à parte o nome de quem ficou de fora, para a tela poder avisar.
 */
export function codigosParaOCardapioPublico(
  escolhidas: string[],
  categorias: VinculoDeCategoria[],
): { codigos: string[]; semCodigo: string[] } {
  const codigos: string[] = [];
  const semCodigo: string[] = [];

  for (const id of escolhidas) {
    const categoria = categorias.find((c) => c.id === id);
    if (!categoria) continue;
    const externo = categoria.external_id?.trim();
    if (externo) codigos.push(externo);
    else semCodigo.push(categoria.name);
  }

  return { codigos, semCodigo };
}

/**
 * `menu_extra_categories` ainda não está em `integrations/supabase/types.ts`
 * porque aqueles tipos são gerados a partir do banco e esta tabela é nova.
 * Mesmo molde já usado para `onboarding_answers`: uma descrição enxuta do que
 * ESTE arquivo usa, que some quando os tipos forem regerados.
 */
export type CadernoDeVinculos = {
  from: (t: "menu_extra_categories") => {
    select: (cols: string) => {
      eq: (c: string, v: string) => Promise<{ data: { category_id: string }[] | null }>;
    };
    insert: (
      linhas: { extra_id: string; category_id: string }[],
    ) => Promise<{ error: { message: string } | null }>;
    delete: () => {
      eq: (
        c: string,
        v: string,
      ) => {
        in: (c: string, vs: string[]) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
};
