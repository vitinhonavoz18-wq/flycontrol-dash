import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { resolveGoogleAuthState } from "@/lib/signup/googleAuth.functions";

export const Route = createFileRoute("/auth/callback")({ component: AuthCallback });

/**
 * Para onde o Google devolve o navegador depois do login.
 *
 * O próprio Supabase já lê o retorno da URL e monta a sessão sozinho
 * (`detectSessionInUrl` no cliente) — esta tela só espera isso terminar e
 * decide para onde mandar a pessoa: painel, cobrança pendente ou o cadastro
 * (pré-preenchido, pulando a senha que ela já provou não precisar de novo).
 */
function AuthCallback() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const ranRef = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (loading || ranRef.current) return;

    if (!user) {
      // Sem sessão: ou o login com o Google foi cancelado, ou a pessoa abriu
      // este endereço direto. De volta para o começo.
      nav({ to: "/login" });
      return;
    }

    ranRef.current = true;

    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setFailed(true);
        return;
      }

      try {
        const state = await resolveGoogleAuthState({ data: { accessToken } });
        if (state.status === "ready") {
          await nav({ to: "/dashboard" });
        } else if (state.status === "pending_payment") {
          await nav({ to: "/billing" });
        } else {
          await nav({
            to: "/signup",
            search: { plan: undefined, google: "1" },
          });
        }
      } catch (err) {
        console.error("[auth/callback]", err);
        setFailed(true);
      }
    })();
  }, [user, loading, nav]);

  if (failed) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4 text-center">
        <div>
          <p className="mb-4 text-sm text-muted-foreground">
            Não foi possível concluir o login com o Google. Tente novamente.
          </p>
          <a href="/login" className="text-sm font-medium text-primary underline">
            Voltar ao login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
      Entrando...
    </div>
  );
}
