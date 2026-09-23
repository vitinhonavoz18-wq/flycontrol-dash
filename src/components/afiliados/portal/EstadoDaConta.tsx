import { Link } from "@tanstack/react-router";
import { Ban, Clock3, PauseCircle, UserPlus } from "lucide-react";
import type { ReactNode } from "react";
import { WHATSAPP_LINK } from "@/lib/landing/contato";
import type { SituacaoDoAfiliado } from "@/lib/afiliados/portal";
import { LogoDoPortal } from "./Casca";

/**
 * O que aparece no lugar do painel quando a conta não pode usá-lo.
 *
 * Nenhum número financeiro aparece aqui — nem zerado. O banco também não
 * entrega esses números para quem não está ativo (ver
 * `afiliado_ativo_do_usuario`); esta tela só explica o porquê.
 */
const TEXTOS: Record<
  Exclude<SituacaoDoAfiliado, "active"> | "sem_cadastro",
  { icone: ReactNode; titulo: string; texto: string; podeAjustar: boolean }
> = {
  pending: {
    icone: <Clock3 className="size-6" />,
    titulo: "Seu cadastro está em análise.",
    texto:
      "A equipe FlyControl confere cada parceiro antes de liberar o link. Assim que for aprovado, seu link e seu painel aparecem aqui. Enquanto isso, você já pode deixar sua chave Pix cadastrada.",
    podeAjustar: true,
  },
  suspended: {
    icone: <PauseCircle className="size-6" />,
    titulo: "Sua conta de parceiro está suspensa.",
    texto:
      "Enquanto a suspensão durar, seu link não registra novas indicações e não é possível pedir saque. Fale com a gente para entender o motivo.",
    podeAjustar: true,
  },
  blocked: {
    icone: <Ban className="size-6" />,
    titulo: "Sua conta de parceiro está bloqueada.",
    texto:
      "O acesso ao painel de parceiro foi encerrado. Se acha que é um engano, fale com a equipe FlyControl.",
    podeAjustar: false,
  },
  sem_cadastro: {
    icone: <UserPlus className="size-6" />,
    titulo: "Esta conta ainda não é parceira.",
    texto:
      "Você entrou com uma conta do FlyControl que não tem cadastro de parceiro. Leva um minuto para criar.",
    podeAjustar: false,
  },
};

export function EstadoDaConta({
  situacao,
  email,
  aoSair,
}: {
  situacao: Exclude<SituacaoDoAfiliado, "active"> | "sem_cadastro";
  email?: string | null;
  aoSair: () => void;
}) {
  const t = TEXTOS[situacao];
  const tom =
    situacao === "blocked"
      ? "bg-red-500/12 text-red-400"
      : situacao === "sem_cadastro"
        ? "bg-[#008cff]/12 text-[#5cb8ff]"
        : "bg-[#ff5a00]/12 text-[#ff8a3d]";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-6">
      <LogoDoPortal />
      <main className="my-auto py-10">
        <div
          className="rounded-[24px] border border-white/[0.08] bg-[#080808] p-6 sm:p-8"
          role="status"
        >
          <span className={`grid size-12 place-items-center rounded-full ${tom}`}>{t.icone}</span>
          <h1 className="mt-5 text-2xl font-medium tracking-[-0.03em]">{t.titulo}</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60">{t.texto}</p>
          {email ? <p className="mt-4 text-xs text-white/40">Conectado como {email}</p> : null}

          <div className="mt-6 flex flex-col gap-3">
            {situacao === "sem_cadastro" ? (
              <Link
                to="/affiliates/register"
                className="inline-flex h-12 items-center justify-center rounded-full bg-[#ff5a00] px-6 text-sm font-semibold text-white hover:bg-[#ff7a2b]"
              >
                Quero ser parceiro
              </Link>
            ) : null}
            {t.podeAjustar ? (
              <Link
                to="/affiliates/dashboard/settings"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-medium text-white hover:bg-white/5"
              >
                Meus dados e Pix
              </Link>
            ) : null}
            {situacao !== "sem_cadastro" ? (
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-medium text-white hover:bg-white/5"
              >
                Falar com a equipe
              </a>
            ) : null}
            <button
              type="button"
              onClick={aoSair}
              className="h-11 text-sm text-white/50 hover:text-white"
            >
              Sair
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
