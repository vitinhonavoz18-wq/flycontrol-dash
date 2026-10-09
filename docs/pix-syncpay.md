# Pix pago no FlyDelivery com divisão automática (SyncPay)

## Em uma frase

O cliente paga o pedido por Pix **dentro do aplicativo**. A SyncPay recebe um
pagamento só e já divide: a parte do estabelecimento (ex.: 97%) vai para a conta
SyncPay **dele** e a comissão do FlyDelivery (ex.: 3%) fica na conta da plataforma.
O pedido só aparece na cozinha **depois** que o pagamento é confirmado.

## Como funciona, passo a passo

1. **Checkout no app** — a opção "Pix pelo app" só aparece se a loja tiver conta
   recebedora **ativa** e tiver ligado a opção. O padrão continua sendo pagar na entrega.
2. **Pedido calculado no servidor** — a função `flydelivery-order` faz a conta de sempre
   (preço do banco, taxa da região, cupom), mas guarda o pedido numa "sala de espera"
   (`flydelivery_checkouts`), não em `orders`.
3. **Pix gerado** — o app chama `POST /api/flydelivery/pagamentos/pix` (servidor do
   FlyControl). O banco reserva a cobrança (trava contra duplo toque) e a SyncPay cria o
   Pix com `split: [{ user_id: <conta da loja>, percentage: 97 }]`.
4. **QR Code e "copiar código"** — o app mostra e pergunta "já pagou?" a cada 4 segundos.
5. **Aviso da SyncPay** — chega em `POST /api/webhooks/syncpay`. O aviso só serve de
   gatilho: o servidor **reconsulta a SyncPay** (situação, valor e, se informada, a divisão).
6. **Confirmação** — numa transação só, o banco cria o pedido em `orders` como **novo e
   pago** (`payment_method = "Pix (pago no app)"`). Daí em diante é um pedido como qualquer
   outro: a loja aceita, prepara, entrega.

## O que já está garantido (e testado)

| Garantia | Onde |
|---|---|
| Valor sai do servidor, nunca do celular | função de pedido + `flydelivery_checkout_create` |
| Uma cobrança viva por pedido (duplo toque / tela reaberta devolvem o MESMO Pix) | índice único + `flydelivery_pix_reserve` |
| Criação de cobrança nunca repetida sozinha quando a resposta se perde ("incerto") | `syncpay.ts` |
| Pix gerado não toca a campainha da cozinha, não baixa estoque, não conta na mensalidade | pedido só entra em `orders` depois de pago |
| Aviso repetido ou fora de ordem não cria segundo pedido nem desfaz o pago | `flydelivery_pix_apply_provider_status` |
| "Pago" com valor ou divisão diferente → **divergente**, sem liberar o pedido | idem |
| Pago depois do prazo ou em duplicidade → conciliação (devolver), sem pedido duplicado | idem |
| Comissão inteira (1% a 50%), congelada em cada pagamento | migração + `split.ts` |
| Loja só vê o que é dela; comissão e ativação só o administrador; tudo auditado | RLS + funções `flydelivery_store_*` / `flydelivery_admin_*` |
| Ninguém de fora carimba um pedido como "pago no app" | gatilho `orders_guard_flydelivery_payment` |
| CPF do cliente não é gravado (nem no banco, nem no celular, nem no histórico de avisos) | `cpf.ts`, `semDadosPessoais` |

Testes: `bunx vitest run src/lib/flydelivery/pagamentos` (66) e, num Postgres local,
`psql -f scripts/pix-split-harness.sql -f supabase/migrations/20261009120000_flydelivery_pix_split_syncpay.sql -f scripts/pix-split-testes.sql` (74).

## Telas

- **Loja:** Configurações › Financeiro › **Recebimentos** (`/financeiro/recebimentos`) — Client ID
  da conta SyncPay, situação, comissão contratada, ligar o Pix no app, vendas e indicadores.
- **Administrador:** Painel Admin › **Pagamentos FlyDelivery** (`/admin/flydelivery-pagamentos`) —
  comissão padrão e por loja, ativação de contas, conciliação por loja, transações com erro,
  exportação CSV, auditoria e avisos com problema.

## Configuração (uma vez só)

### Segredos do servidor (Cloudflare Workers)

```bash
npx wrangler secret put SYNCPAY_CLIENT_ID            # conta da PLATAFORMA na SyncPay
npx wrangler secret put SYNCPAY_CLIENT_SECRET        # idem — nunca no código, nunca no app
npx wrangler secret put SYNCPAY_WEBHOOK_SECRET       # devolvido pela SyncPay ao cadastrar o aviso
npx wrangler secret put FLYDELIVERY_RECONCILE_SECRET # texto aleatório longo (ex.: openssl rand -hex 32)
```

Variáveis comuns: `SYNCPAY_ENABLED=true` (a chave geral — sem ela nenhuma cobrança é criada),
`SYNCPAY_API_BASE_URL` (opcional, padrão `https://api.syncpayments.com.br`) e
`FLYCONTROL_PUBLIC_URL` (já existe; precisa começar com `https://`).

`SYNCPAY_PLATFORM_FEE_PERCENT` **não é usada**: a comissão mora no banco e é alterada no
painel administrativo, com auditoria. Assim existe um só lugar que manda no dinheiro.

### Aplicativo FlyDelivery

`EXPO_PUBLIC_FLYCONTROL_API_URL=https://<endereço do painel FlyControl>` no `.env`/EAS, e um
**APK novo** (há uma dependência nativa nova: `expo-clipboard`).

### Aviso (webhook) na SyncPay

Cadastrar `https://<endereço do painel>/api/webhooks/syncpay` com o evento **`transaction`**
(`POST /api/partner/v1/webhooks`). Guardar o segredo devolvido em `SYNCPAY_WEBHOOK_SECRET`.

### Reconferência periódica (rede de segurança)

Criar um agendamento externo (ex.: fluxo do n8n: *Schedule Trigger* a cada 10 minutos +
*HTTP Request*):

```
POST https://<endereço do painel>/api/flydelivery/pagamentos/conciliar
x-reconcile-secret: <FLYDELIVERY_RECONCILE_SECRET>
```

> **Atenção (problema que já existia):** no build atual (TanStack Start + nitro), o
> `scheduled()` de `src/server.ts` **não é ligado** ao Worker publicado — o Worker gerado
> chama um gancho do nitro que ninguém registra. Isso vale também para o fechamento diário
> da mensalidade (`/api/billing/close-cycles`): ele só roda se algum agendador externo o
> chamar. Vale conferir antes de qualquer coisa.

## Checklist para ligar em produção

1. [ ] Confirmar com a SyncPay, por escrito: split habilitado na conta da plataforma, limite
       de recebedores no Pix, percentual inteiro, **quem paga a tarifa** e o valor da tarifa.
2. [ ] Confirmar o formato exato do aviso: cabeçalho e algoritmo da assinatura
       (`X-SyncPay-Signature` HMAC-SHA256 ou `Authorization: Bearer`), se há horário assinado
       e a janela aceita, e os nomes dos campos (`event_id`, identificador da transação).
3. [ ] Confirmar os campos da consulta `GET /api/partner/v2/transactions/{reference_id}`:
       `status`, `amount` e se ela informa a divisão e a tarifa.
4. [ ] Aplicar a migração `20261009120000_flydelivery_pix_split_syncpay.sql` (ela vai junto
       quando o ramo entra na `main` — o workflow "Migrações do banco" aplica sozinho).
5. [ ] Publicar a função `flydelivery-order` atualizada (repositório do app).
6. [ ] Configurar os segredos e variáveis acima; cadastrar o aviso; criar o agendamento.
7. [ ] Em **Pagamentos FlyDelivery**, conferir "Integração SyncPay configurada e ligada".
8. [ ] Definir no painel "quem paga a tarifa" conforme o contrato real.
9. [ ] Ativar UMA loja piloto depois de confirmar com a SyncPay que o Client ID é dela e
       recebe split. A loja liga "Oferecer Pix pelo aplicativo".
10. [ ] Fazer **um pedido real de valor baixo** (com autorização), conferir: pedido chegou pago
        na loja, extrato da SyncPay com 97/3, aviso registrado sem erro.
11. [ ] Só então liberar para as demais lojas.

## O que NÃO foi feito de propósito (precisa de regra confirmada)

- **Estorno automático:** o sistema registra o estorno informado pela SyncPay e pede
  conciliação, mas não devolve dinheiro nem cancela pedido sozinho.
- **Pedido cancelado pela loja depois de pago:** precisa de devolução manual pelo painel da
  SyncPay; aparece para o administrador como pendência a conferir.
- **Saldo disponível / valor depositado:** só a SyncPay sabe; as telas dizem isso e não afirmam.
- **Entregador (FlyBoy) no split:** fora, até existir regra comercial e suporte confirmado.
- **Carrinho de várias lojas:** o app já aceita uma loja por pedido; nada muda.
