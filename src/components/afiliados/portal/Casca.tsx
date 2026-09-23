import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import logo from "@/assets/flycontrol-logo-hero.png";
import { cn } from "@/lib/utils";
import { classeDoCampo } from "./Pecas";

/**
 * A casca preta do portal do afiliado.
 *
 * O portal é sempre "Black Premium", mesmo para quem deixou o painel do
 * restaurante no tema claro: é a vitrine da marca para quem vai vendê-la.
 * A classe `dark` aqui dentro faz os componentes padrão (campos, botões)
 * usarem as cores escuras sem mexer na escolha de tema de ninguém.
 */
export function CascaDoPortal({ children }: { children: ReactNode }) {
  // O menu do celular fica fixo embaixo. Sem esta folga, o navegador que
  // rola até um campo ou botão (ao tocar em "Próxima", ao abrir o teclado)
  // pode deixá-lo exatamente atrás do menu.
  useEffect(() => {
    const html = document.documentElement;
    const antes = html.style.scrollPaddingBottom;
    html.style.scrollPaddingBottom = "calc(96px + env(safe-area-inset-bottom))";
    return () => {
      html.style.scrollPaddingBottom = antes;
    };
  }, []);

  return (
    <div
      className="portal-afiliado dark font-fly min-h-dvh overflow-x-clip text-white antialiased"
      style={{
        background:
          "radial-gradient(1200px 600px at 10% -10%, rgba(255,90,0,0.12), transparent 60%), radial-gradient(900px 500px at 110% 10%, rgba(0,140,255,0.10), transparent 60%), #000",
      }}
    >
      {children}
    </div>
  );
}

export function LogoDoPortal({ para = "/affiliates" }: { para?: string }) {
  return (
    <Link to={para} className="flex items-center gap-2.5" aria-label="FlyControl Parceiros">
      <img src={logo} alt="FlyControl" className="h-8 w-auto object-contain" />
      <span className="hidden rounded-full border border-[#ff5a00]/30 bg-[#ff5a00]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ff8a3d] min-[380px]:inline">
        Parceiros
      </span>
    </Link>
  );
}

/** Topo das páginas abertas (apresentação, entrar, cadastrar). */
export function TopoPublico({ direita }: { direita?: ReactNode }) {
  return (
    <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:h-20 sm:px-6">
      <LogoDoPortal />
      <div className="flex items-center gap-2">{direita}</div>
    </header>
  );
}

/** Caixa central dos formulários de entrar/cadastrar. */
export function CaixaDeFormulario({
  titulo,
  texto,
  children,
  rodape,
}: {
  titulo: string;
  texto?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-md px-4 pb-16 pt-4 sm:pt-10">
      <div className="rounded-[24px] border border-white/[0.08] bg-[#080808]/90 p-5 shadow-[0_40px_100px_rgba(0,0,0,0.6)] sm:p-8">
        <h1 className="text-2xl font-medium tracking-[-0.03em]">{titulo}</h1>
        {texto ? <p className="mt-1.5 text-sm text-white/55">{texto}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      {rodape ? <div className="mt-6 text-center text-sm text-white/55">{rodape}</div> : null}
    </main>
  );
}

export function CampoDeSenha({
  id,
  valor,
  aoMudar,
  autoComplete,
  invalido,
}: {
  id: string;
  valor: string;
  aoMudar: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  invalido?: boolean;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={ver ? "text" : "password"}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={invalido || undefined}
        aria-describedby={invalido ? `${id}-erro` : undefined}
        className={cn(classeDoCampo, "pr-12")}
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-white/50 hover:text-white"
        aria-label={ver ? "Esconder senha" : "Mostrar senha"}
      >
        {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
