import { Link } from "@tanstack/react-router";
import { linkWhatsAppSuporte } from "@/lib/landing/contato";
import { Logo } from "./Logo";

/**
 * O rodapé.
 *
 * Só leva para o que existe: as seções desta página, o login, os Termos e a
 * Política de Privacidade que já estão no ar, e o WhatsApp de suporte — o
 * mesmo número oficial usado em todo o sistema (vem de lib/landing/contato,
 * não foi digitado de novo aqui).
 *
 * Não tem CNPJ, endereço nem telefone fixo: essas informações não existem
 * no projeto, e rodapé não é lugar de inventar.
 */

const SUPORTE = linkWhatsAppSuporte(
  "Olá! Vim pelo site do FlyDelivery Parceiros e gostaria de tirar uma dúvida.",
);

export function FlyDeliveryFooter() {
  const ano = new Date().getFullYear();

  return (
    <footer
      className="border-t px-5 pb-10 pt-14 sm:px-8"
      style={{ background: "var(--fdp-superficie)" }}
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo />
            <p
              className="mt-4 max-w-xs text-[15px] leading-relaxed"
              style={{ color: "var(--fdp-texto-2)" }}
            >
              Pedidos, cardápio, entregas e operação do seu delivery em um só lugar.
            </p>
          </div>

          <nav aria-label="Plataforma">
            <h2 className="text-sm font-bold">FlyDelivery</h2>
            <ul className="mt-4 flex flex-col gap-3 text-[15px]">
              <ItemDoRodape href="#produto">Produto</ItemDoRodape>
              <ItemDoRodape href="#recursos">Recursos</ItemDoRodape>
              <ItemDoRodape href="#marketplace">Marketplace</ItemDoRodape>
              <ItemDoRodape href="#parceiros">Parceiros</ItemDoRodape>
            </ul>
          </nav>

          <nav aria-label="Ajuda e informações legais">
            <h2 className="text-sm font-bold">Ajuda</h2>
            <ul className="mt-4 flex flex-col gap-3 text-[15px]">
              <ItemDoRodape href={SUPORTE} externo>
                Suporte
              </ItemDoRodape>
              <li>
                <Link to="/terms" className="fdp-nav-link px-0 text-[15px]">
                  Termos
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="fdp-nav-link px-0 text-[15px]">
                  Privacidade
                </Link>
              </li>
              <li>
                <Link to="/login" className="fdp-nav-link px-0 text-[15px]">
                  Entrar
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div
          className="mt-12 flex flex-col gap-2 border-t pt-6 text-[13px] sm:flex-row sm:items-center sm:justify-between"
          style={{ color: "var(--fdp-texto-3)" }}
        >
          <p>© {ano} FlyDelivery. Todos os direitos reservados.</p>
          <p>Feito para restaurantes e deliveries.</p>
        </div>
      </div>
    </footer>
  );
}

function ItemDoRodape({
  href,
  externo = false,
  children,
}: {
  href: string;
  externo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        className="fdp-nav-link px-0 text-[15px]"
        {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
        {externo && <span className="sr-only"> (abre o WhatsApp em outra aba)</span>}
      </a>
    </li>
  );
}
