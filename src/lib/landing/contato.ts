/**
 * O contato oficial do FlyControl, escrito uma vez só.
 *
 * O número aparece em três lugares: o botão flutuante, o rodapé e o texto
 * que a pessoa lê. Se cada um tivesse a sua cópia, no dia em que o número
 * mudasse seria como trocar o telefone do restaurante e esquecer do panfleto
 * antigo circulando na rua — alguém ainda ligaria para o número velho.
 *
 * Por isso tudo sai daqui. Muda num lugar, muda em todos.
 */

/** Só os dígitos, do jeito que o WhatsApp exige no endereço: país + DDD + número. */
const NUMERO_LIMPO = "5571999373863";

/** Do jeito que a pessoa lê e reconhece como telefone. */
export const WHATSAPP_VISIVEL = "(71) 99937-3863";

/**
 * A frase que já vem digitada quando a conversa abre.
 *
 * Sem ela, a pessoa cai numa tela em branco e trava — é o mesmo desconforto
 * de ligar para um lugar e não saber como começar. Com a frase pronta, ela
 * só aperta enviar. E do seu lado chega escrito de onde a pessoa veio, o que
 * evita a pergunta "quem é você?" logo na primeira mensagem.
 */
const PRIMEIRA_MENSAGEM = "Olá! Vim pelo site do FlyControl e gostaria de tirar uma dúvida.";

export const WHATSAPP_LINK = `https://wa.me/${NUMERO_LIMPO}?text=${encodeURIComponent(
  PRIMEIRA_MENSAGEM,
)}`;

export const INSTAGRAM_VISIVEL = "@flycontrolofc";
export const INSTAGRAM_LINK = "https://instagram.com/flycontrolofc";
