import { Link } from "@tanstack/react-router";
import logo from "@/assets/flycontrol-logo-hero.png";

/**
 * O rodapé: logo, meia dúzia de links e a linha do ano.
 *
 * Rodapé grande é enfeite. Quem chegou até aqui ou vai criar conta, ou vai
 * ler os termos — as duas coisas cabem em uma linha.
 */

const COLUNAS = [
  {
    titulo: "Produto",
    itens: [
      { rotulo: "Produto", href: "#produto" },
      { rotulo: "Recursos", href: "#recursos" },
      { rotulo: "Integrações", href: "#integracoes" },
      { rotulo: "Planos", href: "#planos" },
    ],
  },
] as const;

export function SiteFooter() {
  const ano = new Date().getFullYear();

  return (
    <footer
      className="border-t px-5 py-14 sm:px-8"
      style={{ borderColor: "var(--fly-border-subtle)", background: "var(--fly-background)" }}
    >
      <div className="mx-auto flex max-w-[1240px] flex-col gap-10 md:flex-row md:items-start md:justify-between">
        <div>
          <img src={logo} alt="FlyControl" className="h-14 w-auto" />
          <p className="mt-4 max-w-xs text-[14px]" style={{ color: "var(--fly-text-muted)" }}>
            O centro de operações do seu estabelecimento.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-12 gap-y-8 sm:grid-cols-3">
          {COLUNAS.map((coluna) => (
            <nav key={coluna.titulo} aria-label={coluna.titulo}>
              <p className="fly-label" style={{ color: "var(--fly-text-muted)" }}>
                {coluna.titulo}
              </p>
              <ul className="mt-4 space-y-3">
                {coluna.itens.map((item) => (
                  <li key={item.rotulo}>
                    <a
                      href={item.href}
                      className="text-[15px] transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{
                        color: "var(--fly-text-secondary)",
                        outlineColor: "var(--fly-primary)",
                      }}
                    >
                      {item.rotulo}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <nav aria-label="Conta">
            <p className="fly-label" style={{ color: "var(--fly-text-muted)" }}>
              Conta
            </p>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  to="/login"
                  className="text-[15px] transition-colors hover:text-white"
                  style={{ color: "var(--fly-text-secondary)" }}
                >
                  Entrar
                </Link>
              </li>
              <li>
                <Link
                  to="/signup"
                  search={{ plan: undefined, google: undefined }}
                  className="text-[15px] transition-colors hover:text-white"
                  style={{ color: "var(--fly-text-secondary)" }}
                >
                  Criar conta
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Legal">
            <p className="fly-label" style={{ color: "var(--fly-text-muted)" }}>
              Legal
            </p>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  to="/terms"
                  className="text-[15px] transition-colors hover:text-white"
                  style={{ color: "var(--fly-text-secondary)" }}
                >
                  Termos
                </Link>
              </li>
              <li>
                <Link
                  to="/privacy"
                  className="text-[15px] transition-colors hover:text-white"
                  style={{ color: "var(--fly-text-secondary)" }}
                >
                  Privacidade
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      <p
        className="mx-auto mt-12 max-w-[1240px] border-t pt-8 text-[13px]"
        style={{ borderColor: "var(--fly-border-subtle)", color: "var(--fly-text-muted)" }}
      >
        © {ano} FlyControl
      </p>
    </footer>
  );
}
