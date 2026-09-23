/**
 * Cadastro de parceiro (afiliado). Servidor apenas.
 *
 * Dois caminhos, igual ao cadastro de loja:
 *
 * - quem ainda não tem conta no FlyControl: o servidor cria o login (e-mail
 *   e senha) e, em seguida, a ficha de afiliado. Se a ficha falhar, o login
 *   recém-criado é apagado — senão a pessoa ficaria com um e-mail "preso",
 *   sem conseguir tentar de novo;
 * - quem JÁ tem conta (um dono de restaurante que quer indicar também):
 *   entra primeiro e o servidor só cria a ficha, ligada ao login dele. Quem
 *   diz qual é o login é o próprio Supabase, conferindo o passe da sessão —
 *   nunca um número mandado pela tela.
 *
 * O código de indicação, a porcentagem e a situação ("em análise" ou
 * "ativo") são decididos pelo banco. Nada disso é aceito do navegador.
 */

import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkAndRecordSignupAttempt, currentRequestIp } from "@/lib/signup/rateLimit.server";
import { normalizeEmail } from "@/lib/signup/validation";
import {
  TERMOS_DO_AFILIADO_VERSAO,
  validarCadastroDeAfiliado,
  type DadosDoCadastroDeAfiliado,
} from "./validacao";

type CadastroDb = {
  rpc: (
    fn: "afiliado_cadastrar",
    args: {
      p_user_id: string;
      p_nome: string;
      p_email: string;
      p_telefone: string | null;
      p_termos_versao: string;
    },
  ) => Promise<{
    data: { affiliate_id: string; referral_code: string; status: string }[] | null;
    error: { message: string } | null;
  }>;
};

export type ResultadoDoCadastroDeAfiliado =
  | { ok: true; status: "pending" | "active" }
  | {
      ok: false;
      motivo: "email_existente" | "ja_afiliado" | "programa_desligado";
      mensagem: string;
    };

/** O que o banco responde → frase para a pessoa. */
function mensagemDoBanco(erro: string): string {
  if (/ja_afiliado/.test(erro))
    return "Esta conta já tem cadastro de parceiro. Entre para ver seu painel.";
  if (/programa_desligado/.test(erro))
    return "O programa de parceiros está fechado para novos cadastros no momento.";
  if (/nome_invalido/.test(erro)) return "Informe seu nome completo.";
  if (/email_invalido/.test(erro)) return "Informe um e-mail válido.";
  if (/telefone_invalido/.test(erro)) return "Informe um celular com DDD.";
  return "Não foi possível concluir o cadastro. Tente novamente em instantes.";
}

async function criarFicha(userId: string, nome: string, email: string, telefone: string | null) {
  const db = supabaseAdmin as unknown as CadastroDb;
  return db.rpc("afiliado_cadastrar", {
    p_user_id: userId,
    p_nome: nome,
    p_email: email,
    p_telefone: telefone,
    p_termos_versao: TERMOS_DO_AFILIADO_VERSAO,
  });
}

export const cadastrarAfiliado = createServerFn({ method: "POST" })
  .inputValidator((d: DadosDoCadastroDeAfiliado & { accessToken?: string | null }) => {
    const logado = Boolean(d?.accessToken);
    const erros = validarCadastroDeAfiliado(d, { exigirSenha: !logado });
    const primeiro = Object.values(erros).find(Boolean);
    if (primeiro) throw new Error(primeiro);
    return d;
  })
  .handler(async ({ data }): Promise<ResultadoDoCadastroDeAfiliado> => {
    // Mesmo limite de tentativas do cadastro de loja: sem ele, um robô
    // criaria contas sem parar.
    const { allowed } = await checkAndRecordSignupAttempt(currentRequestIp());
    if (!allowed) {
      throw new Error("Muitas tentativas de cadastro. Aguarde um pouco e tente novamente.");
    }

    const nome = data.nome.trim();
    const telefone = data.telefone?.trim() || null;

    // ---- Caminho 1: já tem conta e está logado --------------------------
    if (data.accessToken) {
      const { data: sessao, error } = await supabaseAdmin.auth.getUser(data.accessToken);
      if (error || !sessao?.user?.email) {
        throw new Error("Sua sessão expirou. Entre novamente.");
      }
      const { data: linhas, error: erroFicha } = await criarFicha(
        sessao.user.id,
        nome,
        normalizeEmail(sessao.user.email),
        telefone,
      );
      if (erroFicha || !linhas?.[0]) {
        const msg = erroFicha?.message ?? "";
        if (/ja_afiliado/.test(msg))
          return { ok: false, motivo: "ja_afiliado", mensagem: mensagemDoBanco(msg) };
        if (/programa_desligado/.test(msg)) {
          return { ok: false, motivo: "programa_desligado", mensagem: mensagemDoBanco(msg) };
        }
        console.error("[afiliados] falha ao criar ficha (conta existente):", msg);
        throw new Error(mensagemDoBanco(msg));
      }
      return { ok: true, status: linhas[0].status === "active" ? "active" : "pending" };
    }

    // ---- Caminho 2: conta nova ------------------------------------------
    const email = normalizeEmail(data.email);

    const { data: bloqueado } = await supabaseAdmin
      .from("blocked_emails")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (bloqueado) {
      throw new Error("Este e-mail não pode ser usado para criar uma conta. Use outro e-mail.");
    }

    const { data: criado, error: erroLogin } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.senha ?? "",
      // Mesmo motivo do cadastro de loja: o projeto não envia e-mail de
      // confirmação, e exigir a confirmação deixaria a pessoa sem entrar.
      email_confirm: true,
      user_metadata: { full_name: nome, origem: "afiliado" },
    });

    if (erroLogin || !criado?.user) {
      const msg = String(erroLogin?.message ?? "");
      if (/already|exists|registered/i.test(msg)) {
        return {
          ok: false,
          motivo: "email_existente",
          mensagem:
            "Este e-mail já tem conta no FlyControl. Entre com ela para ativar seu cadastro de parceiro.",
        };
      }
      console.error("[afiliados] falha ao criar login:", erroLogin);
      throw new Error("Não foi possível criar sua conta. Tente novamente em instantes.");
    }

    const { data: linhas, error: erroFicha } = await criarFicha(
      criado.user.id,
      nome,
      email,
      telefone,
    );

    if (erroFicha || !linhas?.[0]) {
      const msg = erroFicha?.message ?? "";
      console.error("[afiliados] falha ao criar ficha; desfazendo o login:", msg);
      await supabaseAdmin.auth.admin.deleteUser(criado.user.id);
      if (/programa_desligado/.test(msg)) {
        return { ok: false, motivo: "programa_desligado", mensagem: mensagemDoBanco(msg) };
      }
      throw new Error(mensagemDoBanco(msg));
    }

    return { ok: true, status: linhas[0].status === "active" ? "active" : "pending" };
  });
