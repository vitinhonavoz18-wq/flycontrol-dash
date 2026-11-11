import { createFileRoute, Link } from "@tanstack/react-router";
import { AmbientParticles } from "@/components/landing/AmbientParticles";
import { BotaoWhatsApp } from "@/components/landing/BotaoWhatsApp";
import { Navbar } from "@/components/landing/Navbar";
import { OperationFlow } from "@/components/landing/OperationFlow";
import { PricingSection } from "@/components/landing/PricingSection";
import { ProductShowcase } from "@/components/landing/ProductShowcase";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { StepFlow } from "@/components/landing/StepFlow";
import { HeroFoodShowcase } from "@/components/landing/vitrine/HeroFoodShowcase";
import { Reveal, SectionHeading, SectionLabel, SectionText } from "@/components/landing/primitivos";
import { BRAND } from "@/lib/brand";
import { TRIAL_DURATION_DAYS } from "@/lib/billing/trial";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: `${BRAND.name} — ${BRAND.tagline}` },
      {
        name: "description",
        content:
          "Pedidos, clientes, cardápio, operação e financeiro em uma plataforma só. " +
          `${TRIAL_DURATION_DAYS} dias grátis e implementação gratuita.`,
      },
    ],
  }),
});

/**
 * A página que o visitante vê antes de entrar no FlyDelivery.
 *
 * A IDEIA: "SEU DELIVERY COMEÇA NO DESEJO"
 *
 * A primeira tela fala a língua de quem vende comida: um hambúrguer que dá
 * fome, uma frase curta e dois botões. É a vitrine da lanchonete — antes de
 * explicar o cardápio, ela mostra o prato.
 *
 * Logo abaixo, a conversa muda de tom e mostra o sistema funcionando: o
 * quadro de pedidos, o cardápio, o financeiro. Quem chegou pela fome fica
 * pela organização.
 *
 * O VISUAL: BRANCO E LARANJA
 *
 * Fundo branco, texto azul-noturno e o laranja da marca. Só a chamada final e
 * o rodapé são escuros, para fechar a página com peso. As telas do sistema
 * aparecem no tema escuro de propósito: sobre o branco, elas viram o
 * destaque.
 *
 * O QUE A PÁGINA NÃO FAZ
 *
 * Não inventa recurso. Cada frase daqui corresponde a uma tela que existe no
 * sistema hoje. Não usa contagem regressiva, vaga limitada nem preço riscado.
 */
function Landing() {
  return (
    <div
      className="font-fly"
      style={{ background: "var(--fly-background)", color: "var(--fly-text-primary)" }}
    >
      <Navbar />

      <main id="topo">
        <Hero />
        <UmaPlataforma />

        <ProductShowcase
          id="produto"
          etiqueta="Pedidos"
          titulo={
            <>
              Do pedido recebido
              <br />
              até a entrega.
            </>
          }
          texto="O pedido entra na tela, você aceita, a cozinha recebe a comanda e o cliente acompanha em que pé está. Sem ninguém copiando nada à mão."
          pontos={[
            "Pedido novo com alerta sonoro",
            "Quadro por etapa: novo, em preparo, saiu",
            "Comanda impressa direto para a cozinha",
            "Delivery, retirada e mesa no mesmo quadro",
          ]}
          imagem={{
            src: "/images/painel-pedidos.webp",
            alt: "Quadro de pedidos do FlyDelivery, com as colunas Novo pedido, Em preparo e Saiu para entrega",
            largura: 1920,
            altura: 1500,
          }}
        />

        <ProductShowcase
          id="recursos"
          etiqueta="Seu cardápio. Sua marca."
          titulo="Venda do seu jeito."
          texto="Categorias, produtos, tamanhos, combos e bebidas. O que você salva no painel é o que o cliente vê na hora de pedir."
          pontos={[
            "Categorias e produtos com foto",
            "Combos, bordas e adicionais",
            "Três modos de navegação para o cliente",
            "Atualização na hora, sem republicar nada",
          ]}
          espelhado
          imagem={{
            src: "/images/painel-cardapio.webp",
            alt: "Tela de cardápio do FlyDelivery, com a lista de categorias do estabelecimento",
            largura: 1600,
            altura: 1250,
          }}
        />

        <ProductShowcase
          etiqueta="Operação presencial"
          titulo={
            <>
              O salão também
              <br />é operação.
            </>
          }
          texto="Mesa aberta, comanda somando, garçom identificado e comissão calculada no fim. O que acontece no salão entra na mesma conta do delivery."
          pontos={[
            "Mesas e comandas abertas",
            "Garçons com acesso próprio",
            "Comissão por garçom",
            "Fechamento da mesa no painel",
          ]}
          visual={
            <StepFlow
              degraus={[
                { titulo: "Mesa aberta", detalhe: "O garçom identifica a mesa e começa a comanda" },
                {
                  titulo: "Pedidos somando",
                  detalhe: "Cada item entra na conta da mesa",
                  ativo: true,
                },
                { titulo: "Fechamento", detalhe: "A conta fecha e a comissão é calculada" },
              ]}
            />
          }
        />

        <ProductShowcase
          etiqueta="Clientes"
          titulo={
            <>
              Transforme pedidos
              <br />
              em clientes recorrentes.
            </>
          }
          texto="Cada pedido também deixa um cliente na sua base. Dali saem as campanhas para quem já comprou — com o consentimento pedido no checkout."
          pontos={[
            "Base de clientes formada pelos pedidos",
            "Segmentação por comportamento de compra",
            "Campanhas por WhatsApp",
            "Consentimento pedido no checkout",
          ]}
          espelhado
          visual={
            <StepFlow
              degraus={[
                { titulo: "Clientes", detalhe: "A base que os próprios pedidos formaram" },
                { titulo: "Segmentação", detalhe: "Quem comprou, quando e o quê" },
                {
                  titulo: "Campanha",
                  detalhe: "A mensagem sai para o grupo escolhido",
                  ativo: true,
                },
                { titulo: "Nova venda", detalhe: "O pedido volta para o mesmo quadro" },
              ]}
            />
          }
        />

        <ProductShowcase
          etiqueta="Financeiro"
          titulo={
            <>
              Veja o dinheiro
              <br />
              por trás da operação.
            </>
          }
          texto="Faturamento, ticket médio, vendas por canal e desempenho por produto — no período que você escolher, sem abrir planilha."
          pontos={[
            "Faturamento e ticket médio",
            "Vendas por mesa, retirada e delivery",
            "Desempenho diário",
            "Distribuição por forma de pagamento",
          ]}
          imagem={{
            src: "/images/painel-financeiro.webp",
            alt: "Tela de gestão financeira do FlyDelivery, com faturamento, ticket médio e vendas por canal",
            largura: 1600,
            altura: 1250,
          }}
        />

        <PricingSection />
        <ChamadaFinal />
      </main>

      <SiteFooter />

      {/* Fica por cima de tudo e acompanha a rolagem, então vive fora do
          <main>: ele não é uma parte do texto da página, é o atendente
          parado no canto do salão. */}
      <BotaoWhatsApp />
    </div>
  );
}

/**
 * O Hero.
 *
 * Poucas coisas na primeira tela, de propósito: rótulo, título, uma frase,
 * dois botões e a arte. Cada item a mais aqui rouba atenção do único que
 * importa — a vontade de começar.
 */
function Hero() {
  return (
    <section
      aria-labelledby="hero-titulo"
      className="relative overflow-hidden px-5 pb-16 pt-20 sm:px-8 sm:pb-20 sm:pt-36 lg:pb-28 lg:pt-40"
      style={{
        // O calor por trás da arte: um laranja bem leve no lado direito, onde
        // está o hambúrguer. É gradiente, não desfoque — desenhado uma vez,
        // sem custo a cada quadro da rolagem.
        background:
          "radial-gradient(900px 620px at 82% 34%, rgb(var(--fly-primary-rgb) / .13), transparent 68%), linear-gradient(180deg, #fff 0%, #fff7f2 100%)",
      }}
    >
      {/* Sentinela invisível: quando ela sai da tela, a barra do topo ganha
          fundo. Existe só para o observador ter o que observar. */}
      <span id="fly-topo" aria-hidden="true" className="absolute left-0 top-0 h-1 w-1" />

      <AmbientParticles />

      {/* Três blocos: título, vitrine e texto com botões.

          No computador: título e texto à esquerda, vitrine à direita (a
          composição da arte aprovada). No celular, a vitrine entra ENTRE o
          título e o texto — o alimento aparece logo na primeira tela, sem a
          pessoa precisar rolar, e os botões continuam logo abaixo. */}
      <div className="relative mx-auto grid max-w-[1240px] items-center gap-x-8 gap-y-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-y-0">
        <div className="lg:col-start-1 lg:row-start-1 lg:self-end">
          <SectionLabel>Para restaurantes e deliveries</SectionLabel>

          <h1
            id="hero-titulo"
            className="fly-display mt-5"
            style={{ color: "var(--fly-text-primary)" }}
          >
            Seu delivery começa no <span style={{ color: "var(--fly-primary)" }}>desejo.</span>
          </h1>
        </div>

        {/* A vitrine: produtos reais dos cardápios do FlyDelivery, um de cada
            vez, flutuando entre os ícones da plataforma. Detalhes em
            components/landing/vitrine/HeroFoodShowcase.tsx. */}
        <div className="-my-3 w-full max-w-[290px] justify-self-center sm:my-0 sm:max-w-[560px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-w-none">
          <HeroFoodShowcase />
        </div>

        <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
          <p
            className="fly-body-lg hero-apoio max-w-lg lg:mt-7"
            style={{ color: "var(--fly-text-secondary)" }}
          >
            Do apetite ao pedido, tudo conectado em uma experiência única.
          </p>
          <p
            className="fly-body mt-3 hidden max-w-lg sm:block"
            style={{ color: "var(--fly-text-muted)" }}
          >
            Pedidos, cardápio, clientes e financeiro no mesmo lugar.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:mt-9 sm:flex-row sm:items-center">
            <Link
              to="/signup"
              search={{ plan: undefined, google: undefined }}
              className="rounded-full px-8 py-4 text-center text-[16px] font-semibold transition-[filter,transform] hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-px"
              style={{
                background: "linear-gradient(135deg, #f4581c 0%, #ff6b35 55%, #ff8a3d 100%)",
                color: "var(--fly-on-primary)",
                outlineColor: "var(--fly-primary)",
                boxShadow: "0 12px 28px -10px rgb(var(--fly-primary-rgb) / .65)",
              }}
            >
              Começar grátis
            </Link>
            <a
              href="#produto"
              className="rounded-full border-2 px-8 py-[14px] text-center text-[16px] font-semibold transition-colors hover:bg-[rgb(var(--fly-primary-rgb)/.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                borderColor: "var(--fly-primary)",
                color: "var(--fly-text-primary)",
                outlineColor: "var(--fly-primary)",
                background: "var(--fly-surface-01)",
              }}
            >
              Conhecer plataforma
            </a>
          </div>

          <p className="mt-6 text-[13px]" style={{ color: "var(--fly-text-muted)" }}>
            {TRIAL_DURATION_DAYS} dias grátis • Implementação gratuita
          </p>
        </div>
      </div>
    </section>
  );
}

/** A segunda seção: o argumento em uma frase, e as seis etapas da operação. */
function UmaPlataforma() {
  return (
    <section
      aria-labelledby="plataforma-titulo"
      className="border-t px-5 py-24 sm:px-8 md:py-32"
      style={{ borderColor: "var(--fly-border-subtle)" }}
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <SectionLabel>Uma plataforma. Toda a operação.</SectionLabel>
            <SectionHeading id="plataforma-titulo">
              Você vende.
              <br />O FlyDelivery organiza.
            </SectionHeading>
          </Reveal>

          <Reveal atraso={120} className="lg:pt-16">
            <SectionText className="max-w-lg">
              Centralize a rotina do estabelecimento sem depender de várias ferramentas separadas.
              Menos ferramentas, mais controle.
            </SectionText>
          </Reveal>
        </div>

        <OperationFlow />
      </div>
    </section>
  );
}

/** A última tela: uma frase e um botão, sobre o azul-noturno da marca. */
function ChamadaFinal() {
  return (
    <section
      aria-labelledby="final-titulo"
      className="fly-escuro border-t px-5 py-28 sm:px-8 md:py-36"
      style={{ borderColor: "var(--fly-border-subtle)", background: "var(--fly-background)" }}
    >
      <Reveal className="mx-auto max-w-[1240px] text-center">
        <h2
          id="final-titulo"
          className="fly-headline mx-auto max-w-3xl"
          style={{ color: "var(--fly-text-primary)" }}
        >
          Seu delivery pode
          <br />
          vender <span style={{ color: "var(--fly-primary)" }}>mais.</span>
        </h2>

        <p
          className="fly-body-lg mx-auto mt-8 max-w-xl"
          style={{ color: "var(--fly-text-secondary)" }}
        >
          Centralize pedidos, gestão e crescimento em uma plataforma criada para acompanhar sua
          empresa.
        </p>

        <div className="mt-12">
          <Link
            to="/signup"
            search={{ plan: undefined, google: undefined }}
            className="inline-flex rounded-full px-8 py-4 text-[16px] font-semibold transition-[filter] hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: "var(--fly-primary)",
              color: "var(--fly-on-primary)",
              outlineColor: "var(--fly-primary)",
            }}
          >
            Começar {TRIAL_DURATION_DAYS} dias grátis
          </Link>
        </div>

        <p className="mt-5 text-[13px]" style={{ color: "var(--fly-text-muted)" }}>
          Implementação gratuita
        </p>
      </Reveal>
    </section>
  );
}
