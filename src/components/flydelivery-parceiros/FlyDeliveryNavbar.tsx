import { useEffect, useRef, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { LINKS_DO_MENU } from "./dados";
import { Logo } from "./Logo";
import { LinkDoSistema } from "./LinkDoSistema";

/**
 * A barra do topo da página FlyDelivery Parceiros.
 *
 * Começa transparente sobre o Hero. Quando a pessoa rola, ganha um vidro bem
 * leve e uma sombra curta, para os links não se misturarem com o conteúdo
 * que passa por baixo.
 *
 * A troca é avisada pelo navegador quando a "sentinela" (um ponto invisível
 * no topo do Hero) sai da tela — não medimos a rolagem a cada pixel.
 *
 * No celular, os links viram um menu que abre por cima. Ele fecha no X, na
 * tecla Esc, ao tocar num link ou ao girar a tela para o modo largo.
 */
export function FlyDeliveryNavbar() {
  const [rolou, setRolou] = useState(false);
  const [aberto, setAberto] = useState(false);
  const botaoMenu = useRef<HTMLButtonElement>(null);
  const primeiroLink = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const sentinela = document.getElementById("fdp-sentinela");
    if (!sentinela || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(([e]) => setRolou(!e.isIntersecting));
    observador.observe(sentinela);
    return () => observador.disconnect();
  }, []);

  // Menu aberto: trava a rolagem do fundo, leva o foco para o primeiro link
  // e escuta o Esc. Ao fechar, o foco volta para o botão que abriu — quem
  // navega pelo teclado não "se perde" na página.
  useEffect(() => {
    if (!aberto) return;
    const overflowAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    primeiroLink.current?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    const telaLarga = window.matchMedia("(min-width: 1024px)");
    const aoAlargar = (e: MediaQueryListEvent) => e.matches && setAberto(false);

    window.addEventListener("keydown", aoTeclar);
    telaLarga.addEventListener("change", aoAlargar);
    const botao = botaoMenu.current;
    return () => {
      document.body.style.overflow = overflowAntes;
      window.removeEventListener("keydown", aoTeclar);
      telaLarga.removeEventListener("change", aoAlargar);
      botao?.focus();
    };
  }, [aberto]);

  const fechar = () => setAberto(false);

  return (
    <>
      <header
        className="fdp-nav fixed inset-x-0 top-0 z-50"
        data-rolou={rolou || aberto ? "sim" : "nao"}
      >
        <nav
          aria-label="Principal"
          className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-6 px-5 sm:h-[72px] sm:px-8"
        >
          <a href="#topo" aria-label="FlyDelivery Parceiros — voltar ao topo" className="shrink-0">
            <Logo />
          </a>

          <ul className="hidden items-center gap-7 lg:flex">
            {LINKS_DO_MENU.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="fdp-nav-link">
                  {link.rotulo}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-5 lg:flex">
            <LinkDoSistema para="/login" className="fdp-nav-link">
              Entrar
            </LinkDoSistema>
            <LinkDoSistema
              para="/signup"
              className="fdp-btn fdp-btn-primario min-h-[44px] px-5 text-[15px]"
            >
              Começar grátis
            </LinkDoSistema>
          </div>

          <button
            ref={botaoMenu}
            type="button"
            className="-mr-2 grid h-11 w-11 place-items-center rounded-full lg:hidden"
            style={{ color: "var(--fdp-texto)" }}
            aria-expanded={aberto}
            aria-controls="fdp-menu-celular"
            aria-label={aberto ? "Fechar menu" : "Abrir menu"}
            onClick={() => setAberto((v) => !v)}
          >
            {aberto ? (
              <X className="h-6 w-6" aria-hidden />
            ) : (
              <Menu className="h-6 w-6" aria-hidden />
            )}
          </button>
        </nav>
      </header>

      {/* O menu do celular. Fica no HTML só quando aberto: fechado, ele não
          existe para o leitor de tela nem para o Tab.

          Ele mora FORA da barra de propósito: o vidro (desfoque) da barra faz
          o navegador medir tudo que está dentro dela pelo tamanho da barra —
          o menu ficava com 64px de altura e só mostrava "Produto". */}
      {aberto && (
        <div
          id="fdp-menu-celular"
          className="fixed inset-x-0 bottom-0 top-16 z-50 overflow-y-auto border-t bg-white px-5 pb-10 pt-4 sm:top-[72px] sm:px-8 lg:hidden"
          style={{ borderColor: "var(--fdp-borda)" }}
        >
          <ul className="flex flex-col">
            {LINKS_DO_MENU.map((link, i) => (
              <li key={link.href} className="border-b" style={{ borderColor: "var(--fdp-borda)" }}>
                <a
                  ref={i === 0 ? primeiroLink : undefined}
                  href={link.href}
                  onClick={fechar}
                  className="flex items-center justify-between py-4 text-[19px] font-semibold tracking-[-0.02em]"
                  style={{ color: "var(--fdp-texto)" }}
                >
                  {link.rotulo}
                  <ArrowRight
                    className="h-5 w-5"
                    style={{ color: "var(--fdp-laranja)" }}
                    aria-hidden
                  />
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3">
            <LinkDoSistema
              para="/signup"
              className="fdp-btn fdp-btn-primario w-full"
              onClick={fechar}
            >
              Começar grátis
            </LinkDoSistema>
            <LinkDoSistema
              para="/login"
              className="fdp-btn fdp-btn-secundario w-full"
              onClick={fechar}
            >
              Entrar
            </LinkDoSistema>
          </div>
        </div>
      )}
    </>
  );
}
