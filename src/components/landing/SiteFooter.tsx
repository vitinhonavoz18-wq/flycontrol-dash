import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { IconeInstagram, IconeWhatsApp } from "./iconesSociais";
import {
  INSTAGRAM_LINK,
  INSTAGRAM_VISIVEL,
  WHATSAPP_LINK,
  WHATSAPP_VISIVEL,
} from "@/lib/landing/contato";

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
      { rotulo: "Planos", href: "#planos" },
    ],
  },
] as const;

export function SiteFooter() {
  const ano = new Date().getFullYear();

  return (
    <footer
      className="fly-escuro border-t px-5 py-14 sm:px-8"
      style={{ borderColor: "var(--fly-border-subtle)", background: "var(--fly-background)" }}
    >
      <div className="mx-auto flex max-w-[1240px] flex-col gap-10 md:flex-row md:items-start md:justify-between">
        <div>
          <BrandLogo tone="onDark" className="h-11" />
          <p className="mt-4 max-w-xs text-[14px]" style={{ color: "var(--fly-text-muted)" }}>
            Do apetite ao pedido, tudo conectado em uma experiência única.
          </p>
        </div>

        {/* Com o Contato virando a quarta coluna, três vagas deixavam a
            última sobrando sozinha numa segunda fileira. Quatro vagas na
            tela grande, duas no celular. */}
        <div className="grid grid-cols-2 gap-x-12 gap-y-8 md:grid-cols-4">
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
                      className="text-[15px] transition-colors hover:text-[color:var(--fly-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
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
                  className="text-[15px] transition-colors hover:text-[color:var(--fly-text-primary)]"
                  style={{ color: "var(--fly-text-secondary)" }}
                >
                  Entrar
                </Link>
              </li>
              <li>
                <Link
                  to="/signup"
                  search={{ plan: undefined, google: undefined }}
                  className="text-[15px] transition-colors hover:text-[color:var(--fly-text-primary)]"
                  style={{ color: "var(--fly-text-secondary)" }}
                >
                  Criar conta
                </Link>
              </li>
            </ul>
          </nav>

          {/* O contato mostra o número e o perfil por extenso, e não só um
              ícone. Quem está decidindo assinar quer VER que existe gente do
              outro lado — é a diferença entre a placa "fale conosco" e o
              telefone escrito na porta da loja. */}
          <nav aria-label="Contato">
            <p className="fly-label" style={{ color: "var(--fly-text-muted)" }}>
              Contato
            </p>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href={WHATSAPP_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-[15px] transition-colors hover:text-[color:var(--fly-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    color: "var(--fly-text-secondary)",
                    outlineColor: "var(--fly-primary)",
                  }}
                >
                  <IconeWhatsApp />
                  {WHATSAPP_VISIVEL}
                </a>
              </li>
              <li>
                <a
                  href={INSTAGRAM_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-[15px] transition-colors hover:text-[color:var(--fly-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    color: "var(--fly-text-secondary)",
                    outlineColor: "var(--fly-primary)",
                  }}
                >
                  <IconeInstagram />
                  {INSTAGRAM_VISIVEL}
                </a>
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
                  className="text-[15px] transition-colors hover:text-[color:var(--fly-text-primary)]"
                  style={{ color: "var(--fly-text-secondary)" }}
                >
                  Termos
                </Link>
              </li>
              <li>
                <Link
                  to="/privacy"
                  className="text-[15px] transition-colors hover:text-[color:var(--fly-text-primary)]"
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
        © {ano} FlyDelivery · um produto ConnectFly
      </p>
    </footer>
  );
}
