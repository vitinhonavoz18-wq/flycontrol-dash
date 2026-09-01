import { createFileRoute, Link } from "@tanstack/react-router";
import { AmbientParticles } from "@/components/landing/AmbientParticles";
import { DashboardShowcase } from "@/components/landing/DashboardShowcase";
import { FloatingNotification } from "@/components/landing/FloatingNotification";
import { Navbar } from "@/components/landing/Navbar";
import { OperationFlow } from "@/components/landing/OperationFlow";
import { PricingSection } from "@/components/landing/PricingSection";
import { ProductShowcase } from "@/components/landing/ProductShowcase";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { StepFlow } from "@/components/landing/StepFlow";
import { Reveal, SectionHeading, SectionLabel, SectionText } from "@/components/landing/primitivos";
import { TRIAL_DURATION_DAYS } from "@/lib/billing/trial";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "FlyControl — o centro de operações do seu estabelecimento" },
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
 * A página que o visitante vê antes de entrar no FlyControl.
 *
 * A IDEIA: CENTRO DE OPERAÇÕES
 *
 * A pessoa que abre esta página está com um problema concreto — pedido
 * perdido, planilha que ninguém preenche, três sistemas que não conversam. A
 * página não tenta emocioná-la; ela mostra o painel funcionando e diz o que
 * ele faz.
 *
 * POR QUE O PRINT É O PROTAGONISTA
 *
 * Foto de gente sorrindo com tablet não vende sistema — qualquer software do
 * mundo usa a mesma foto. O que convence é ver a tela. Por isso o Hero tem
 * pouca coisa: um título, duas frases, dois botões e o painel de verdade,
 * flutuando devagar.
 *
 * O QUE A PÁGINA NÃO FAZ
 *
 * Não inventa recurso. Cada frase daqui corresponde a uma tela que existe no
 * sistema hoje. Não usa contagem regressiva, vaga limitada nem preço riscado.
 * E não muda a cor da marca: o laranja é o mesmo da logo.
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
            src: "/images/flycontrol-dashboard.webp",
            alt: "Quadro de pedidos do FlyControl, com as colunas Novo pedido, Em preparo e Saiu para entrega",
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
            src: "/images/flycontrol-cardapio.webp",
            alt: "Tela de cardápio do FlyControl, com a lista de categorias do estabelecimento",
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
            src: "/images/flycontrol-financeiro.webp",
            alt: "Tela de gestão financeira do FlyControl, com faturamento, ticket médio e vendas por canal",
            largura: 1600,
            altura: 1250,
          }}
        />

        <PricingSection />
        <ChamadaFinal />
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * O Hero.
 *
 * Poucas coisas na primeira tela, de propósito: rótulo, título, duas frases,
 * dois botões e o painel. Cada item a mais aqui rouba atenção do único que
 * importa — o produto funcionando.
 */
function Hero() {
  return (
    <section
      aria-labelledby="hero-titulo"
      className="relative overflow-hidden px-5 pb-24 pt-28 sm:px-8 sm:pt-36 lg:pb-32 lg:pt-44"
    >
      {/* Sentinela invisível: quando ela sai da tela, a barra do topo escurece.
          Existe só para o observador ter o que observar. */}
      <span id="fly-topo" aria-hidden="true" className="absolute left-0 top-0 h-1 w-1" />

      <AmbientParticles />

      <div className="relative mx-auto grid max-w-[1240px] items-center gap-14 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <SectionLabel>Centro de operações</SectionLabel>

          <h1
            id="hero-titulo"
            className="fly-display mt-6"
            style={{ color: "var(--fly-text-primary)" }}
          >
            Sua operação.
            <br />
            Sob controle.
          </h1>

          <p className="fly-body-lg mt-8 max-w-lg" style={{ color: "var(--fly-text-secondary)" }}>
            Pedidos, clientes, cardápio, operação, financeiro e crescimento conectados em uma única
            plataforma.
          </p>
          <p className="fly-body mt-3 max-w-lg" style={{ color: "var(--fly-text-muted)" }}>
            Do primeiro pedido à gestão completa.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to="/signup"
              search={{ plan: undefined, google: undefined }}
              className="rounded-full px-7 py-3.5 text-center text-[15px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                background: "var(--fly-primary)",
                color: "#000",
                outlineColor: "var(--fly-primary)",
              }}
            >
              Começar grátis
            </Link>
            <a
              href="#produto"
              className="rounded-full border px-7 py-3.5 text-center text-[15px] transition-colors hover:border-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                borderColor: "var(--fly-border-strong)",
                color: "var(--fly-text-primary)",
                outlineColor: "var(--fly-primary)",
              }}
            >
              Conhecer o FlyControl
            </a>
          </div>

          <p className="mt-6 text-[13px]" style={{ color: "var(--fly-text-muted)" }}>
            {TRIAL_DURATION_DAYS} dias grátis • Implementação gratuita
          </p>
        </div>

        <div className="relative">
          <DashboardShowcase
            src="/images/flycontrol-dashboard.webp"
            alt="Painel do FlyControl mostrando os pedidos em andamento, separados por etapa"
            largura={1920}
            altura={1500}
            prioridade
          />

          {/* Dois avisos, não seis. Eles sugerem que o sistema está vivo; se
              virarem enxame, viram enfeite. */}
          <FloatingNotification
            titulo="Novo pedido recebido"
            detalhe="Pedido #1842 · 3 itens"
            className="-left-8 top-2 xl:-left-16"
          />
          <FloatingNotification
            titulo="Pedido confirmado"
            detalhe="Saiu para entrega"
            className="-right-4 bottom-6 xl:-right-10"
            atraso={4}
          />
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
              <br />O FlyControl organiza.
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

/** A última tela: uma frase, um botão, e o preto de novo. */
function ChamadaFinal() {
  return (
    <section
      aria-labelledby="final-titulo"
      className="border-t px-5 py-28 sm:px-8 md:py-40"
      style={{ borderColor: "var(--fly-border-subtle)", background: "var(--fly-background)" }}
    >
      <Reveal className="mx-auto max-w-[1240px] text-center">
        <h2
          id="final-titulo"
          className="fly-headline mx-auto max-w-3xl"
          style={{ color: "var(--fly-text-primary)" }}
        >
          Sua operação pode
          <br />
          funcionar melhor.
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
            className="inline-flex rounded-full px-8 py-4 text-[15px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: "var(--fly-primary)",
              color: "#000",
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
