import { useCallback, useEffect, useState } from "react";
import {
  type PerfilDeImpressao,
  type PerfisDaLoja,
  lerPerfisDaLoja,
  normalizarPerfil,
  perfilAtivo,
  salvarPerfisDaLoja,
} from "@/lib/impressao/perfil";

/** Os perfis da loja neste computador, já salvando a cada mudança. */
export function usePerfisDeImpressao(lojaId: string | null | undefined) {
  const [dados, setDados] = useState<PerfisDaLoja | null>(null);

  useEffect(() => {
    // Lido depois de abrir a página: o servidor não tem acesso ao
    // armazenamento do navegador.
    setDados(lerPerfisDaLoja(lojaId));
  }, [lojaId]);

  const gravar = useCallback(
    (novo: PerfisDaLoja) => {
      setDados(novo);
      salvarPerfisDaLoja(lojaId, novo);
    },
    [lojaId],
  );

  const perfil = dados ? perfilAtivo(dados) : null;

  const alterarPerfil = useCallback(
    (mudanca: Partial<PerfilDeImpressao>) => {
      if (!dados || !perfil) return;
      const atualizado = normalizarPerfil({ ...perfil, ...mudanca });
      gravar({ ...dados, perfis: dados.perfis.map((p) => (p.id === perfil.id ? atualizado : p)) });
    },
    [dados, perfil, gravar],
  );

  return { dados, perfil, gravar, alterarPerfil };
}
