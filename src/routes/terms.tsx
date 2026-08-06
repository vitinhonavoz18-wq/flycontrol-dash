import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LegalDocument, LegalSection } from "@/components/legal/LegalDocument";
import { formatCents } from "@/lib/billing/money";
import { PLAN_PRICING } from "@/lib/billing/plans";
import { PENDING_LEGAL_SECTIONS, TERMS_LAST_UPDATED, TERMS_VERSION } from "@/lib/legal/terms";
import { FEATURE_LABELS } from "@/lib/planPermissions";

export const Route = createFileRoute("/terms")({ component: TermsPage });

const premium = PLAN_PRICING.premium;
const cents = PLAN_PRICING.cents;
const restricted = Object.values(FEATURE_LABELS).join(", ");

function TermsPage() {
  return (
    <LegalDocument
      title="Termos de uso e condições comerciais"
      version={TERMS_VERSION}
      lastUpdated={TERMS_LAST_UPDATED}
      pendingIntro={
        "As condições comerciais abaixo descrevem com precisão como a cobrança da FlyControl " +
        "funciona hoje. As cláusulas jurídicas ainda estão em redação e serão publicadas em uma " +
        "próxima versão deste documento:"
      }
      pendingSections={PENDING_LEGAL_SECTIONS}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" className="h-11 flex-1">
            <Link to="/privacy">Política de privacidade</Link>
          </Button>
          <Button asChild className="h-11 flex-1">
            <Link to="/signup" search={{ plan: undefined }}>
              Criar minha conta
            </Link>
          </Button>
        </div>
      }
    >
      <LegalSection id="objeto" title="1. Objeto">
        <p>
          A FlyControl é uma plataforma de gestão de pedidos, cardápio, mesas e operação de
          delivery, oferecida na modalidade de assinatura. Estes termos regem o uso da plataforma
          pelo estabelecimento contratante e pelos usuários por ele autorizados.
        </p>
      </LegalSection>

      <LegalSection id="planos" title="2. Planos e preços">
        <p>
          A FlyControl é oferecida em dois planos. Os valores vigentes na contratação ficam
          registrados na assinatura e não são alterados retroativamente por mudanças futuras de
          tabela.
        </p>

        <div className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <h3 className="font-bold text-foreground">{premium.name}</h3>
            <p>
              Mensalidade fixa de <strong>{formatCents(premium.monthlyFeeCents)}</strong>, sem taxa
              de cadastro e sem cobrança por pedido. Inclui todos os recursos da plataforma, entre
              eles {restricted}.
            </p>
          </div>

          <div className="border-t border-border pt-3">
            <h3 className="font-bold text-foreground">{cents.name}</h3>
            <p>
              Taxa única de cadastro de <strong>{formatCents(cents.setupFeeCents)}</strong>, cobrada
              uma só vez na primeira fatura, somada à cobrança por pedido válido. Não inclui{" "}
              {restricted}.
            </p>
          </div>
        </div>
      </LegalSection>

      <LegalSection id="pedido-valido" title="3. O que é um pedido válido">
        <p>
          No plano {cents.name}, a cobrança incide sobre pedidos válidos. É considerado válido o
          pedido que entra no fluxo operacional do estabelecimento — ou seja, a partir do momento em
          que é aceito e passa para preparo.
        </p>
        <p>Não são cobrados:</p>
        <ul className="list-inside list-disc">
          <li>pedidos recebidos que ainda não foram aceitos;</li>
          <li>pedidos cancelados ou excluídos;</li>
          <li>pedidos de teste ou de demonstração;</li>
          <li>registros automáticos de abertura de mesa, sem itens e sem valor.</li>
        </ul>
        <p>
          Cada pedido é contabilizado uma única vez. Um pedido que deixe de ser válido dentro do
          ciclo em andamento gera um estorno automático na contagem.
        </p>
      </LegalSection>

      <LegalSection id="promocao" title="4. Redução por volume no plano CENTS">
        <p>
          Ao atingir <strong>{cents.promotionThresholdOrders} pedidos válidos</strong> em um ciclo,
          o <strong>ciclo seguinte</strong> passa a ser cobrado a{" "}
          <strong>{formatCents(cents.promotionalOrderUnitPriceCents)}</strong> por pedido, no lugar
          de {formatCents(cents.defaultOrderUnitPriceCents)}.
        </p>
        <p>
          O ciclo em que a meta foi atingida continua sendo cobrado pelo valor vigente naquele
          ciclo. A redução nunca é aplicada retroativamente.
        </p>
        <p>
          Para manter o valor reduzido, é necessário atingir a meta em cada ciclo. Se um ciclo
          terminar abaixo de {cents.promotionThresholdOrders} pedidos válidos, esse ciclo é cobrado
          pelo valor que já estava vigente, e o ciclo seguinte retorna a{" "}
          {formatCents(cents.defaultOrderUnitPriceCents)} por pedido.
        </p>
      </LegalSection>

      <LegalSection id="ciclo" title="5. Ciclo de cobrança">
        <p>
          O ciclo é mensal e ancorado na data de ativação da assinatura. Uma assinatura ativada em
          12 de agosto tem o ciclo encerrado em 11 de setembro, com o próximo iniciando em 12 de
          setembro.
        </p>
        <p>
          Quando o dia de ativação não existe no mês seguinte, o ciclo se encerra no último dia
          daquele mês e o próximo inicia no primeiro dia do mês subsequente, sem que nenhum dia
          fique fora de um ciclo.
        </p>
        <p>
          A fatura é emitida no fechamento do ciclo, com base nos pedidos efetivamente registrados.
          Os valores exibidos durante o ciclo em andamento são estimativas e podem variar até o
          fechamento.
        </p>
      </LegalSection>

      <LegalSection id="ativacao" title="6. Ativação e pagamento">
        <p>
          A conta criada permanece com a assinatura pendente até a confirmação do pagamento. A
          cobrança automática por PIX está em implantação; até a sua disponibilização, a ativação é
          realizada pela equipe da FlyControl após a confirmação do pagamento.
        </p>
        <p>
          O acesso às funcionalidades restritas de cada plano é aplicado desde a criação da conta,
          conforme o plano escolhido.
        </p>
      </LegalSection>

      <LegalSection id="mudanca-de-plano" title="7. Mudança de plano">
        <p>
          A mudança de plano passa a valer no ciclo seguinte, sem cálculo proporcional sobre o ciclo
          em andamento.
        </p>
        <p>
          Na migração do {premium.name} para o {cents.name}, os dados de {restricted} são
          preservados e permanecem inacessíveis enquanto durar o plano {cents.name}. O retorno ao{" "}
          {premium.name} restabelece o acesso a esses dados.
        </p>
      </LegalSection>

      <LegalSection id="suspensao" title="8. Suspensão do acesso">
        <p>
          O atraso no pagamento não interrompe automaticamente o acesso à plataforma. A suspensão,
          quando ocorrer, é uma ação explícita e comunicada. Durante a suspensão os dados do
          estabelecimento são preservados.
        </p>
      </LegalSection>

      <LegalSection id="dados" title="9. Dados do estabelecimento">
        <p>
          Os dados cadastrados, os pedidos e o histórico de operação pertencem ao estabelecimento
          contratante. A FlyControl os processa para prestar o serviço contratado.
        </p>
        <p>
          O tratamento de dados pessoais — o que é coletado, com quem é compartilhado, por quanto
          tempo é guardado e quais direitos o titular tem — está descrito na{" "}
          <Link to="/privacy" className="font-medium text-primary underline underline-offset-4">
            Política de Privacidade
          </Link>
          , que integra estes termos.
        </p>
      </LegalSection>

      <LegalSection id="alteracoes" title="10. Alterações destes termos">
        <p>
          Alterações materiais nestes termos geram uma nova versão do documento. A versão vigente no
          momento do aceite fica registrada junto ao cadastro do estabelecimento.
        </p>
      </LegalSection>

      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
        <p className="font-semibold text-foreground">Dúvidas sobre estas condições?</p>
        <p className="text-muted-foreground">
          Fale com a equipe da FlyControl antes de concluir a contratação.
        </p>
      </div>
    </LegalDocument>
  );
}
