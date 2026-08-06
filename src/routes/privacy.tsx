import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LegalDocument, LegalSection } from "@/components/legal/LegalDocument";
import {
  PENDING_PRIVACY_SECTIONS,
  PRIVACY_LAST_UPDATED,
  PRIVACY_VERSION,
} from "@/lib/legal/privacy";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });

function PrivacyPage() {
  return (
    <LegalDocument
      title="Política de privacidade"
      version={PRIVACY_VERSION}
      lastUpdated={PRIVACY_LAST_UPDATED}
      pendingIntro={
        "O que está descrito abaixo sobre coleta, uso, compartilhamento e segurança " +
        "corresponde ao que o sistema faz hoje. Os pontos a seguir ainda dependem de " +
        "definição e de revisão jurídica, e serão publicados em uma próxima versão:"
      }
      pendingSections={PENDING_PRIVACY_SECTIONS}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" className="h-11 flex-1">
            <Link to="/terms">Termos de uso</Link>
          </Button>
          <Button asChild className="h-11 flex-1">
            <Link to="/signup" search={{ plan: undefined }}>
              Criar minha conta
            </Link>
          </Button>
        </div>
      }
    >
      <LegalSection id="papeis" title="1. Quem trata os dados">
        <p>
          A FlyControl é usada por estabelecimentos — restaurantes, pizzarias, hamburguerias — para
          operar pedidos. Isso cria duas situações diferentes, que esta política trata
          separadamente:
        </p>
        <ul className="list-inside list-disc">
          <li>
            <strong className="text-foreground">Dados do estabelecimento e da equipe.</strong> São
            os dados de quem contrata e usa a plataforma. A FlyControl decide como tratá-los para
            prestar o serviço, cobrar e dar suporte.
          </li>
          <li>
            <strong className="text-foreground">Dados dos clientes do estabelecimento.</strong> São
            os dados de quem faz um pedido. Quem os coleta e decide o que fazer com eles é o
            estabelecimento. A FlyControl apenas os armazena e processa para que o pedido chegue à
            cozinha e seja entregue.
          </li>
        </ul>
        <p>
          Na prática: se você é cliente de um restaurante que usa a FlyControl e quer excluir ou
          corrigir seus dados, o pedido deve ser feito ao restaurante. É ele quem tem essa decisão,
          e a FlyControl atende ao que ele determinar.
        </p>
      </LegalSection>

      <LegalSection id="dados-coletados" title="2. Dados que a plataforma armazena">
        <p>A relação abaixo é a lista real do que o sistema guarda.</p>

        <div className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <h3 className="font-bold text-foreground">Conta do responsável</h3>
            <p>
              Nome completo, e-mail, WhatsApp e senha. A senha nunca é armazenada em texto legível —
              apenas a sua verificação criptográfica, gerada pelo serviço de autenticação.
            </p>
          </div>

          <div className="border-t border-border pt-3">
            <h3 className="font-bold text-foreground">Estabelecimento</h3>
            <p>
              Nome, segmento, CPF ou CNPJ, telefone, endereço, cidade e estado, além do plano
              contratado e do estado da assinatura.
            </p>
          </div>

          <div className="border-t border-border pt-3">
            <h3 className="font-bold text-foreground">Equipe do estabelecimento</h3>
            <p>
              Nome, nome de usuário, telefone, verificação da senha de acesso e data do último
              acesso de cada garçom cadastrado.
            </p>
          </div>

          <div className="border-t border-border pt-3">
            <h3 className="font-bold text-foreground">Pedidos</h3>
            <p>
              Nome, telefone, endereço de entrega e ponto de referência do cliente final, itens
              pedidos, observações, forma de pagamento, valores, mesa e horários de cada mudança de
              status.
            </p>
          </div>

          <div className="border-t border-border pt-3">
            <h3 className="font-bold text-foreground">Uso e cobrança</h3>
            <p>
              Registro de cada pedido considerado válido para faturamento, ciclos, faturas e
              transações de pagamento.
            </p>
          </div>

          <div className="border-t border-border pt-3">
            <h3 className="font-bold text-foreground">Registros técnicos</h3>
            <p>
              Registros das integrações com sistemas externos, usados para diagnosticar falhas na
              entrada de pedidos. Esses registros incluem o conteúdo do pedido recebido e, portanto,
              podem conter os dados do cliente final.
            </p>
          </div>
        </div>
      </LegalSection>

      <LegalSection id="finalidades" title="3. Para que os dados são usados">
        <ul className="list-inside list-disc">
          <li>operar a plataforma: receber, exibir, acompanhar e imprimir pedidos;</li>
          <li>autenticar o responsável e a equipe, e separar o acesso por estabelecimento;</li>
          <li>calcular a cobrança, emitir faturas e registrar pagamentos;</li>
          <li>prestar suporte e investigar falhas relatadas;</li>
          <li>manter a segurança da plataforma e apurar uso indevido.</li>
        </ul>
        <p className="font-medium text-foreground">
          A FlyControl não vende dados, não os cede para uso comercial de terceiros e não os utiliza
          para publicidade.
        </p>
      </LegalSection>

      <LegalSection id="rastreamento" title="4. Cookies e rastreamento">
        <p>
          A plataforma não usa ferramentas de análise comportamental nem pixels de publicidade. Não
          há Google Analytics, Meta Pixel ou equivalente no código do painel.
        </p>
        <p>
          A sessão de quem entra fica guardada no armazenamento local do próprio navegador, para
          manter o usuário conectado entre visitas. Limpar os dados do navegador encerra a sessão.
        </p>
      </LegalSection>

      <LegalSection id="compartilhamento" title="5. Com quem os dados são compartilhados">
        <p>
          A FlyControl se apoia em fornecedores de infraestrutura para funcionar. Eles tratam os
          dados apenas para prestar esse serviço:
        </p>
        <ul className="list-inside list-disc">
          <li>
            <strong className="text-foreground">Supabase</strong> — banco de dados, autenticação e
            armazenamento de arquivos.
          </li>
          <li>
            <strong className="text-foreground">Cloudflare</strong> — hospedagem e entrega da
            aplicação.
          </li>
          <li>
            <strong className="text-foreground">SiteCreatorFly</strong> — canal de pedidos do
            estabelecimento, quando contratado. Os pedidos feitos por ele chegam ao painel com os
            dados do cliente final.
          </li>
          <li>
            <strong className="text-foreground">InfinityPay</strong> — processamento do pagamento da
            assinatura. Ao contratar um plano, o responsável é levado ao ambiente de pagamento da
            InfinityPay e fornece ali os seus dados de pagamento, que são tratados por ela. A
            FlyControl não recebe nem armazena números de cartão.
          </li>
        </ul>
        <p>
          Fora esses casos, os dados só são compartilhados por determinação legal ou ordem de
          autoridade competente.
        </p>
      </LegalSection>

      <LegalSection id="localizacao" title="6. Onde os dados ficam">
        <p>
          Os dados ficam em infraestrutura de nuvem dos fornecedores acima, que operam em centros de
          dados fora do Brasil. Isso caracteriza transferência internacional de dados.
        </p>
        <p className="rounded-md border border-dashed border-border p-3">
          A formalização dessa transferência, nos termos exigidos pela LGPD, é um dos pontos ainda
          pendentes listados no início desta política.
        </p>
      </LegalSection>

      <LegalSection id="retencao" title="7. Por quanto tempo os dados ficam guardados">
        <p>
          Enquanto a conta do estabelecimento existir, os dados operacionais são mantidos — o
          histórico de pedidos é parte do que a plataforma entrega, e apagá-lo removeria a operação
          do próprio estabelecimento.
        </p>
        <p>
          Encerrada a contratação, os dados são mantidos pelo tempo necessário ao cumprimento de
          obrigações legais e fiscais e à defesa em eventual disputa.
        </p>
        <p className="rounded-md border border-dashed border-border p-3">
          Os prazos exatos de retenção e a rotina de descarte de cada categoria — inclusive dos
          registros técnicos que contêm dados de pedido — ainda não estão definidos. Enquanto não
          estiverem, esses dados permanecem armazenados por prazo indeterminado. Preferimos declarar
          isso a publicar um prazo que não é cumprido na prática.
        </p>
      </LegalSection>

      <LegalSection id="seguranca" title="8. Segurança">
        <p>As proteções abaixo estão implementadas hoje:</p>
        <ul className="list-inside list-disc">
          <li>todo o tráfego com a plataforma é criptografado em trânsito;</li>
          <li>
            senhas são guardadas apenas como verificação criptográfica, nunca em texto legível;
          </li>
          <li>
            o acesso aos dados é isolado por estabelecimento diretamente no banco de dados, de modo
            que um estabelecimento não alcança os dados de outro;
          </li>
          <li>
            a chave administrativa que ignora esse isolamento existe apenas no servidor e nunca é
            enviada ao navegador;
          </li>
          <li>
            as comunicações automáticas entre a FlyControl e o canal de pedidos são assinadas
            criptograficamente, para que uma mensagem forjada seja recusada.
          </li>
        </ul>
        <p>
          Nenhuma medida elimina totalmente o risco. Em caso de incidente de segurança relevante, o
          estabelecimento será comunicado.
        </p>
      </LegalSection>

      <LegalSection id="direitos" title="9. Direitos sobre os dados">
        <p>
          A legislação brasileira de proteção de dados garante ao titular, entre outros, o direito
          de confirmar a existência de tratamento, acessar seus dados, corrigir dados incompletos ou
          desatualizados, solicitar anonimização, bloqueio ou eliminação de dados desnecessários,
          solicitar a portabilidade e revogar consentimento.
        </p>
        <p>
          Esses pedidos são atendidos pelo contato da FlyControl. Ainda não existe uma ferramenta de
          autoatendimento no painel para exclusão ou exportação: cada solicitação é tratada
          manualmente pela equipe.
        </p>
        <p>
          Se o pedido envolver dados de clientes de um estabelecimento, ele será encaminhado ao
          estabelecimento, que é quem decide sobre esses dados.
        </p>
      </LegalSection>

      <LegalSection id="criancas" title="10. Crianças e adolescentes">
        <p>
          A plataforma é destinada ao uso profissional por estabelecimentos e sua equipe. Não é
          direcionada a menores de 18 anos e não coleta dados de crianças e adolescentes de forma
          intencional.
        </p>
      </LegalSection>

      <LegalSection id="alteracoes" title="11. Alterações desta política">
        <p>
          Alterações materiais geram uma nova versão deste documento. A versão vigente no momento do
          aceite fica registrada junto ao cadastro do estabelecimento, para que seja possível saber
          depois a que texto cada contratante consentiu.
        </p>
      </LegalSection>

      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
        <p className="font-semibold text-foreground">Dúvidas sobre o tratamento dos seus dados?</p>
        <p className="text-muted-foreground">
          Fale com a equipe da FlyControl. Enquanto o encarregado não é formalmente nomeado, as
          solicitações são recebidas e tratadas pelo canal de atendimento.
        </p>
      </div>
    </LegalDocument>
  );
}
