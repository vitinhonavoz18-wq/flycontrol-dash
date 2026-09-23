import { useEffect } from "react";
import { codigoDoEndereco } from "@/lib/afiliados/codigo";
import { registrarVisitaDeAfiliado } from "@/lib/afiliados/rastreio.functions";

/** Marca, nesta aba, os códigos que já foram avisados ao servidor. */
const JA_AVISADO = "afiliado_link_avisado";

/**
 * Percebe quem chegou por `flycontrol.conectfly.com.br/?ref=CODIGO` e avisa o
 * servidor, uma vez. Não desenha nada na tela.
 *
 * O componente não guarda a indicação e não sabe se o código existe — só
 * repassa o que está no endereço. Quem confere e grava é o servidor. Por
 * isso tanto faz se alguém mexer aqui pelo navegador: o pior que consegue é
 * mandar um código inválido, que o servidor descarta.
 */
export function CapturaDeIndicacao() {
  useEffect(() => {
    const codigo = codigoDoEndereco(window.location.search);
    if (!codigo) return;

    // Recarregar a página não precisa bater no servidor de novo. É só
    // economia: o servidor já ignora repetições por conta própria.
    try {
      if (sessionStorage.getItem(JA_AVISADO) === codigo) return;
      sessionStorage.setItem(JA_AVISADO, codigo);
    } catch {
      // Aba anônima ou armazenamento bloqueado: segue sem a economia.
    }

    registrarVisitaDeAfiliado({ data: { codigo } }).catch(() => {
      // Link de afiliado com problema nunca atrapalha quem está visitando.
    });
  }, []);

  return null;
}
