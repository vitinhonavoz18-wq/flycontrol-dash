import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CaixaDeFormulario, CampoDeSenha, TopoPublico } from "@/components/afiliados/portal/Casca";
import { BotaoPrincipal, Campo, Carregando } from "@/components/afiliados/portal/Pecas";
import { supabase } from "@/integrations/supabase/client";
import { validatePassword } from "@/lib/signup/validation";

export const Route = createFileRoute("/affiliates/reset-password")({ component: NovaSenha });

/**
 * Onde o link do e-mail "recuperar senha" chega.
 *
 * Quem prova a identidade é o próprio link, emitido pelo Supabase: ao abrir
 * a página, ele vira uma sessão temporária de recuperação. Sem essa sessão
 * (link vencido, já usado ou página aberta à mão), não há senha para trocar
 * — a tela manda pedir outro link.
 */
function NovaSenha() {
  const nav = useNavigate();
  const [pronto, setPronto] = useState<"verificando" | "ok" | "invalido">("verificando");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    // Só um link de recuperação de verdade abre o formulário. Uma sessão
    // comum NÃO basta — senão qualquer pessoa com o celular do parceiro
    // desbloqueado trocaria a senha dele sem saber a atual.
    //
    // Lido aqui, no primeiro efeito da página: os efeitos da tela rodam antes
    // dos da raiz do site, então o endereço ainda não foi limpo pelo cliente
    // do Supabase.
    const veioDoLink =
      /type=recovery/.test(window.location.hash) || /[?&]code=/.test(window.location.search);
    if (!veioDoLink) {
      setPronto("invalido");
      return;
    }
    let vivo = true;
    const { data: sub } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (!vivo) return;
      if (evento === "PASSWORD_RECOVERY" || (evento === "SIGNED_IN" && sessao)) setPronto("ok");
    });
    // O cliente do Supabase lê o link assim que carrega; se isso já
    // aconteceu antes desta tela montar, a sessão já está lá.
    const espera = window.setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (!vivo) return;
      setPronto((atual) => (atual === "ok" || data.session ? "ok" : "invalido"));
    }, 1200);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const regra = validatePassword(senha);
    if (!regra.valid) return setErro(regra.message);
    if (senha !== confirma) return setErro("As senhas não coincidem.");
    setErro(null);
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) {
      toast.error("Não foi possível trocar a senha. Peça um novo link.");
      return;
    }
    toast.success("Senha trocada!");
    nav({ to: "/affiliates/dashboard" });
  }

  return (
    <>
      <TopoPublico />
      <CaixaDeFormulario titulo="Criar senha nova">
        {pronto === "verificando" ? (
          <Carregando linhas={2} altura="h-12" />
        ) : pronto === "invalido" ? (
          <div className="space-y-4 text-sm text-white/70">
            <p>Este link venceu ou já foi usado.</p>
            <Link to="/affiliates/login" className="text-[#ff8a3d] hover:underline">
              Pedir um link novo
            </Link>
          </div>
        ) : (
          <form onSubmit={salvar} className="space-y-4" noValidate>
            <Campo
              id="nova"
              rotulo="Senha nova"
              ajuda="Mínimo de 8 caracteres, com letra e número."
            >
              <CampoDeSenha
                id="nova"
                valor={senha}
                aoMudar={setSenha}
                autoComplete="new-password"
              />
            </Campo>
            <Campo id="confirma" rotulo="Repita a senha nova" erro={erro}>
              <CampoDeSenha
                id="confirma"
                valor={confirma}
                aoMudar={setConfirma}
                autoComplete="new-password"
                invalido={Boolean(erro)}
              />
            </Campo>
            <BotaoPrincipal type="submit" disabled={salvando} className="w-full">
              {salvando ? "Salvando..." : "Salvar senha"}
            </BotaoPrincipal>
          </form>
        )}
      </CaixaDeFormulario>
    </>
  );
}
