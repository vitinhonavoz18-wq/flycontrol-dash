import { MessageSquare, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { linkWhatsAppSuporte, WHATSAPP_VISIVEL } from "@/lib/landing/contato";

/**
 * A tela que o cliente PREMIUM vê quando ainda não contratou o Chat.
 *
 * Não é um "acesso negado". É uma vitrine: diz o que o recurso faz, e o botão
 * abre o WhatsApp do suporte com a frase já digitada — a pessoa só aperta
 * enviar. Sem a frase pronta, ela cai numa tela em branco e trava, do mesmo
 * jeito que a gente trava ao ligar para um lugar sem saber como começar.
 *
 * E do seu lado chega escrito de onde ela veio, o que evita a pergunta "quem
 * é você?" logo na primeira mensagem.
 */

const MENSAGEM_PRONTA = "Olá! Tenho o plano premium e quero contratar o CRM/Chat do Fly Control.";

const O_QUE_VEM_JUNTO = [
  "Todas as conversas do WhatsApp da loja em uma tela só",
  "Histórico completo de cada cliente, sem perder nada",
  "Responder sem precisar pegar o celular",
  "Sua equipe dividindo o atendimento, cada um com a sua conversa",
];

export function CrmNaoContratado({ carregando = false }: { carregando?: boolean }) {
  // Enquanto o sistema ainda está conferindo a contratação, mostrar a vitrine
  // seria oferecer a venda a quem já comprou. Melhor esperar meio segundo.
  if (carregando) {
    return (
      <div className="grid min-h-[60dvh] place-items-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 p-6 text-center sm:p-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <MessageSquare className="h-8 w-8 text-primary" aria-hidden="true" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold">O Chat é um recurso adicional</h1>
        <p className="max-w-md text-muted-foreground">
          Ele não vem incluído no seu plano: é contratado à parte. Fale com a gente pelo WhatsApp
          que ativamos para a sua loja.
        </p>
      </div>

      <ul className="space-y-1.5 text-left text-sm">
        {O_QUE_VEM_JUNTO.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <Check
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            {item}
          </li>
        ))}
      </ul>

      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button asChild className="h-12">
          {/* `rel="noreferrer"` é obrigatório junto do target: sem ele, a
              página aberta ganha uma alça de volta para esta aqui. */}
          <a href={linkWhatsAppSuporte(MENSAGEM_PRONTA)} target="_blank" rel="noopener noreferrer">
            Falar com o suporte no WhatsApp
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">{WHATSAPP_VISIVEL}</p>
      </div>
    </div>
  );
}
