import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Utensils, Link2, KeyRound, LayoutGrid, AlertTriangle } from "lucide-react";

/**
 * O conteúdo da documentação, sem a casca de página.
 *
 * Mora num componente porque aparece em DOIS lugares: na aba "Documentos"
 * dentro de Configurações (o caminho novo, pelo menu) e na rota /docs (que
 * continua existindo para não quebrar link antigo salvo por alguém).
 *
 * Duas cópias do mesmo texto sempre acabam discordando: uma é corrigida e a
 * outra fica para trás, e aí o lojista lê a errada.
 */
export function DocsContent() {
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Como o FlyControl funciona</h1>
        <p className="mt-2 text-muted-foreground">
          Um resumo simples de como o painel e o cardápio digital trabalham juntos para atender o
          seu cliente — sem precisar entender de programação.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Utensils className="h-5 w-5 text-primary" /> Dois sistemas, um fluxo só
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>
            <strong>FlyControl</strong> é o painel que você usa no dia a dia: pedidos, cardápio,
            mesas, equipe e financeiro.
          </p>
          <p>
            <strong>Cardápio Digital</strong> é o site que o seu cliente abre no celular para fazer
            o pedido — a "vitrine" da sua loja na internet.
          </p>
          <p>
            É como a cozinha e o salão de um restaurante: são espaços diferentes, mas o pedido
            caminha automaticamente de um para o outro, sem ninguém precisar levar o papel na mão de
            um lado a outro.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" /> A conexão é automática
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>
            Quando você assina o FlyControl e o pagamento é confirmado, o seu cardápio digital é
            criado sozinho, na hora — você não precisa copiar nenhuma chave nem configurar nada
            manualmente.
          </p>
          <p>
            É como pedir uma linha de telefone nova: você contrata, e a operadora já entrega o
            número funcionando. Você não precisa emendar fio nenhum.
          </p>
          <p>
            A partir daí, tudo que você cadastra em <strong>Cardápio</strong> — categorias,
            produtos, preços, fotos — aparece sozinho no site do cliente. E todo pedido feito lá cai
            direto na tela de <strong>Pedidos</strong> do FlyControl, com o alerta sonoro avisando
            que chegou.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" /> O que garante que o pedido cai na loja
            certa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>
            Por trás dessa conexão existe uma chave de acesso única, gerada e guardada
            automaticamente para a sua loja — você pode vê-la em{" "}
            <strong>Configurações → sua loja</strong>, mas não precisa mexer nela no uso normal.
          </p>
          <p>
            É como o crachá de um funcionário: só a sua loja tem o seu crachá, então o cardápio
            digital sabe exatamente para qual painel mandar cada pedido, sem misturar com o de outra
            loja.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" /> O que mais o FlyControl faz
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Pedidos:</strong> tudo que chega do cardápio digital (ou é lançado na hora,
              como pedido de balcão) aparece aqui, em tempo real.
            </li>
            <li>
              <strong>Mesas e QR Codes:</strong> gera um QR Code por mesa para o cliente pedir
              sentado, sem precisar chamar o garçom para anotar.
            </li>
            <li>
              <strong>Garçons e Comissões:</strong> controla quem atendeu cada mesa e calcula a
              comissão automaticamente.
            </li>
            <li>
              <strong>Financeiro:</strong> mostra quanto a sua loja faturou, por período.
            </li>
            <li>
              <strong>Plano e cobrança:</strong> onde você acompanha a sua assinatura do FlyControl
              e os pagamentos dela.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" /> O que merece atenção
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed">
          <p>
            O cardápio digital só é criado depois que o pagamento da assinatura é confirmado — é
            como uma matrícula: o acesso só é liberado depois que a mensalidade entra. Enquanto a
            assinatura estiver pendente, o site do cliente ainda não existe.
          </p>
          <p>
            Lojas cadastradas antes desse processo automático existir ainda podem depender da
            configuração manual de chave. Se for o seu caso e o cardápio digital não estiver
            aparecendo, fale com o suporte para verificar essa conexão específica.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
