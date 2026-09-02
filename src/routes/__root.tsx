import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import {
  getPublicSupabaseConfig,
  setPublicSupabaseConfig,
} from "@/integrations/supabase/publicConfig";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { InstallBanner } from "@/components/pwa/InstallBanner";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { NotificationsProvider } from "@/components/notifications/NotificationsProvider";

/**
 * O endereço oficial do site e a imagem que aparece na prévia do link.
 *
 * Quando alguém cola o endereço do FlyControl no WhatsApp, o WhatsApp não
 * abre o site: ele manda um robô buscar só o cabeçalho da página e lê estas
 * linhas para montar o cartãozinho da prévia. Por isso o endereço da imagem
 * precisa ser COMPLETO (começando com https://) — o robô não está "dentro"
 * do site para entender um caminho curto como "/imagem.jpg".
 *
 * É como o endereço no envelope: dentro do prédio basta dizer "apartamento
 * 42", mas o carteiro que vem de fora precisa da rua, do número e da cidade.
 *
 * O `-v2` no nome do arquivo é de propósito. WhatsApp e Facebook guardam a
 * imagem antiga por semanas; trocando o nome do arquivo eles são obrigados a
 * buscar a nova — é o mesmo motivo de trocar a placa da vitrine em vez de
 * repintar por cima.
 */
const SITE_URL = "https://flycontrol.conectfly.com.br/";
const IMAGEM_DA_PREVIA = "https://flycontrol.conectfly.com.br/flycontrol-social-preview-v2.jpg";
const TITULO = "FlyControl — o centro de operações do seu estabelecimento";
const DESCRICAO =
  "Pedidos, clientes, cardápio, operação e financeiro em uma plataforma só. 30 dias grátis e implementação gratuita.";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página não encontrada</h2>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Voltar
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error }: { error: Error }) {
  console.error(error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <a
          href="/"
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Início
        </a>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#ff7a00" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "FlyControl" },
      { name: "mobile-web-app-capable", content: "yes" },
      { title: TITULO },
      { name: "description", content: DESCRICAO },

      // A prévia do link. Uma configuração só, para o WhatsApp não ter duas
      // imagens para escolher e acabar pegando a errada.
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "FlyControl" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:url", content: SITE_URL },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRICAO },
      { property: "og:image", content: IMAGEM_DA_PREVIA },
      { property: "og:image:secure_url", content: IMAGEM_DA_PREVIA },
      { property: "og:image:type", content: "image/jpeg" },
      // Dizer a medida adianta o desenho do cartão: sem isso o WhatsApp
      // precisa baixar a imagem inteira antes de saber que espaço reservar,
      // e às vezes desiste no meio e mostra só o texto.
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "Painel do FlyControl com os pedidos em andamento",
      },

      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITULO },
      { name: "twitter:description", content: DESCRICAO },
      { name: "twitter:image", content: IMAGEM_DA_PREVIA },
      {
        name: "twitter:image:alt",
        content: "Painel do FlyControl com os pedidos em andamento",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Três vozes, três funções: Bricolage nos títulos (tem personalidade e
      // largura variável), Instrument Sans no texto corrido, e Courier Prime
      // nos números e horários — é a letra da impressora térmica de verdade.
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        // Inter entra na MESMA requisição das outras três — mesmo endereço,
        // mesma conexão já aberta. É a voz da página pública, onde o título
        // pesa pelo tamanho e não pelo negrito.
        href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,600;12..96,75..100,800&family=Instrument+Sans:wght@400;500;600&family=Courier+Prime:wght@400;700&family=Inter:wght@400;500;600&display=swap",
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/icon-apple-touch.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icons/icon-192.png" },
    ],
  }),
  // Roda no servidor ao montar a página e viaja junto com o HTML, então o
  // navegador já recebe o endereço do Supabase pronto — sem depender do que
  // estava configurado na máquina que compilou o site.
  loader: () => getPublicSupabaseConfig(),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Antes de qualquer tela: guarda o endereço que o servidor mandou. É uma
  // escrita em memória, não estado do React — roda aqui, no corpo do
  // componente raiz, porque o cliente do Supabase só é montado no primeiro
  // uso, que sempre acontece depois deste ponto.
  setPublicSupabaseConfig(Route.useLoaderData());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <AuthProvider>
          <Outlet />
          {/* Global mount: self-gates via useAuth() — Waiter Portal has no
              Supabase user, so pizzeriaIds stays null and no channel opens. */}
          <NotificationsProvider />
          <Toaster />
          <InstallBanner />
          <ServiceWorkerRegistration />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
