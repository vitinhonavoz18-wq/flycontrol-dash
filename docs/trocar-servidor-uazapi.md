# Trocar o servidor da UAZAPI (o WhatsApp do painel)

Este guia é para quando o servidor de WhatsApp muda de endereço — por exemplo,
a mudança do servidor antigo para o **flycontrol.uazapi.com**.

## O que é esse "servidor", em uma frase

A UAZAPI é a empresa que segura o WhatsApp de cada restaurante em pé. Dentro
dela você tem um **servidor** (um endereço, tipo `https://flycontrol.uazapi.com`)
e, dentro dele, um **aparelho** para cada loja — cada aparelho é um número de
WhatsApp conectado por QR Code.

**Cada aparelho mora dentro de UM servidor.** Os aparelhos do servidor antigo
não existem no servidor novo. É como mudar o restaurante de ponto: as chaves do
imóvel antigo continuam no seu molho, continuam parecendo chaves, e não abrem
nada no endereço novo.

Por isso, trocar o servidor **obriga cada loja a ler o QR Code de novo**. Não
tem jeito de evitar — nem a UAZAPI consegue mover um WhatsApp conectado de um
servidor para o outro.

## O que VOCÊ precisa fazer (3 passos)

### 1. Copiar os dois dados do painel da UAZAPI

No painel da UAZAPI, na tela "Conecte seu número", copie:

- **Server URL** — hoje: `https://flycontrol.uazapi.com`
- **Admin Token** — a chave grande, do lado do olhinho

> A chave de administrador é a **chave do cofre**: quem a tiver cria, apaga e
> mexe no WhatsApp de TODOS os seus clientes. Ela nunca vai para o navegador,
> nunca para o banco de dados, nunca para o n8n e **nunca para o GitHub**. Se
> ela aparecer em print, mensagem ou foto de tela, gere uma nova na UAZAPI —
> é o mesmo cuidado de trocar a fechadura depois de perder a chave na rua.

### 2. Colar os dois no painel da Cloudflare

É lá que o FlyControl guarda os segredos do servidor.

1. Entre em **Cloudflare → Workers & Pages → flycontrol-dash → Settings →
   Variables and Secrets**.
2. Troque o valor destes dois:
   - `UAZAPI_BASE_URL` → `https://flycontrol.uazapi.com`
   - `UAZAPI_ADMIN_TOKEN` → a chave copiada no passo 1
3. Se existir um `UAZAPI_TOKEN` (o aparelho geral, usado como rede de
   segurança), **apague o valor dele por enquanto**: ele era do servidor
   antigo e não vale mais nada aqui. Depois, se quiser, crie um aparelho geral
   no servidor novo e cole o token dele.
4. Salve e deixe a publicação terminar (leva uns segundos).

### 3. Avisar cada restaurante para reconectar

Cada dono entra em **Chat → Conexão**, clica em conectar e aponta a câmera do
celular para o QR Code. Em trinta segundos o WhatsApp dele volta.

Enquanto isso não acontece, **aquela loja fica muda**: as mensagens dos
clientes não chegam ao painel e o que for respondido no painel não sai. Vale
avisar antes, e não no meio do sábado à noite.

## O que o painel faz sozinho

- **Percebe a chave morta.** Ao abrir a tela de Conexão, o painel pergunta ao
  servidor novo se aquela chave ainda vale. Se o servidor responder "não
  conheço isso", o painel joga a chave fora e volta a oferecer o QR Code, em
  vez de mostrar um erro sem saída.
- **Cria o aparelho novo.** No primeiro clique em conectar, um aparelho novo é
  criado no servidor de hoje, sem ninguém precisar abrir a UAZAPI.
- **Reaponta o aviso de mensagem nova.** O caminho até o fluxo do n8n daquela
  loja é reconfigurado na hora da conexão. Nada para ajustar à mão.
- **Não perde histórico.** Conversas, clientes e pedidos continuam inteiros. O
  que é trocado é a fechadura, não a casa.
- **Não derruba por engano.** Se a UAZAPI só estiver fora do ar ou lenta
  (erro 500, 429, sem resposta), a chave **não** é jogada fora — seria trocar
  a fechadura da loja porque o telefone do chaveiro deu ocupado. Só um "não
  conheço este aparelho" (401, 403, 404) faz o painel descartar a chave.

## O que NÃO precisa ser mexido

- **Os fluxos do n8n.** Eles não têm o endereço da UAZAPI escrito dentro. A
  cada mensagem eles perguntam ao FlyControl qual é o endereço e qual é a
  chave daquela loja — então, trocando no FlyControl, o n8n segue junto. É a
  diferença entre o garçom decorar o telefone do fornecedor e consultar a
  agenda do caixa toda vez.
- **O código do painel.** O endereço nunca esteve escrito no programa; ele
  sempre veio da configuração do servidor.

## Como conferir se deu certo

1. Na tela **Chat → Conexão** de uma loja, o status sai de "desconectado" e
   vira "conectado" depois do QR Code.
2. Mande uma mensagem de um celular qualquer para o número da loja: ela tem de
   aparecer na aba Chat do painel.
3. Responda pelo painel: a resposta tem de chegar no celular.

Se o status ficar em "conectado" mas nada chegar, olhe o aviso da própria tela:
quando falta o endereço do fluxo daquela loja (o webhook do n8n), o painel diz
isso em voz alta, porque aí é coisa do suporte e não do lojista.
