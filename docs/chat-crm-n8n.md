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
clientes escreveram.

É o entregador passando na loja para pegar os pedidos prontos, em vez de a
cozinha correr atrás de cada moto.

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

Copie o fluxo-modelo do CRM e dê a ele um nome que identifique a loja, por
exemplo `CRM — Pizzaria do Zé`.

**3. Crie a conexão no painel e guarde a senha**

Ainda em *Clientes e Planos*, clique em **Conexão**, escreva o nome do fluxo
e clique em **Criar conexão**.

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

### 4. Bater o ponto (sinal de vida)

```
POST https://<seu-dominio>/api/crm/ping

{ "tenant_id": "...", "token": "...", "error": "(opcional)" }
```

Chame a cada 5 ou 10 minutos, mesmo sem nada para fazer.

**Por que isso importa:** uma loja pode passar a manhã inteira sem nenhuma
mensagem, e isso é normal num dia parado. Sem o sinal de vida, o sistema não
conseguiria distinguir "hoje ninguém escreveu" de "o WhatsApp caiu às 7 da
manhã" — e o lojista passaria o dia achando que está atendendo.

Se o fluxo detectar um problema por conta própria (o aparelho desconectou,
por exemplo), mande junto em `error`: esse texto aparece na tarja de aviso da
tela do lojista.

---

## O que cada resposta de erro quer dizer

| Código | Significa | O que o fluxo deve fazer |
|---|---|---|
| `401` | Chave mestra ou senha da loja erradas | Parar e conferir a configuração. Tentar de novo não resolve |
| `409 crm_nao_contratado` | A loja não tem mais o Chat (cancelou ou fez downgrade) | Parar. Não é erro de rede |
| `409 fluxo_pausado` | A conexão foi pausada no painel | Parar até ser religada |
| `503` | A integração não está configurada no servidor | Avisar o suporte |
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
