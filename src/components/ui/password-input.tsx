import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Campo de senha com o olhinho de mostrar/ocultar.
 *
 * É o mesmo `Input` de sempre — só ganha o botão do lado direito. Quem usa
 * passa exatamente as props que passaria para um input comum, e o `type`
 * fica por conta daqui.
 *
 * O QUE ELE NÃO FAZ, DE PROPÓSITO
 *
 * Não guarda a senha em lugar nenhum: o valor continua sendo do formulário
 * que chamou, como sempre foi. O olhinho só troca a máscara da tela — é a
 * diferença entre virar o papel para ler o que está escrito e tirar uma
 * cópia dele.
 *
 * O botão é `type="button"`. Sem isso, dentro de um formulário, clicar no
 * olhinho enviaria o formulário — o cliente clicaria para conferir a senha e
 * o cadastro sairia sozinho, pela metade.
 */
const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentPropsWithoutRef<typeof Input>, "type">
>(({ className, ...props }, ref) => {
  const [visivel, setVisivel] = React.useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        ref={ref}
        type={visivel ? "text" : "password"}
        // Espaço à direita para o texto nunca passar por baixo do botão.
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        // O olhinho não faz parte da sequência de tabulação do formulário:
        // quem navega pelo teclado quer ir do campo direto para o botão de
        // entrar, não parar num controle de exibição no meio do caminho.
        tabIndex={-1}
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visivel}
        title={visivel ? "Ocultar senha" : "Mostrar senha"}
        // 44px de alvo de toque: no celular, um ícone pequeno demais faz a
        // pessoa errar o clique e acabar dentro do campo.
        className="absolute right-0 top-0 grid h-full w-11 place-items-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring disabled:opacity-50"
        disabled={props.disabled}
      >
        {visivel ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
