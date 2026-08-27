import { createFileRoute, Link } from "@tanstack/react-router";
import { MosaicoCardapios } from "@/components/landing/MosaicoCardapios";
import { PainelPedidos } from "@/components/landing/PainelPedidos";
import { formatCents } from "@/lib/billing/money";
import { PLAN_PRICING } from "@/lib/billing/plans";
import { TRIAL_DURATION_DAYS } from "@/lib/billing/trial";
import logo from "@/assets/flycontrol-logo.png";

export const Route = createFileRoute("/")({
  component: Landing,
});

const premium = PLAN_PRICING.premium;
const cents = PLAN_PRICING.cents;

/**
 * Página inicial do FlyControl.
 *
 * Direção: a cozinha à noite. O fundo é preto quente (não azulado), e a única
 * coisa acesa na tela é o painel de pedidos — que é exatamente o que se vê
 * numa cozinha às 19h40. O laranja da marca deixou de ser degradê de enfeite
 * e virou sinal: só aparece onde significa alguma coisa.
 *
 * A página segue UM pedido, com os horários reais de uma noite. A sequência é
 * verdadeira — o pedido entra, imprime, sai, e vira dinheiro no fim —, então
 * numerar por horário informa em vez de decorar.
 *
 * O mosaico de cardápios entra logo antes do preço, e essa ordem é de
 * propósito: primeiro a pessoa vê quem já usa, depois vê quanto custa.
 */
function Landing() {
  return (
    <div className="font-corpo" style={{ background: "#0B0908", color: "#F4EFE4" }}>
      <Cabecalho />
      <Abertura />
      <UmaNoite />
      <MosaicoCardapios />
      <Precos />
      <Fechamento />
      <Rodape />
    </div>
  );
}

function Cabecalho() {
  return (
    <header className="safe-x sticky top-0 z-40 border-b border-white/5 backdrop-blur-md">
      <div
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3"
        style={{ background: "transparent" }}
      >
        <img src={logo} alt="FlyControl" className="h-10 w-auto md:h-12" />
        <nav className="flex items-center gap-1">
          <Link
            to="/login"
            className="rounded-lg px-4 py-2 text-sm font-medium text-white/60 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A00]"
          >
            Entrar
          </Link>
          <Link
            to="/signup"
            search={{ plan: undefined, google: undefined }}
            className="rounded-lg bg-[#FF5A00] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#ff7a2b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A00]"
          >
            Criar conta
          </Link>
        </nav>
      </div>
    </header>
  );
}

// Lado a lado só a partir de 1024px. Entre 768 e 1023 não cabem os dois: o
// painel comeria a largura do título e a frase quebraria em pedaços. Nessa
// faixa o painel desce para baixo do texto, inteiro.
function Abertura() {
  return (
    <section className="safe-x mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 md:pb-28 md:pt-20 lg:grid-cols-[1fr_minmax(0,460px)] lg:gap-14">
      <div>
        {/* Sem rótulo de horário aqui: o painel ao lado já mostra 19:42, e a
            mesma informação duas vezes no mesmo campo de visão não informa —
            só ocupa. O relógio como estrutura começa na seção seguinte.

            O tamanho do título foi medido contra a letra de reserva (a do
            sistema, mais larga que a Bricolage): se as duas primeiras frases
            couberem numa linha só com ela, cabem também quando a fonte boa
            carrega. A última frase quebra onde couber — é a única que pode. */}
        <h1 className="font-display text-[clamp(1.85rem,7vw,2.6rem)] md:text-[clamp(2.6rem,6vw,4rem)] lg:text-[clamp(2.4rem,4.4vw,3.4rem)]">
          O pedido entra.
          <br />
          A cozinha imprime.
          <br />
          <span style={{ color: "#FF5A00" }}>Você não corre atrás de nada.</span>
        </h1>

        <p className="mt-6 max-w-md text-[17px] leading-relaxed text-white/55">
          FlyControl cuida da noite inteira do seu restaurante: o pedido chega, a comanda sai, o
          cliente acompanha e o caixa fecha sozinho no fim.
        </p>

        <p className="mt-5 font-comanda text-sm tracking-[0.06em] text-white/70">
          Os primeiros <span className="text-[#FF5A00]">{TRIAL_DURATION_DAYS} dias</span> são por
          nossa conta.
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/signup"
            search={{ plan: undefined, google: undefined }}
            className="rounded-xl bg-[#FF5A00] px-7 py-3.5 text-center text-sm font-bold text-black transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A00]"
          >
            Criar minha conta
          </Link>
          <Link
            to="/plans"
            className="rounded-xl border border-white/12 px-7 py-3.5 text-center text-sm font-semibold text-white/70 transition-colors hover:border-white/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A00]"
          >
            Ver os planos
          </Link>
        </div>
      </div>

      <div className="flex min-w-0 justify-center lg:justify-end">
        <PainelPedidos />
      </div>
    </section>
  );
}

/** As quatro batidas de um pedido. Horários reais, não números decorativos. */
const NOITE = [
  {
    hora: "19:42",
    titulo: "O pedido chega e você já sabe",
    texto:
      "Toca um alerta e o pedido aparece na tela. Ninguém fica esperando por engano, ninguém perde pedido no meio da correria.",
  },
  {
    hora: "19:43",
    titulo: "A comanda sai pronta pra cozinha",
    texto:
      "Um toque e a comanda sai impressa, organizada, fácil de ler. Sem letra torta, sem confusão de quem pediu o quê.",
  },
  {
    hora: "19:47",
    titulo: "O cliente acompanha sem ligar",
    texto:
      "Novo, preparando, saiu para entrega, entregue. Ele vê em que pé está o pedido dele — e para de ligar perguntando.",
  },
  {
    hora: "23:58",
    titulo: "O caixa fecha sem você somar nada",
    texto:
      "Faturamento do dia, valor médio por pedido e os horários de mais movimento, prontos. Sem abrir planilha.",
  },
];

function UmaNoite() {
  return (
    <section className="safe-x border-t border-white/5 px-5 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-display max-w-lg text-[clamp(1.7rem,3.6vw,2.5rem)]">
          Uma noite no seu restaurante
        </h2>
        <p className="mt-4 max-w-md text-white/50">
          Do primeiro pedido ao fechamento do caixa, sem ninguém copiando nada à mão.
        </p>

        <ol className="mt-14 space-y-0">
          {NOITE.map((passo) => (
            <li
              key={passo.hora}
              className="grid gap-2 border-t border-white/8 py-7 md:grid-cols-[7rem_1fr_1.2fr] md:gap-8 md:py-9"
            >
              <span className="font-comanda text-sm tracking-[0.2em] text-[#FF5A00]">
                {passo.hora}
              </span>
              <h3 className="font-display text-[1.35rem] leading-tight md:text-[1.5rem]">
                {passo.titulo}
              </h3>
              <p className="max-w-md leading-relaxed text-white/50">{passo.texto}</p>
            </li>
          ))}
        </ol>

        <p className="mt-10 max-w-2xl border-t border-white/8 pt-7 text-white/50">
          E se você tem mais de uma loja no sistema, uma nunca enxerga os pedidos, os clientes ou o
          faturamento da outra — cada uma tem o próprio cofre.
        </p>
      </div>
    </section>
  );
}

function Precos() {
  return (
    <section className="safe-x border-t border-white/5 px-5 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-display text-[clamp(1.7rem,3.6vw,2.5rem)]">Quanto custa</h2>
        <p className="mt-4 max-w-lg text-white/50">
          Você começa com {TRIAL_DURATION_DAYS} dias grátis. Depois, escolhe o jeito de pagar que
          combina com o tamanho da sua operação — e dá para trocar quando quiser.
        </p>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <Plano
            nome={cents.name}
            etiqueta="Onde seu cadastro começa"
            valor={formatCents(cents.defaultOrderUnitPriceCents)}
            unidade="por pedido válido"
            segundaLinha="Sem taxa de cadastro e sem mensalidade"
            destaque
            explicacao={`Você não paga nada para começar: são ${TRIAL_DURATION_DAYS} dias grátis e, depois, só os pedidos que realmente entram. Ao passar de ${cents.promotionThresholdOrders} pedidos válidos no mês, cada pedido cai para ${formatCents(cents.promotionalOrderUnitPriceCents)} no mês seguinte.`}
            itens={[
              "Sem taxa para entrar",
              "Sem mensalidade fixa",
              "Gestão de pedidos e cardápio",
              "Fica mais barato quanto mais você vende",
            ]}
          />
          <Plano
            nome={premium.name}
            etiqueta="Mensalidade fixa"
            valor={formatCents(premium.monthlyFeeCents)}
            unidade="por mês"
            explicacao="Você sabe exatamente quanto vai pagar todo mês, não importa quantos pedidos entrarem. Para quem já tem movimento constante e quer tudo: mesas, garçons e comissões inclusos."
            itens={[
              "Pedidos sem cobrança por unidade",
              "Mesas, garçons e comissões",
              "Cardápio e clientes",
            ]}
          />
        </div>

        <p className="mt-8">
          <Link
            to="/plans"
            className="text-sm font-semibold text-[#FF5A00] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A00]"
          >
            Comparar os dois planos lado a lado
          </Link>
        </p>
      </div>
    </section>
  );
}

function Plano({
  nome,
  etiqueta,
  valor,
  unidade,
  segundaLinha,
  explicacao,
  itens,
  destaque = false,
}: {
  nome: string;
  etiqueta: string;
  valor: string;
  unidade: string;
  segundaLinha?: string;
  explicacao: string;
  itens: string[];
  destaque?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-7 md:p-9"
      style={{
        background: "#171310",
        border: destaque ? "1px solid rgba(255,90,0,0.35)" : "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-2xl">{nome}</h3>
        <span className="font-comanda text-[11px] uppercase tracking-[0.14em] text-white/45">
          {etiqueta}
        </span>
      </div>

      <p className="mt-6 flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-4xl" style={{ color: "#FF5A00" }}>
          {valor}
        </span>
        <span className="text-sm text-white/45">{unidade}</span>
      </p>
      {segundaLinha && <p className="mt-1 font-semibold text-white/85">{segundaLinha}</p>}

      <p className="mt-5 text-[15px] leading-relaxed text-white/50">{explicacao}</p>

      <ul className="mt-6 space-y-2.5 border-t border-white/8 pt-6">
        {itens.map((item) => (
          <li key={item} className="flex gap-3 text-[15px] text-white/75">
            <span className="font-comanda text-[#FF5A00]" aria-hidden="true">
              ✓
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Fechamento() {
  return (
    <section className="safe-x border-t border-white/5 px-5 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <p className="font-comanda text-xs tracking-[0.25em] text-[#FF5A00]">23:59</p>
        <h2 className="font-display mt-4 max-w-2xl text-[clamp(2rem,5vw,3.4rem)]">
          Amanhã a noite recomeça. Dessa vez, organizada.
        </h2>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/signup"
            search={{ plan: undefined, google: undefined }}
            className="rounded-xl bg-[#FF5A00] px-7 py-3.5 text-center text-sm font-bold text-black transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A00]"
          >
            Criar minha conta
          </Link>
          <Link
            to="/login"
            className="rounded-xl border border-white/12 px-7 py-3.5 text-center text-sm font-semibold text-white/70 transition-colors hover:border-white/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A00]"
          >
            Já tenho conta
          </Link>
        </div>
      </div>
    </section>
  );
}

function Rodape() {
  return (
    <footer className="safe-x border-t border-white/5 px-5 py-9">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <span className="font-comanda text-[11px] tracking-[0.14em] text-white/30">
          © {new Date().getFullYear()} FLYCONTROL
        </span>
        <div className="flex gap-5 text-xs text-white/35">
          <Link to="/terms" className="transition-colors hover:text-white/70">
            Termos de uso
          </Link>
          <Link to="/privacy" className="transition-colors hover:text-white/70">
            Privacidade
          </Link>
        </div>
      </div>
    </footer>
  );
}
