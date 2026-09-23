/**
 * Segunda metade do rastreio: o cadastro terminou e a loja existe.
 *
 * Lê a ficha que ficou no cookie e pede ao banco para transformar a visita
 * em indicação PERMANENTE daquela loja. Quem decide tudo — se a ficha
 * vale, se venceu, se é a própria pessoa se indicando, se a loja já tinha
 * afiliado — é o banco (`afiliado_converter_indicacao`). Aqui só se leva o
 * recado e se anota o resultado.
 *
 * Servidor apenas. Nunca derruba o cadastro: se o programa de afiliados
 * falhar, o lojista entra do mesmo jeito. É como a comanda de indicação do
 * garçom — se ela se perder, o cliente ainda come.
 */

import { deleteCookie, getCookie } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  COOKIE_DA_INDICACAO,
  apagarCookieDepoisDoCadastro,
  opcoesDoCookie,
  tokenDoCookie,
} from "./codigo";

type ConversaoDb = {
  rpc: (
    fn: "afiliado_converter_indicacao",
    args: {
      p_token: string;
      p_establishment_id: string;
      p_owner_user_id: string;
      p_owner_email: string;
    },
  ) => Promise<{ data: string | null; error: { message: string } | null }>;
};

export async function converterIndicacaoDoCadastro(params: {
  companyId: string;
  ownerUserId: string;
  ownerEmail: string;
}): Promise<string> {
  try {
    const token = tokenDoCookie(getCookie(COOKIE_DA_INDICACAO));
    if (!token) return "sem_token";

    const db = supabaseAdmin as unknown as ConversaoDb;
    const { data, error } = await db.rpc("afiliado_converter_indicacao", {
      p_token: token,
      p_establishment_id: params.companyId,
      p_owner_user_id: params.ownerUserId,
      p_owner_email: params.ownerEmail,
    });

    if (error) {
      console.error("[afiliados] falha ao converter indicação:", error.message);
      return "erro";
    }

    const resultado = data ?? "erro";
    if (resultado !== "ok") {
      // Não é erro do cadastro — é a regra funcionando. Fica no log para a
      // equipe conseguir explicar a um afiliado por que uma loja não contou.
      console.info(`[afiliados] indicação não registrada para ${params.companyId}: ${resultado}`);
    }

    if (apagarCookieDepoisDoCadastro(resultado)) {
      // Apagar exige o mesmo caminho e as mesmas travas com que foi gravado.
      deleteCookie(COOKIE_DA_INDICACAO, opcoesDoCookie(0));
    }

    return resultado;
  } catch (erro) {
    console.error("[afiliados] erro inesperado ao converter indicação:", erro);
    return "erro";
  }
}
