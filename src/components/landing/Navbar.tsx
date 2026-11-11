import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";

/**
 * A barra do topo da página pública.
 *
 * Ela começa invisível sobre o Hero — só a logo e os links flutuando sobre a
 * página. Assim que a pessoa rola, o fundo se fecha e uma linha finíssima
 * aparece embaixo, para o texto da página não passar por trás dos links e
 * virar sopa de letras.
 *
 * A troca acontece por uma marca no elemento (`data-rolou`), não por medir a
 * página a cada pixel: o observador do navegador avisa quando a sentinela
 * invisível do topo sai da tela. Ficar escutando a rolagem para trocar uma
 * cor é como pesar o caminhão a cada metro da estrada só para saber se ele
 * já saiu do pátio.
 */

// Endereços com "/" na frente: a mesma barra aparece na Vitrine de Cardápios,
// e de lá "#produto" sozinho não levaria a lugar nenhum.
const LINKS = [
  { href: "/#produto", rotulo: "Produto" },
  { href: "/#recursos", rotulo: "Recursos" },
  { href: "/vitrine", rotulo: "Vitrine de Cardápios" },
  { href: "/#planos", rotulo: "Planos" },
] as const;

export function Navbar() {
  const [rolou, setRolou] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    const sentinela = document.getElementById("fly-topo");
    if (!sentinela || typeof IntersectionObserver === "undefined") return;

    const observador = new IntersectionObserver(([entrada]) => setRolou(!entrada.isIntersecting), {
      threshold: 0,
    });
    observador.observe(sentinela);
    return () => observador.disconnect();
  }, []);

  // Menu aberto no celular trava a rolagem do fundo — senão a página corre
  // atrás do menu e a pessoa perde o lugar onde estava.
  useEffect(() => {
    if (!menuAberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [menuAberto]);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-colors duration-300"
      style={
        rolou
          ? {
              // SEM desfoque de fundo, e isso foi medido, não chutado.
              //
              // O desfoque obriga o navegador a reler tudo o que passa atrás
              // da barra a cada quadro da rolagem. Aqui ele sozinho respondia
              // por 17 pontos percentuais dos quadros perdidos no computador
              // — de longe o item mais caro da página inteira.
              //
              // O branco quase fechado faz o mesmo serviço — separar a barra
              // do conteúdo — sem cobrar nada por quadro.
              background: "var(--fly-nav-bg)",
              borderBottom: "1px solid var(--fly-border-subtle)",
            }
          : { background: "transparent", borderBottom: "1px solid transparent" }
      }
    >
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-6 px-5 sm:h-20 sm:px-8">
        <a
          href="/#topo"
          className="flex shrink-0 items-center"
          style={{ color: "var(--fly-text-primary)" }}
          aria-label="FlyDelivery, ir ao topo"
        >
          {/* No celular, só o símbolo: o logo completo tinha 273 px e empurrava
              "Começar grátis" e o botão do menu para fora da tela — quem
              estava no celular não conseguia abrir o menu. */}
          <BrandLogo variant="symbol" eager className="h-9 sm:hidden" />
          <BrandLogo eager className="hidden h-11 sm:inline-flex" />
        </a>

        <nav aria-label="Seções da página" className="hidden items-center gap-9 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[15px] transition-colors hover:text-[color:var(--fly-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
              style={{ color: "var(--fly-text-secondary)", outlineColor: "var(--fly-primary)" }}
            >
              {link.rotulo}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/login"
            className="hidden rounded-full px-4 py-2 text-[15px] transition-colors hover:text-[color:var(--fly-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:block"
            style={{ color: "var(--fly-text-secondary)", outlineColor: "var(--fly-primary)" }}
          >
            Entrar
          </Link>
          <Link
            to="/signup"
            search={{ plan: undefined, google: undefined }}
            className="whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium tracking-[0.04em] transition-colors sm:px-5 sm:py-2.5 sm:text-[14px]"
            style={{ background: "var(--fly-primary)", color: "var(--fly-on-primary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--fly-primary-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--fly-primary)")}
          >
            Começar grátis
          </Link>

          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full lg:hidden"
            style={{ color: "var(--fly-text-secondary)" }}
            aria-expanded={menuAberto}
            aria-controls="fly-menu-mobile"
            aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
            onClick={() => setMenuAberto((v) => !v)}
          >
            {menuAberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuAberto && (
        <div
          id="fly-menu-mobile"
          className="lg:hidden"
          style={{
            background: "var(--fly-background)",
            borderTop: "1px solid var(--fly-border-subtle)",
            borderBottom: "1px solid var(--fly-border-subtle)",
          }}
        >
          <nav aria-label="Seções da página" className="flex flex-col px-5 py-3 sm:px-8">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuAberto(false)}
                className="border-b py-4 text-[17px]"
                style={{
                  color: "var(--fly-text-primary)",
                  borderColor: "var(--fly-border-subtle)",
                }}
              >
                {link.rotulo}
              </a>
            ))}
            <Link
              to="/login"
              onClick={() => setMenuAberto(false)}
              className="py-4 text-[17px]"
              style={{ color: "var(--fly-text-secondary)" }}
            >
              Entrar
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
