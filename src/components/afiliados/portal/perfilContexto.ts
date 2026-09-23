import { createContext, useContext } from "react";
import type { PerfilDoAfiliado } from "@/lib/afiliados/portal";

/** O perfil do parceiro logado, para as telas de dentro não buscarem de novo. */
export const PerfilContexto = createContext<PerfilDoAfiliado | null>(null);

export function usePerfil(): PerfilDoAfiliado {
  const p = useContext(PerfilContexto);
  if (!p) throw new Error("usePerfil fora do painel do parceiro");
  return p;
}
