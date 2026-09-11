# Ligar o Chat (CRM) ao WhatsApp pelo n8n

Este documento é o mapa da ponte entre o FlyControl e o WhatsApp de **uma
loja específica**. Tudo do lado do FlyControl já está pronto: as conversas, as
telas, a fila e as trancas. O que falta é o carteiro que leva e traz as
mensagens — e esse carteiro é o n8n.

Quem for montar o fluxo só precisa deste arquivo.

---

## Como a coisa funciona, em uma frase

O FlyControl **não envia nem recebe** mensagem sozinho: ele deixa as respostas
do restaurante numa fila e espera o n8n vir buscar, e recebe do n8n o que os
clientes escreveram. Quem fala com o WhatsApp de verdade é a **UAZAPI**.

É o entregador passando na loja para pegar os pedidos prontos, em vez de a
cozinha correr atrás de cada moto.

## A divisão de tarefas (vale a pena decorar)

| Tarefa | Quem faz |
|---|---|
| **Ligar o aparelho** (QR Code, status, desligar) | FlyControl ↔ UAZAPI, direto |
| **Mensagem que chega** | UAZAPI → n8n → FlyControl |
| **Mensagem que sai** | FlyControl → n8n → UAZAPI |

**Por que ligar o aparelho é direto:** um QR Code do WhatsApp vive poucos
segundos e é trocado na cara do lojista enquanto ele aponta o celular. Passar
essa figurinha por um intermediário a cada renovação seria como pedir a senha
do cofre por carta: quando a carta chega, a senha já mudou.

## Quem lê o QR Code agora é o próprio lojista

Ele abre **Chat → Conexão do WhatsApp** (ou Marketing → Configurações), clica
em **Conectar WhatsApp** e aponta a câmera — igual ao WhatsApp Web.

Isso importa porque o WhatsApp derruba a conexão sozinho de tempos em tempos.
Antes, quando caía, o restaurante ficava mudo até alguém do suporte ler o
código por ele — num sábado à noite, com cliente esperando. Agora ele religa
sozinho em trinta segundos.

Quem usa o painel pelo próprio celular (não dá para apontar a câmera do
aparelho para a tela dele mesmo) tem o caminho alternativo: o **código de 8
letras**, em "Não consigo ler o QR Code".

**Toda vez que ele reconecta, o FlyControl reaponta sozinho o aviso de
mensagem nova para o fluxo daquela loja.** É por isso que o endereço de
entrada precisa estar cadastrado no painel antes — veja o passo 3.

---

## Um fluxo por restaurante — e por que isso importa

Cada loja tem **o seu próprio fluxo** no n8n. Eles não se misturam, e um
nunca alcança as conversas do outro.

Quem garante isso são duas fechaduras na mesma porta:

| Fechadura | O que é | Onde fica |
|---|---|---|
| **Chave mestra** | Uma só, para todos os fluxos. Diz apenas "quem está batendo é o n8n". | Variável `CRM_N8N_SECRET`, no servidor |
| **Senha da loja** | Diferente para cada restaurante. Diz "e é a loja tal". | Criada no painel, colada dentro do fluxo daquela loja |

A chave mestra sozinha **não abre nada**. É como a chave do prédio: ela deixa
você entrar no hall, mas não abre nenhum apartamento.

---

## Passo a passo para ligar um cliente novo

**1. Ative o Chat para a loja**

No painel: **Painel Admin → Clientes e Planos**, ache o restaurante e clique
em **Ativar** na coluna *Chat (CRM)*.

Nesse instante a aba já passa a funcionar na tela do lojista — ele não
precisa sair e entrar de novo.

**2. Duplique o fluxo-modelo no n8n**

Existe um modelo pronto neste repositório: **`docs/fluxo-n8n-crm-modelo.json`**.
No n8n, use *Import from File*, e dê ao fluxo um nome que identifique a loja —
por exemplo `CRM — Pizzaria do Zé`.

> ⚠️ **Teste o modelo com UMA loja antes de sair duplicando.** Ele foi escrito
> a partir da documentação da UAZAPI e do n8n, mas não foi executado contra o
> seu n8n de verdade — isso só dá para fazer aí, com a chave e o servidor
> reais na mão.

Depois de importar, são **quatro** coisas para editar, e só quatro:

| Onde | O que colar |
|---|---|
| Nó **CONFIG DA LOJA (entrada)** | `fly_base`, `tenant_id` e `token` daquela loja |
| Nó **CONFIG DA LOJA (saída)** | os mesmos três valores |
| Nó **Entregar ao FlyControl** | a chave mestra (`CRM_N8N_SECRET`) no cabeçalho |
| Nós **Buscar fila** e **Contar o resultado** | a mesma chave mestra |

Os dois nós de configuração são propositalmente idênticos: cada disparo do
n8n (a mensagem que chega e a busca da fila) é uma execução separada e não
enxerga o outro. Se um dia os valores divergirem, o sintoma é o clássico
"recebe mas não responde" — ou o contrário.

**3. Crie a conexão no painel e guarde a senha**

Ainda em *Clientes e Planos*, clique em **Conexão**, escreva o nome do fluxo,
**cole o endereço de entrada do fluxo** (a URL do nó Webhook do n8n daquela
loja) e clique em **Criar conexão**.

> O endereço de entrada não é opcional na prática: sem ele, o lojista consegue
> conectar o WhatsApp e mesmo assim não recebe nada. O painel marca essas
> lojas com a etiqueta vermelha **"sem endereço de entrada"** justamente
> porque parece funcionar e não funciona — o pior tipo de defeito.

O painel devolve duas coisas:

- a **identificação da loja** (`tenant_id`);
- a **senha daquela loja**.

> ⚠️ **A senha aparece uma vez só.** Ela é guardada de um jeito que nem nós
> conseguimos mostrar de novo — a mesma ideia da senha do banco, que você
> anota na hora em que é criada. Se perder, gere outra; a antiga para de
> valer na hora e o fluxo precisa ser atualizado com a nova.

**4. Cole as duas coisas no fluxo do n8n**

Dentro do fluxo daquela loja, guarde `tenant_id` e `token`. Eles vão em todas
as chamadas.

---

## Os quatro endereços do FlyControl

Em todos: cabeçalho `Authorization: Bearer <CRM_N8N_SECRET>`.

### 1. Mensagem chegando (o cliente escreveu)

```
POST https://<seu-dominio>/api/crm/inbox

{
  "tenant_id":   "<id da loja>",
  "token":       "<senha da loja>",
  "phone":       "5571999999999",
  "message":     "Oi, o pedido já saiu?",
  "name":        "João",                  // opcional
  "external_id": "<id da mensagem no WhatsApp>",  // recomendado
  "media_url":   "",                      // opcional
  "media_type":  ""                       // opcional
}
```

**O jeito mais simples: repasse o evento da UAZAPI cru.** O FlyControl entende
o formato dela (`{ event, instance, data }`) — basta acrescentar `tenant_id` e
`token` ao corpo. Quanto menos o fluxo remontar, menos lugar existe para ele
errar, e um erro desses teria de ser corrigido loja por loja.

Mensagem que o próprio restaurante enviou e mensagem de grupo são descartadas
automaticamente (respondendo `200` com `"ignorada": true`). Sem esse filtro, a
resposta do atendente voltaria como se o cliente tivesse falado e a conversa
viraria um eco.

**Mande sempre o `external_id`.** É o número que o WhatsApp deu para aquela
mensagem. Com ele, se o fluxo entregar o mesmo recado duas vezes (tentou de
novo depois de uma queda de internet), a mensagem aparece **uma** vez na
tela. Sem ele, o cliente parece ter falado duas vezes — e o atendente
responde duas vezes.

### 2. Buscar o que o restaurante respondeu

```
POST https://<seu-dominio>/api/crm/outbox

{ "tenant_id": "...", "token": "...", "limit": 50, "worker": "n8n-loja-x", "lease": 300 }
```

Devolve, para cada mensagem: `message_id`, `phone_e164` (já no formato pronto:
55 + DDD + número), `contact_name`, `body` e, quando houver, `media_url`.

**E devolve também a credencial do aparelho daquela loja**, em `uazapi`:

```json
{ "uazapi": { "baseUrl": "https://sua.uazapi.com", "instanceToken": "..." } }
```

Use esse `instanceToken` no cabeçalho `token` do `POST /send/text` da UAZAPI.
**Não guarde essa credencial dentro do fluxo.** Ela vem a cada visita de
propósito: quando o lojista reconecta o WhatsApp, ela pode mudar — e se
estivesse escrita no fluxo, cada religamento exigiria um humano editando o
fluxo daquela loja. O lojista religaria sozinho e continuaria mudo.

Se vier `"uazapi": null`, a loja ainda não conectou o WhatsApp. O fluxo deve
parar: não há para onde enviar.

As mensagens vêm **reservadas** por `lease` segundos. Se o fluxo travar no
meio, a reserva vence sozinha e elas voltam para a fila. Nada fica preso,
nada sai em dobro.

Sugestão de frequência: a cada 1 minuto.

### 3. Contar o que aconteceu com cada uma

```
POST https://<seu-dominio>/api/crm/outbox/result

{
  "tenant_id": "...", "token": "...",
  "results": [
    { "message_id": "...", "status": "sent",   "external_id": "..." },
    { "message_id": "...", "status": "failed", "error": "numero invalido" }
  ]
}
```

**Este passo não é opcional.** Sem ele a mensagem fica marcada como "saindo"
até a reserva vencer, e é enviada de novo.

Avisar duas vezes não faz mal: mensagem já marcada como enviada continua
enviada. É o carimbo de "pago" na comanda — carimbar de novo não cobra de
novo.

### 4. Bater o ponto (OPCIONAL)

```
POST https://<seu-dominio>/api/crm/ping

{ "tenant_id": "...", "token": "...", "error": "(opcional)" }
```

**Você não precisa montar isto.** A própria busca da fila (item 2) já conta
como sinal de vida: quem passa de minuto em minuto perguntando "tem algo para
levar?" já provou que está de pé. Um pedaço a menos para montar em cada loja
é um pedaço a menos para alguém esquecer de montar.

Este endereço serve para quando o fluxo detecta um problema **por conta
própria** ("o aparelho desconectou") e quer contar. O texto do `error`
aparece na tarja de aviso da tela do lojista, que é bem mais útil que um
silêncio.

---

## O que cada resposta de erro quer dizer

| Código | Significa | O que o fluxo deve fazer |
|---|---|---|
| `401` | Chave mestra ou senha da loja erradas | Parar e conferir a configuração. Tentar de novo não resolve |
| `409 crm_nao_contratado` | A loja não tem mais o Chat (cancelou ou fez downgrade) | Parar. Não é erro de rede |
| `409 fluxo_pausado` | A conexão foi pausada no painel | Parar até ser religada |
| `503` | A integração não está configurada no servidor | Avisar o suporte |
| `200` com `"ignorada": true` | Era eco do próprio restaurante ou grupo | Nada. Está correto |
| `500` | Problema nosso | Tentar de novo daqui a pouco |

---

## Quando o cliente cancela o CRM

Você desliga no painel. A partir daí:

- a aba some para o lojista;
- o fluxo é **pausado**, não apagado;
- os endereços passam a recusar com `409`;
- **nenhuma conversa é apagada.**

Se ele voltar em três meses, é só ativar de novo: o histórico está inteiro.
Apagar conversa de cliente é decisão séria demais para acontecer de carona
num cancelamento de plano.


---

## O que a UAZAPI precisa do outro lado

O FlyControl configura o aviso de mensagem nova sozinho, toda vez que o
lojista conecta. O que ele manda para a UAZAPI é isto:

```json
{
  "enabled": true,
  "url": "<o endereço de entrada do fluxo daquela loja>",
  "events": ["messages", "connection"],
  "excludeMessages": ["fromMeYes", "isGroupYes"]
}
```

Ou seja: **você não precisa configurar webhook na UAZAPI na mão.** Se alguém
mexer nisso por fora e tirar os filtros, o FlyControl ainda descarta o eco e
os grupos por conta própria — são duas redes debaixo do trapezista.

### As duas chaves da UAZAPI, e a diferença entre elas

| Chave | Para que serve | Onde mora |
|---|---|---|
| `UAZAPI_ADMIN_TOKEN` | **Criar** o aparelho de um restaurante novo | Só no servidor do FlyControl |
| Token do aparelho | Mexer naquele aparelho: QR Code, status, enviar | Criado sozinho na primeira conexão, guardado num cofre no banco que só o servidor abre |

A chave de administrador é a do cofre: quem a tiver mexe nos aparelhos de
**todos** os seus clientes. Ela nunca vai para o navegador, nem para o banco,
nem para o n8n. O que o n8n recebe é só o token do aparelho **daquela** loja,
e só depois de apresentar as duas senhas.
