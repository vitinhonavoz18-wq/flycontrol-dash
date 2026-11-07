# Cozinha Gourmet da Dri — o fluxo de chat completo

Doceria (bolos, trufas, copos da felicidade, kits festa). Atendimento no
WhatsApp feito por uma atendente de IA ligada à aba **Chat** do FlyControl.

> Nenhuma senha está neste arquivo de propósito. A senha da loja e a chave
> mestra ficam só dentro dos fluxos do n8n.

## Os dois fluxos no n8n

| Fluxo | O que faz | Quando roda |
|---|---|---|
| **FlyControl CRM + IA — COZINHA GOURMET DA DRI** | Recebe a mensagem do cliente, registra no painel, a IA responde, consulta cardápio/taxa, faz o pedido e diz o status. Também entrega no WhatsApp o que a equipe digita na aba Chat | A cada mensagem que chega + de minuto em minuto (fila do painel) |
| **FlyControl Pedidos — COZINHA GOURMET DA DRI** | Avisa o cliente sozinho quando o pedido vai para *em preparo*, *saiu para entrega* e *entregue* | De minuto em minuto |

Endereço de entrada (o que a UAZAPI chama a cada mensagem):
`https://conectfly-n8n.lnuwza.easypanel.host/webhook/flycontrol-ia-cozinha-da-dri`

## O caminho de uma mensagem

1. **Chegou mensagem** — a UAZAPI avisa.
2. **É mensagem de cliente?** — porteiro da entrada (novo, 07/11/2026).
   Deixa passar só o que tem telefone **e** conteúdo (texto, áudio, foto,
   arquivo). Barra os avisos de "conectei/desconectei" que o WhatsApp manda
   quando a loja lê o QR Code de novo.
3. **Registrar no FlyControl** — a mensagem aparece na aba Chat.
4. **Foi o atendente?** — se quem escreveu foi a própria loja pelo celular,
   a IA fica **10 minutos calada** naquela conversa, para não atropelar a
   pessoa.
5. Áudio vira texto, foto vira descrição.
6. **Espera 15 segundos** e junta as mensagens picadas do cliente numa só
   ("oi" + "tem bolo?" + "pra hoje" = uma pergunta).
7. A IA lê a **situação da loja** (aberta/fechada, faz entrega) e a **ficha
   do cliente** (nome, pedidos anteriores).
8. A IA responde usando as ferramentas: `consultar_produtos`,
   `calcular_taxa_entrega`, `fazer_pedido`, `consultar_pedido`.
9. A resposta é cortada nos parágrafos e enviada uma parte por vez, com
   "digitando...".

## Regras de negócio da atendente da Dri

- Preço **sempre** do cardápio do FlyControl, nunca da IA.
- **Encomenda para outro dia, bolo personalizado ou festa grande:** a IA
  anota e diz que vai chamar alguém da equipe. Não fecha pelo sistema.
- **PIX:** a IA não tem chave e não passa chave; diz que alguém da equipe
  vai passar.
- **Comprovante:** a IA agradece e **não** confirma pagamento.
- Cartão: pago no ato da entrega. Dinheiro: sempre pergunta o troco.

## Avisos automáticos de pedido

Só saem se a loja ligar **Minha Loja → FlyStatus → "Avisar o cliente
automaticamente"**. Sem isso, o fluxo roda de minuto em minuto e não encontra
nada para mandar — não gasta nada e não incomoda ninguém.

O texto e a arte de cada aviso vêm do cadastro da loja (FlyStatus), não do
fluxo.

## Limite conhecido: "vou chamar alguém da equipe"

Hoje essa frase **não dispara aviso nenhum** para a equipe — vale para todas
as lojas, não só para a Dri. A conversa aparece na aba Chat como qualquer
outra, e a IA continua respondendo se o cliente escrever de novo, até alguém
da equipe responder (aí ela se cala por 10 minutos).

Na prática: alguém precisa estar de olho na aba Chat, principalmente para
PIX e encomendas.
