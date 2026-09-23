import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CaixaDeFormulario, CampoDeSenha, TopoPublico } from "@/components/afiliados/portal/Casca";
import {
  BotaoPrincipal,
  Campo,
  Carregando,
  classeDoCampo,
} from "@/components/afiliados/portal/Pecas";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cadastrarAfiliado } from "@/lib/afiliados/cadastro.functions";
import { usePerfilDoAfiliado, useRegrasPublicas } from "@/lib/afiliados/portal";
import { validarCadastroDeAfiliado, type ErrosDoCadastro } from "@/lib/afiliados/validacao";
import { formatPhone } from "@/lib/signup/validation";

export const Route = createFileRoute("/affiliates/register")({ component: CadastroDeParceiro });

/**
 * Cadastro de parceiro. Pede só o necessário: nome, e-mail, celular e senha.
 * Pix e o resto ficam para depois, em Configurações — ninguém precisa da
 * chave Pix antes de ter o que sacar.
 *
 * Quem já tem conta no FlyControl (um dono de restaurante, por exemplo) e
 * está logado vê só nome e celular: o login dele é reaproveitado.
 */
function CadastroDeParceiro() {
  const { user, session, loading, signIn } = useAuth();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const cadastrar = useServerFn(cadastrarAfiliado);
  const { data: regras } = useRegrasPublicas();
  const perfil = usePerfilDoAfiliado(user?.id);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [aceitou, setAceitou] = useState(false);
  const [erros, setErros] = useState<ErrosDoCadastro>({});
  const [enviando, setEnviando] = useState(false);

  const logado = Boolean(user && session);

  // Já é parceiro: não tem o que cadastrar.
  useEffect(() => {
    if (perfil.data) nav({ to: "/affiliates/dashboard" });
  }, [perfil.data, nav]);

  useEffect(() => {
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    if (user && !nome && typeof meta.full_name === "string") setNome(meta.full_name);
    // Só na primeira vez que o login aparece.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const dados = { nome, email, telefone, senha, aceitouTermos: aceitou };
    const encontrados = validarCadastroDeAfiliado(dados, { exigirSenha: !logado });
    setErros(encontrados);
    if (Object.values(encontrados).some(Boolean)) return;

    setEnviando(true);
    try {
      const resposta = await cadastrar({
        data: logado
          ? {
              nome,
              email: user?.email ?? "",
              telefone,
              aceitouTermos: true,
              accessToken: session?.access_token,
            }
          : { ...dados, accessToken: null },
      });

      if (!resposta.ok) {
        toast.error(resposta.mensagem);
        if (resposta.motivo === "email_existente") nav({ to: "/affiliates/login" });
        if (resposta.motivo === "ja_afiliado") nav({ to: "/affiliates/dashboard" });
        return;
      }

      if (!logado) {
        const { error } = await signIn(email.trim(), senha);
        if (error) {
          toast.success("Cadastro feito! Entre com seu e-mail e senha.");
          nav({ to: "/affiliates/login" });
          return;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["afiliado"] });
      toast.success(
        resposta.status === "active" ? "Cadastro aprovado. Bem-vindo!" : "Cadastro recebido!",
      );
      nav({ to: "/affiliates/dashboard" });
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível concluir o cadastro.");
    } finally {
      setEnviando(false);
    }
  }

  if (loading || (user && perfil.isLoading)) {
    return (
      <>
        <TopoPublico />
        <div className="mx-auto max-w-md px-4 pt-10">
          <Carregando linhas={4} altura="h-12" />
        </div>
      </>
    );
  }

  if (regras && !regras.programa_ativo) {
    return (
      <>
        <TopoPublico />
        <CaixaDeFormulario
          titulo="Cadastros fechados"
          texto="O programa de parceiros não está recebendo novos cadastros no momento."
        >
          <Link to="/affiliates" className="text-sm text-[#ff8a3d] hover:underline">
            Voltar
          </Link>
        </CaixaDeFormulario>
      </>
    );
  }

  return (
    <>
      <TopoPublico />
      <CaixaDeFormulario
        titulo="Seja parceiro FlyControl"
        texto={
          logado ? (
            <>
              Você vai usar a conta <strong className="text-white">{user?.email}</strong>. Falta
              pouco.
            </>
          ) : (
            "Leva um minuto. Você recebe seu link assim que o cadastro for aprovado."
          )
        }
        rodape={
          logado ? (
            <button
              type="button"
              className="text-white/60 hover:text-white"
              onClick={async () => {
                await supabase.auth.signOut();
                queryClient.removeQueries({ queryKey: ["afiliado"] });
              }}
            >
              Não é você? Sair e usar outro e-mail
            </button>
          ) : (
            <>
              Já é parceiro?{" "}
              <Link to="/affiliates/login" className="text-[#ff8a3d] hover:underline">
                Entrar
              </Link>
            </>
          )
        }
      >
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <Campo id="nome" rotulo="Nome completo" erro={erros.nome}>
            <input
              id="nome"
              autoComplete="name"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              aria-invalid={Boolean(erros.nome) || undefined}
              className={classeDoCampo}
            />
          </Campo>

          {!logado ? (
            <Campo id="email" rotulo="E-mail" erro={erros.email}>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(erros.email) || undefined}
                className={classeDoCampo}
              />
            </Campo>
          ) : null}

          <Campo id="telefone" rotulo="Celular (WhatsApp)" erro={erros.telefone}>
            <input
              id="telefone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(11) 99999-9999"
              value={telefone}
              onChange={(e) => setTelefone(formatPhone(e.target.value))}
              aria-invalid={Boolean(erros.telefone) || undefined}
              className={classeDoCampo}
            />
          </Campo>

          {!logado ? (
            <Campo
              id="senha"
              rotulo="Senha"
              erro={erros.senha}
              ajuda="Mínimo de 8 caracteres, com letra e número."
            >
              <CampoDeSenha
                id="senha"
                valor={senha}
                aoMudar={setSenha}
                autoComplete="new-password"
                invalido={Boolean(erros.senha)}
              />
            </Campo>
          ) : null}

          <div className="space-y-1.5">
            <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-white/70">
              <input
                type="checkbox"
                checked={aceitou}
                onChange={(e) => setAceitou(e.target.checked)}
                className="mt-1 size-5 shrink-0 accent-[#ff5a00]"
              />
              <span>
                Li e aceito as{" "}
                <a
                  href="/affiliates#regras"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#ff8a3d] underline"
                >
                  regras do programa
                </a>
                , os{" "}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#ff8a3d] underline"
                >
                  Termos de Uso
                </a>{" "}
                e a{" "}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#ff8a3d] underline"
                >
                  Política de Privacidade
                </a>
                .
              </span>
            </label>
            {erros.termos ? <p className="text-xs text-red-400">{erros.termos}</p> : null}
          </div>

          <BotaoPrincipal type="submit" disabled={enviando} className="w-full">
            {enviando ? "Cadastrando..." : "Criar meu cadastro"}
          </BotaoPrincipal>
        </form>
      </CaixaDeFormulario>
    </>
  );
}
