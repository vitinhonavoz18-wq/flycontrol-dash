import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { codigoDoEndereco } from "@/lib/afiliados/codigo";
import {
  URL_DO_SISTEMA,
  enderecoNoSistema,
  type TelaDoSistema,
} from "@/lib/flydelivery-parceiros/site";

/**
 * Link para cadastro, login, Termos ou Privacidade.
 *
 * No próprio sistema é um link interno (troca de tela sem recarregar). Na
 * cópia de teste (preview), onde VITE_FLYDELIVERY_PARCEIROS_SISTEMA_URL aponta
 * para o site oficial, vira um link comum para lá — o visitante sai da cópia
 * e cai no cadastro de verdade, que funciona.
 *
 * Se a pessoa chegou com código de afiliado (?ref=CODIGO), o link para o site
 * oficial leva o código junto: lá ele é registrado e o afiliado recebe a
 * comissão. O código só entra depois que a página abre no navegador (o
 * servidor não sabe o endereço completo), e só se tiver o formato válido.
 */
export function LinkDoSistema({
  para,
  className,
  onClick,
  children,
}: {
  para: TelaDoSistema;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const externo = enderecoNoSistema(para, URL_DO_SISTEMA);
  const [indicacao, setIndicacao] = useState("");

  useEffect(() => {
    if (!externo) return;
    const codigo = codigoDoEndereco(window.location.search);
    if (codigo) setIndicacao(`?ref=${encodeURIComponent(codigo)}`);
  }, [externo]);

  const props = { className, onClick, children };

  if (externo) return <a href={`${externo}${indicacao}`} {...props} />;
  if (para === "/signup") {
    return <Link to="/signup" search={{ plan: undefined, google: undefined }} {...props} />;
  }
  if (para === "/login") return <Link to="/login" {...props} />;
  if (para === "/terms") return <Link to="/terms" {...props} />;
  return <Link to="/privacy" {...props} />;
}
