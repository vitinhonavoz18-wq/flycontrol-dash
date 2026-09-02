import { useEffect, useState } from "react";
import { WHATSAPP_LINK } from "@/lib/landing/contato";
import { IconeWhatsApp } from "./iconesSociais";
import { useMenosAnimacao } from "./useMenosAnimacao";

/**
 * O botão de WhatsApp que acompanha a página.
 *
 * POR QUE ELE NÃO APARECE DE CARA
 *
 * Ele só entra depois que a pessoa rola a primeira tela. Quem acabou de
 * chegar ainda está lendo o que é o FlyControl — oferecer ajuda nesse
 * instante é o garçom que pergunta "já escolheu?" antes de a pessoa abrir o
 * cardápio. Quem rolou a página é quem está pesquisando de verdade, e é aí
 * que a dúvida aparece.
 *
 * POR QUE VERDE, E NÃO LARANJA
 *
 * O laranja da marca é do botão "Começar grátis" — é o botão que fecha
 * venda. Se os dois tivessem a mesma cor, disputariam o olho da pessoa. O
 * verde do WhatsApp é reconhecido sem ninguém precisar ler: dá para saber o
 * que acontece ao clicar só de olhar. São dois pedidos diferentes, com duas
 * cores diferentes — como a placa de "entrada" e a de "saída" nunca serem
 * iguais.
 *
 * NO CELULAR
 *
 * Vira só o círculo com o símbolo. A frase "Tirar dúvidas" ocuparia meia
 * largura da tela em cima do conteúdo que a pessoa está lendo.
 */

/** Só aparece depois de a pessoa passar da primeira dobra. */
const ROLAGEM_MINIMA = 600;

export function BotaoWhatsApp() {
  const [visivel, setVisivel] = useState(false);
  const menosAnimacao = useMenosAnimacao();

  useEffect(() => {
    // A conta roda no máximo uma vez por quadro, e o estado do React só é
    // tocado quando a resposta MUDA. Sem isso, cada pixel de rolagem pediria
    // uma nova renderização da página inteira.
    let agendado = false;

    const conferir = () => {
      agendado = false;
      setVisivel((antes) => {
        const agora = window.scrollY > ROLAGEM_MINIMA;
        return agora === antes ? antes : agora;
      });
    };

    const aoRolar = () => {
      if (agendado) return;
      agendado = true;
      requestAnimationFrame(conferir);
    };

    conferir();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  return (
    <a
      href={WHATSAPP_LINK}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Tirar dúvidas no WhatsApp"
      // `aria-hidden` + `tabIndex` escondidos juntos: enquanto o botão está
      // invisível ele também não pode ser alcançado pelo teclado, senão a
      // pessoa que navega com Tab cai num botão que ninguém está vendo.
      aria-hidden={!visivel}
      tabIndex={visivel ? 0 : -1}
      className="group fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full p-4 text-[15px] font-medium text-white sm:bottom-7 sm:right-7 sm:py-3.5 sm:pl-4 sm:pr-5"
      style={{
        background: "#25D366",
        boxShadow: "0 10px 30px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.10) inset",
        opacity: visivel ? 1 : 0,
        // Fora da tela quando escondido, para não roubar o clique de nada
        // que esteja embaixo dele.
        transform: visivel ? "none" : "translateY(16px) scale(.9)",
        pointerEvents: visivel ? "auto" : "none",
        transition: menosAnimacao ? "none" : "opacity .25s ease, transform .25s ease",
      }}
    >
      <IconeWhatsApp className="h-6 w-6 shrink-0" />
      <span className="hidden sm:inline">Tirar dúvidas</span>
    </a>
  );
}
