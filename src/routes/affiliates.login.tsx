import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CaixaDeFormulario, CampoDeSenha, TopoPublico } from "@/components/afiliados/portal/Casca";
import { BotaoPrincipal, Campo, classeDoCampo } from "@/components/afiliados/portal/Pecas";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { WHATSAPP_LINK } from "@/lib/landing/contato";
import { validateEmail } from "@/lib/signup/validation";

export const Route = createFileRoute("/affiliates/login")({ component: EntrarComoParceiro });

/**
 * Entrar no portal. É o MESMO login do FlyControl (Supabase) — quem é dono
 * de restaurante e também parceiro usa um e-mail e uma senha só.
 */
function EntrarComoParceiro() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [modo, setModo] = useState<"entrar" | "esqueci">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [linkEnviado, setLinkEnviado] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!validateEmail(email).valid || !senha) {
      toast.error("Informe e-mail e senha.");
      return;
    }
    setEnviando(true);
    const { error } = await signIn(email.trim(), senha);
    setEnviando(false);
    if (error) {
      // A mensagem do provedor vem em inglês e às vezes revela demais
      // ("usuário não existe"). Uma frase só para qualquer falha.
      toast.error("E-mail ou senha incorretos.");
      return;
    }
    nav({ to: "/affiliates/dashboard" });
  }

  async function pedirLink(e: React.FormEvent) {
    e.preventDefault();
    if (!validateEmail(email).valid) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    setEnviando(true);
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/affiliates/reset-password`,
    });
    setEnviando(false);
    // Mesma resposta exista ou não a conta: senão esta tela viraria um
    // jeito de descobrir quem tem cadastro.
    setLinkEnviado(true);
  }

  if (modo === "esqueci") {
    return (
      <>
        <TopoPublico />
        <CaixaDeFormulario
          titulo="Recuperar senha"
          texto="Enviamos um link para você criar uma senha nova."
          rodape={
            <button
              type="button"
              onClick={() => setModo("entrar")}
              className="text-[#ff8a3d] hover:underline"
            >
              Voltar para entrar
            </button>
          }
        >
          {linkEnviado ? (
            <div className="space-y-3 text-sm text-white/70" role="status">
              <p>
                Se existir uma conta com <strong className="text-white">{email.trim()}</strong>, o
                link chega em alguns minutos. Confira também a caixa de spam.
              </p>
              <p>
                Não chegou?{" "}
                <a
                  href={WHATSAPP_LINK}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#ff8a3d] hover:underline"
                >
                  Fale com a gente no WhatsApp
                </a>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={pedirLink} className="space-y-4" noValidate>
              <Campo id="email" rotulo="E-mail">
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={classeDoCampo}
                />
              </Campo>
              <BotaoPrincipal type="submit" disabled={enviando} className="w-full">
                {enviando ? "Enviando..." : "Enviar link"}
              </BotaoPrincipal>
            </form>
          )}
        </CaixaDeFormulario>
      </>
    );
  }

  return (
    <>
      <TopoPublico />
      <CaixaDeFormulario
        titulo="Entrar"
        texto="Acesse seu painel de parceiro."
        rodape={
          <>
            Ainda não é parceiro?{" "}
            <Link to="/affiliates/register" className="text-[#ff8a3d] hover:underline">
              Cadastre-se
            </Link>
          </>
        }
      >
        <form onSubmit={entrar} className="space-y-4" noValidate>
          <Campo id="email" rotulo="E-mail">
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={classeDoCampo}
            />
          </Campo>
          <Campo id="senha" rotulo="Senha">
            <CampoDeSenha
              id="senha"
              valor={senha}
              aoMudar={setSenha}
              autoComplete="current-password"
            />
          </Campo>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setModo("esqueci")}
              className="text-sm text-white/55 hover:text-white"
            >
              Esqueci minha senha
            </button>
          </div>
          <BotaoPrincipal type="submit" disabled={enviando} className="w-full">
            {enviando ? "Entrando..." : "Entrar"}
          </BotaoPrincipal>
        </form>
      </CaixaDeFormulario>
    </>
  );
}
