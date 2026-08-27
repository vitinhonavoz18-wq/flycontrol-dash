# Ligar o Marketing ao WhatsApp (n8n + UAZAPI)

Este documento é o mapa da última ponte que falta. Tudo do lado do FlyControl
já está pronto e testado: o caderno de clientes, as campanhas, a fila, o
consentimento e as telas. O que falta é o carteiro que leva a mensagem até o
WhatsApp — e esse carteiro é o n8n.

Quem for montar o fluxo do n8n só precisa deste arquivo.

---

## Como a coisa funciona, em uma frase

O FlyControl **não envia** mensagem. Ele deixa as mensagens prontas numa fila,
e o n8n passa de tempos em tempos perguntando "tem alguma coisa para eu
levar?".

É o entregador passando na loja para pegar os pedidos prontos, em vez de a
cozinha correr atrás de cada moto. Isso resolve três coisas de uma vez:

- o disparo não depende de o painel ficar aberto;
- quem clicou em "enviar" não fica esperando mil mensagens saírem;
- se o WhatsApp cair, as mensagens continuam na fila em vez de se perderem.

```
Campanha criada no painel
        ↓
Lista de destinatários gravada (o público congela aqui)
        ↓
FILA  ←──── n8n vem buscar (GET /api/marketing/queue)
        ↓
n8n chama a UAZAPI
        ↓
n8n conta o resultado (POST /api/marketing/queue/result)
        ↓
WhatsApp confirma a entrega (POST /api/webhooks/whatsapp-status)
        ↓
Relatório da campanha no painel
```

---

## O que precisa ser configurado antes

Uma variável de ambiente no FlyControl (no Cloudflare, junto das outras):

```
MARKETING_N8N_SECRET = <um segredo longo e aleatório>
```

O mesmo valor vai nas credenciais do n8n.

**Enquanto essa variável não existir, as três portas ficam trancadas para
todo mundo** e respondem `503 integracao_nao_configurada`. Isso é de
propósito: o caminho fácil seria "sem segredo, deixa passar", e é assim que
sistema nasce aberto em produção porque a variável faltou no dia do deploy e
ninguém percebeu.

Para gerar o segredo: qualquer gerador de senha, 40 caracteres ou mais.
Nunca coloque esse valor no navegador, em código, ou em mensagem de WhatsApp.

---

## Porta 1 — Buscar mensagens para enviar

```
GET  https://<seu-dominio>/api/marketing/queue?limit=50&worker=n8n-1
Header: Authorization: Bearer <MARKETING_N8N_SECRET>
```

Parâmetros (todos opcionais):

| Parâmetro   | Padrão | Para que serve                                              |
|-------------|--------|-------------------------------------------------------------|
| `limit`     | 50     | Quantas mensagens levar de uma vez (máximo 200)             |
| `worker`    | `n8n`  | Um nome para quem está pegando, útil quando há vários fluxos |
| `lease`     | 300    | Por quantos segundos as mensagens ficam reservadas           |
| `tenant_id` | —      | Filtrar por um restaurante só                                |

Resposta:

```json
{
  "success": true,
  "count": 2,
  "sem_instancia": 0,
  "messages": [
    {
      "recipient_id": "uuid-da-mensagem",
      "campaign_id": "uuid-da-campanha",
      "tenant_id": "uuid-do-restaurante",
      "phone_e164": "5571999991234",
      "customer_name": "Ana Paula",
      "message": "Oi Ana! Faz 32 dias que você não pede com a gente…",
      "media_url": null,
      "media_type": null,
      "provider": "uazapi",
      "external_instance_id": "instancia-do-restaurante",
      "attempts": 1
    }
  ]
}
```

Detalhes que importam:

- **`phone_e164` já vem pronto** para enviar: 55 + DDD + número, sem
  parênteses nem traço.
- **`message` já vem com o nome do cliente no lugar** das variáveis. O n8n não
  precisa montar nada.
- **As mensagens já vêm reservadas** em nome de quem pediu. Dois fluxos do n8n
  rodando ao mesmo tempo nunca recebem a mesma mensagem — é como arrancar a
  comanda do prego: se ela já não está lá, o outro pega a próxima.
- **`sem_instancia`** diz quantas dessas mensagens são de restaurantes que
  ainda não têm WhatsApp ligado. Elas vêm com `external_instance_id` nulo.
- Se a reserva vencer sem resposta, a mensagem volta sozinha para a fila.
  Nenhuma fica presa para sempre.
- Campanha pausada ou cancelada **não** aparece aqui. É isso que faz o botão
  "pausar" do painel ter efeito de verdade, mesmo no meio de um lote.

---

## Porta 2 — Contar o que aconteceu

```
POST https://<seu-dominio>/api/marketing/queue/result
Header: Authorization: Bearer <MARKETING_N8N_SECRET>
```

Corpo (aceita uma ou várias — mande em lote, é bem melhor):

```json
{
  "results": [
    { "recipient_id": "uuid", "status": "sent", "provider_message_id": "ABC123" },
    { "recipient_id": "uuid2", "status": "failed",
      "error_code": "400", "error_message": "Número não existe no WhatsApp" }
  ]
}
```

Máximo 500 por vez.

Pode mandar o nome de status que a UAZAPI usa (`server_ack`, `delivery_ack`,
`read`…) — a tradução acontece do lado do FlyControl. Um nome desconhecido
vira "ainda processando", nunca "falhou": chutar falha faria a mensagem ser
reenviada e o cliente receber duas vezes.

Resposta:

```json
{ "success": true, "aplicados": 48, "ignorados": 2, "com_erro": 0 }
```

`ignorados` quase sempre significa aviso repetido. **Não é erro** — mandar o
mesmo aviso duas vezes é seguro e não conta entrega em dobro.

### Sobre a nova tentativa

Se `status` vier `failed` e ainda houver tentativa sobrando (o teto é 3), a
mensagem volta para a fila com espera crescente: 1 minuto, depois 5, depois
25. O n8n não precisa controlar isso — só reportar a falha. Não existe laço
infinito: as tentativas são contadas e têm teto.

---

## Porta 3 — O WhatsApp avisando que chegou

```
POST https://<seu-dominio>/api/webhooks/whatsapp-status
Header: Authorization: Bearer <MARKETING_N8N_SECRET>
```

```json
{ "recipient_id": "uuid", "status": "delivered" }
```

ou, quando só se tem o número que o fornecedor deu:

```json
{ "provider_message_id": "ABC123", "status": "read" }
```

O n8n é quem traduz o formato da UAZAPI para este. É de propósito: assim,
trocar de fornecedor de WhatsApp amanhã não exige mexer no FlyControl — mexe-se
só no fluxo do n8n. É a mesma ideia da tomada: o aparelho muda, a tomada
continua a mesma.

Um "enviado" que chegue atrasado nunca desfaz um "entregue" que já chegou.

---

## O fluxo do n8n, em passos

1. **Gatilho por tempo** — a cada 1 ou 2 minutos.
2. **HTTP Request** — `GET /api/marketing/queue?limit=50&worker=n8n-1`.
3. **Se `count` for 0**, encerra.
4. **Para cada mensagem**:
   - se `external_instance_id` for nulo, reporte
     `status: "failed"`, `error_code: "no_instance"` e siga;
   - chame a UAZAPI usando `external_instance_id` como instância;
   - guarde o id que a UAZAPI devolver.
5. **Junte os resultados** e mande tudo de uma vez em
   `POST /api/marketing/queue/result`.
6. **Fluxo separado** — receba o webhook da UAZAPI, traduza e repasse para
   `POST /api/webhooks/whatsapp-status`.

### Ritmo de envio

O WhatsApp bloqueia número que dispara rápido demais. Recomendação:

- 1 mensagem a cada 3 a 5 segundos, com variação aleatória;
- `limit=50` a cada 2 minutos dá mais ou menos esse ritmo;
- não envie de madrugada.

O FlyControl não impõe esse ritmo — quem segura o passo é o n8n. Foi uma
escolha: é o n8n que conhece as regras do fornecedor e é lá que elas mudam.

---

## Onde ficam os segredos

| Segredo                    | Onde mora                          |
|----------------------------|------------------------------------|
| `MARKETING_N8N_SECRET`     | Ambiente do FlyControl e credencial do n8n |
| Token da UAZAPI            | **Só nas credenciais do n8n**      |
| Instância de cada loja     | Banco (`marketing_whatsapp_instances`) — é identificador, não segredo |

**O token da UAZAPI nunca entra no banco do FlyControl e nunca chega ao
navegador.** Token no navegador é chave de casa pendurada do lado de fora da
porta. A tabela de instâncias guarda apenas *qual aparelho é de quem* e se
ele está no ar.

---

## O que ainda não existe (e é bom saber)

1. **Conectar o WhatsApp pelo painel.** A tela mostra o estado da conexão mas
   não conecta — quem lê o QR Code é o n8n. Os botões só entram quando essa
   ligação existir; botão que não faz nada é pior que botão que não existe.

2. **Cupom validado no site de pedidos.** A campanha envia o código escrito na
   mensagem, e o banco já está pronto para ligar campanha ↔ cupom ↔ pedido.
   Mas o checkout do SiteCreatorFly ainda não valida cupom nenhum: o desconto
   precisa ser combinado por fora. Foi uma decisão deliberada — construir o
   cupom exigiria mexer no cálculo do total do pedido.

3. **Atribuição de receita.** Depende do item 2. As colunas existem
   (`coupon_code`, `coupon_ref` na campanha), esperando.

4. **Campanha agendada.** A coluna `scheduled_at` existe e o índice também,
   mas ainda não há quem dispare na hora marcada. O agendador diário que já
   roda no Cloudflare é o lugar natural para isso.

5. **Automações** (aniversário, pós-venda, cliente inativo). A estrutura não
   impede, mas nada foi construído.

---

## Manutenção

Uma chamada que vale rodar de vez em quando, junto do agendador diário:

```sql
SELECT public.marketing_release_expired_claims();
```

Devolve à fila as mensagens que ficaram presas num processo do n8n que morreu
no meio do lote. Sem isso elas voltam sozinhas só quando alguém pede o
próximo lote — com esta chamada, voltam mesmo se ninguém pedir.
