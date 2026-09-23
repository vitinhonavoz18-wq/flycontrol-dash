/**
 * Primeira metade do rastreio: alguém chegou por `?ref=CODIGO`.
 *
 * O navegador só avisa "cheguei com este código". Quem decide se o código
 * vale, por quanto tempo e se já existe outra indicação guardada é o
 * servidor — e o que fica guardado no navegador é uma ficha sem significado
 * (um número aleatório), dentro de um cookie que a página não consegue ler
 * nem trocar.
 *
 * É como a pulseira da festa: o segurança coloca no pulso na entrada, e quem
 * confere depois é o caixa, contra a lista dele. Não adianta a pessoa
 * escrever o nome de um amigo na pulseira — o caixa não lê o que está
 * escrito, só o número.
 */

import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { currentRequestIp } from "@/lib/signup/rateLimit.server";
import {
  COOKIE_DA_INDICACAO,
  normalizarCodigoDeAfiliado,
  opcoesDoCookie,
  segundosAteVencer,
  tokenDoCookie,
} from "./codigo";

/**
 * As tabelas e funções do programa são mais novas que os tipos gerados do
 * banco. Mesmo molde de `rateLimit.server.ts`: o cast some quando os tipos
 * forem regerados.
 */
type AfiliadosDb = {
  rpc: (
    fn: "afiliado_registrar_visita",
    args: { p_codigo: string; p_ip_hash: string | null; p_user_agent: string | null },
  ) => Promise<{
    data: { token: string; expires_at: string }[] | null;
    error: { message: string } | null;
  }>;
  from: (table: "affiliate_attributions") => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: { converted_at: string | null; expires_at: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

/**
 * O IP não é guardado — só uma impressão digital dele, cortada. Serve para
 * perceber "o mesmo aparelho clicou dez vezes na última hora" sem o banco
 * saber o endereço de ninguém.
 */
async function impressaoDoIp(ip: string): Promise<string | null> {
  if (!ip || ip === "unknown") return null;
  const bytes = new TextEncoder().encode(`flycontrol-afiliados:${ip}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A indicação que o navegador já carrega ainda serve? Serve se o banco
 * conhece a ficha, ela não foi usada e não venceu.
 */
async function indicacaoGuardadaAindaVale(token: string): Promise<boolean> {
  const db = supabaseAdmin as unknown as AfiliadosDb;
  const { data, error } = await db
    .from("affiliate_attributions")
    .select("converted_at, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return false;
  return data.converted_at === null && segundosAteVencer(data.expires_at) > 0;
}

export type RespostaDaVisita = { guardado: boolean };

/**
 * Registra a visita e grava o cookie. Nunca lança erro para a tela: um link
 * de afiliado quebrado não pode atrapalhar ninguém de ver o site.
 *
 * A resposta é só "guardou ou não" — de propósito, não diz se o código
 * existe. Sem isso, alguém poderia testar códigos um a um para descobrir
 * quem são os afiliados.
 */
export const registrarVisitaDeAfiliado = createServerFn({ method: "POST" })
  .inputValidator((d: { codigo: unknown }) => ({ codigo: normalizarCodigoDeAfiliado(d?.codigo) }))
  .handler(async ({ data }): Promise<RespostaDaVisita> => {
    if (!data.codigo) return { guardado: false };

    try {
      // PRIMEIRO CLIQUE VÁLIDO VENCE. Se já existe uma indicação válida
      // guardada, o segundo link não troca o dono — nem se for de outro
      // afiliado. Se a guardada não serve mais (venceu, foi usada, o
      // afiliado saiu), aí sim a nova ocupa o lugar.
      const guardado = tokenDoCookie(getCookie(COOKIE_DA_INDICACAO));
      if (guardado && (await indicacaoGuardadaAindaVale(guardado))) {
        return { guardado: false };
      }

      const db = supabaseAdmin as unknown as AfiliadosDb;
      const { data: linhas, error } = await db.rpc("afiliado_registrar_visita", {
        p_codigo: data.codigo,
        p_ip_hash: await impressaoDoIp(currentRequestIp()),
        p_user_agent: getRequestHeader("user-agent") ?? null,
      });

      if (error) {
        console.error("[afiliados] falha ao registrar visita:", error.message);
        return { guardado: false };
      }

      // Nenhuma linha = código inexistente, afiliado inativo ou programa
      // desligado. Tudo isso é, para quem visita, a mesma coisa: nada.
      const visita = linhas?.[0];
      if (!visita) return { guardado: false };

      const segundos = segundosAteVencer(visita.expires_at);
      if (segundos <= 0) return { guardado: false };

      setCookie(COOKIE_DA_INDICACAO, visita.token, opcoesDoCookie(segundos));
      return { guardado: true };
    } catch (erro) {
      console.error("[afiliados] erro inesperado ao registrar visita:", erro);
      return { guardado: false };
    }
  });
