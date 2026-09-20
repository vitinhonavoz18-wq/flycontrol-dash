# A atendente de IA da açaiteria (Açai Deus provera)

Este arquivo conta, em português claro, o que foi montado para a loja
**Açai Deus provera** e o que o dono precisa fazer do lado dele.

O fluxo é irmão do que já roda no BOTECO VT. A diferença está no **jeito de
vender**: hambúrguer o cliente escolhe e pronto; açaí o cliente **monta**. Por
isso a atendente daqui foi ensinada a perguntar os complementos antes de
fechar o pedido — como a moça do balcão que pergunta "vai leite em pó?" antes
de tampar o copo.

---

## O que a atendente faz sozinha

- responde no WhatsApp, com jeito de gente e com emoji 🍇;
- **consulta o cardápio de verdade** antes de falar qualquer preço;
- **pergunta os complementos** (leite em pó, granola, Nutella, paçoca…) e
  escreve o que o cliente escolheu na observação daquele item do pedido;
- calcula a taxa do bairro usando só os bairros que a loja cadastrou;
- **faz o pedido** direto na tela de Pedidos;
- responde "cadê meu açaí?" lendo a situação real do pedido;
- entende áudio e foto do cliente;
- chama um humano quando é reclamação, cancelamento, troco ou comprovante de
  PIX para conferir.

## O que ela NUNCA faz

- inventar preço, sabor, tamanho, complemento, promoção ou taxa;
- dizer que o pedido foi feito sem ter recebido o número do pedido;
- prometer horário de entrega;
- cancelar pedido;
- confirmar pagamento sozinha.

O preço **nunca** sai da cabeça da IA. Ela manda só o nome e a quantidade; o
valor é buscado no cardápio da loja pelo próprio FlyControl. É a diferença
entre o caixa que passa o produto no leitor e o caixa que pergunta ao cliente
quanto ele acha que deve pagar.

---

## Onde cada coisa mora

| Coisa | Onde está |
|---|---|
| O fluxo | n8n, workflow `QOOvTxhLsiaA4tDL` — *FlyControl CRM + IA — AÇAI DEUS PROVERA* |
| Endereço de entrada (webhook) | `https://conectfly-n8n.lnuwza.easypanel.host/webhook/flycontrol-ia-acai-deus-provera` |
| Identificação da loja (`tenant_id`) | `f73c7dab-b849-4221-8047-4ac0fa6a3982` |
| A senha da loja | guardada no FlyControl (`crm_n8n_links.webhook_token`) e colada dentro do fluxo |
| A chave mestra | variável `CRM_N8N_SECRET`, só no servidor |

O arquivo **`fluxo-n8n-acaiteria.ts`**, aqui ao lado, é o mesmo fluxo escrito
em código, **com as senhas trocadas por `COLE-AQUI-...`**. Ele serve para duas
coisas: refazer o fluxo se alguém apagar sem querer, e servir de modelo para a
próxima açaiteria. Senha de verdade não entra em arquivo do repositório — isso
é o mesmo cuidado de não deixar a chave do cofre pendurada na porta.

---

## O que falta o dono fazer

**Ligar o WhatsApp da loja.** No painel: **Chat → Conexão do WhatsApp →
Conectar WhatsApp**, e apontar a câmera para o QR Code, igual ao WhatsApp Web.

Enquanto isso não for feito, a tarja laranja continua aparecendo e **nenhuma
mensagem entra nem sai** — o fluxo está de pé, mas sem o aparelho ligado é
como ter a loja montada com a porta trancada.

Quem estiver usando o painel pelo próprio celular (não dá para apontar a
câmera do aparelho para a tela dele mesmo) usa o **código de 8 letras**, na
opção "Não consigo ler o QR Code".

---

## Duas coisas que merecem atenção

1. **O cardápio da loja hoje é curto.** São 10 itens (açaí na garrafa,
   vitamina, marmitas, lanches e porções) e 16 complementos, todos cadastrados
   com preço zero. A atendente só oferece o que está cadastrado, então tudo que
   faltar no cardápio ela simplesmente não vende. Vale o dono revisar o
   cardápio antes de soltar a IA para valer.

2. **Complemento com preço zero é complemento de graça.** Se um dia a loja
   quiser cobrar por Nutella ou por creme, é só colocar o preço no cadastro de
   adicionais — a atendente passa a falar o valor certo sozinha.
