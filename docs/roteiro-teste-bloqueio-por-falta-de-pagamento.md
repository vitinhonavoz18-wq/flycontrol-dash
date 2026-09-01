# Roteiro de teste — bloqueio por falta de pagamento

Este roteiro existe porque essa engrenagem **nunca girou de verdade**. A regra
foi escrita, o código foi escrito, mas ninguém nunca viu uma loja ser cortada
por não pagar e depois ser liberada ao pagar.

Testar isso não é luxo. Um corte que não acontece é dinheiro que não entra; um
corte que acontece errado é um restaurante fora do ar no sábado à noite.

---

## O que JÁ está provado automaticamente

Não repita à mão o que a suíte já garante. Rode `npx vitest run` e estes 20
testes conferem sozinhos:

| Arquivo | O que prova |
| --- | --- |
| `collections.test.ts` | A regra: antes de 24h avisa, depois de 24h corta; não repete ação já feita |
| `collections.server.test.ts` | A execução: suspende, tranca a porta que o painel lê, fecha a vitrine, marca a fatura, grava auditoria; falha da vitrine não aborta a suspensão; não sobrescreve mudança de outro processo |
| `vitrine.server.test.ts` | Fechar e reabrir andam em par; reabrir **não** força uma loja que o dono deixou fechada |

**O que os testes NÃO conseguem provar** — e por isso este roteiro existe:

1. Se o SiteCreatorFly realmente **tira o cardápio do ar** ao receber
   `is_open: false`, ou se apenas mostra "fechado".
2. Se a tela de bloqueio aparece de verdade para o lojista.
3. Se o pagamento pela InfinityPay dispara o webhook e libera tudo de volta.

Três coisas que só a realidade responde.

---

## Regras de segurança — leia antes

1. **Nunca use a loja de um cliente pagante.** Nem "só para ver". O teste
   derruba o cardápio.
2. **Use o plano interno `teste`** (R$ 0,20), que existe exatamente para isto.
3. **Toda consulta de escrita leva `WHERE id = '<id-da-loja-teste>'`.** Um
   `UPDATE` sem `WHERE` na tabela de faturas suspende a base inteira.
4. **Anote o id da loja de teste** antes de começar e confira em cada passo.
5. Faça **fora do horário de pico**, mesmo sendo loja de mentira.

---

## Passo 0 — Criar a loja de mentira

Pelo cadastro normal, para o teste exercitar o caminho real:

```
/signup?plan=teste
```

Use um e-mail e um CNPJ que você não vá querer reaproveitar: o período gratuito
é concedido **uma vez por e-mail e uma vez por documento** (índice único em
`trial_grants`), então essa conta fica queimada para trial depois do teste.

Guarde o id que aparece no painel admin, em **Clientes e Planos**. Daqui em
diante ele é `<LOJA>`.

**Confira antes de seguir:**

```sql
select id, name, slug, status, subscription_status, plan_type
from pizzerias where id = '<LOJA>';
```

Esperado: `status = 'active'`, `subscription_status` liberado.

---

## Passo 1 — Fotografar o estado inicial

Abra o cardápio digital da loja de teste no celular e **tire um print**. É com
essa foto que você vai comparar depois — sem ela, fica a dúvida de se a página
já era assim.

```sql
select s.id, s.status, s.trial_ends_at, c.id as ciclo, c.cycle_end, c.status as ciclo_status
from subscriptions s
left join billing_cycles c on c.subscription_id = s.id and c.status = 'open'
where s.company_id = '<LOJA>';
```

---

## Passo 2 — Forçar o fim do período gratuito

Puxa o fim do ciclo para o passado, para o fechamento emitir a fatura:

```sql
update billing_cycles
   set cycle_end = now() - interval '1 hour'
 where company_id = '<LOJA>' and status = 'open';
```

Dispare o fechamento:

```bash
curl -i -X POST https://<SEU-DOMINIO>/api/billing/close-cycles \
  -H "x-billing-cron-secret: <BILLING_CRON_SECRET>"
```

**Esperado:** resposta 200 com `processed: 1`. Confira que nasceu a fatura:

```sql
select id, status, total_cents, due_at from invoices where company_id = '<LOJA>';
```

> ⚠️ Se o total for 0, a fatura é marcada como paga sozinha e o teste não
> continua — é proposital, não se cobra R$ 0,00. Use o plano `teste`, que tem
> R$ 0,20, e não o gratuito.

---

## Passo 3 — Vencer a fatura, mas ainda dentro das 24h

```sql
update invoices set due_at = now() - interval '2 hours'
 where company_id = '<LOJA>' and status = 'pending';
```

Dispare o fechamento de novo (mesmo `curl` do passo 2).

**Esperado na resposta:** `reconciliation.markedPastDue: 1`, `suspended: 0`.

**Confira as três portas — todas devem continuar ABERTAS:**

| Onde | O que esperar |
| --- | --- |
| Painel, logado como o dono da loja teste | entra normal, sem tela de bloqueio |
| Cardápio digital | continua no ar |
| Pedido pelo cardápio | é aceito |

Este passo prova a tolerância: quem pagou e a compensação não caiu ainda **não
pode** ficar sem operar.

---

## Passo 4 — Passar das 24 horas: o corte

```sql
update invoices set due_at = now() - interval '25 hours'
 where company_id = '<LOJA>' and status = 'pending';
```

Dispare o fechamento de novo.

**Esperado na resposta:** `reconciliation.suspended: 1`.

**Confira as três portas — agora devem estar FECHADAS:**

| Onde | O que esperar | Se falhar, o problema está em |
| --- | --- | --- |
| Painel do dono | tela **"Loja Suspensa"**, com botão "Ver cobrança e pagar" | `src/routes/_app.tsx` |
| Pedido pelo cardápio | recusado com `403` e `store_suspended` | `src/routes/api/orders.ts` |
| Cardápio digital | **é aqui que está a dúvida** — ver abaixo | SiteCreatorFly |

**A pergunta central do teste:** compare com o print do passo 1. O cardápio
saiu do ar, ou só apareceu "fechado"?

- Saiu do ar → está como você pediu, nada a fazer.
- Só "fechado" → o cliente ainda vê o cardápio, mas não consegue pedir.
  Precisamos combinar com o SiteCreatorFly um sinal mais forte que
  `is_open: false`.

Confira também que o banco registrou:

```sql
select subscription_status from pizzerias where id = '<LOJA>';   -- suspended
select status from invoices where company_id = '<LOJA>';         -- overdue
select event_type, reason from subscription_events
 where company_id = '<LOJA>' order by created_at desc limit 1;   -- suspended_for_nonpayment
```

E confira a resposta do `curl`: se vier algo em `reconciliation.errors`
falando em "vitrine não fechou", o corte aconteceu mas o aviso ao
SiteCreatorFly falhou — anote a mensagem.

---

## Passo 5 — Pagar e ser liberado

Este é o passo que **mais importa** e o mais fácil de esquecer. Um sistema que
corta e não religa é pior que um que não corta.

Pague a fatura de R$ 0,20 pelo link da InfinityPay, na tela "Plano e cobrança"
da loja de teste. Pague **de verdade** — é o único jeito de exercitar o webhook.

**Esperado, sem ninguém mexer em nada:**

| Onde | O que esperar |
| --- | --- |
| Painel do dono | volta a abrir normal |
| Pedido pelo cardápio | volta a ser aceito |
| Cardápio digital | volta ao ar |

```sql
select status from subscriptions where company_id = '<LOJA>';     -- active
select subscription_status from pizzerias where id = '<LOJA>';    -- active
select status, paid_at from invoices where company_id = '<LOJA>'; -- paid
```

> Se o painel liberar mas o cardápio continuar fechado, o problema está na
> reabertura da vitrine (`reabrirVitrine`, chamada pelo webhook da
> InfinityPay). Olhe o log por `[infinitypay] fatura ... paga, mas a vitrine
> não reabriu`.

---

## Passo 6 — Limpeza

```sql
-- Apaga a loja de teste. As tabelas filhas caem junto por cascata.
delete from pizzerias where id = '<LOJA>';

-- Libera o e-mail e o documento para poderem ganhar trial de novo.
delete from trial_grants where company_id = '<LOJA>';
```

Confirme que sobrou nada:

```sql
select count(*) from pizzerias  where id = '<LOJA>';         -- 0
select count(*) from invoices   where company_id = '<LOJA>'; -- 0
select count(*) from orders     where tenant_id = '<LOJA>';  -- 0
```

Apague também o usuário de teste no painel admin, em **Usuários**.

---

## Se der errado no meio: como voltar

Nenhum passo apaga dado de cliente. Se precisar abortar, devolva a loja de
teste ao ar:

```sql
update subscriptions set status = 'active', suspended_at = null where company_id = '<LOJA>';
update pizzerias     set subscription_status = 'active'          where id = '<LOJA>';
update invoices      set status = 'paid', paid_at = now()        where company_id = '<LOJA>' and status <> 'paid';
```

E reabra a vitrine salvando qualquer alteração na tela **Minha Loja**, que
dispara uma sincronização nova.

**Se por acidente uma loja de cliente for suspensa:** os mesmos três comandos
acima, trocando `<LOJA>` pelo id dela — e depois salve algo em Minha Loja para
a vitrine voltar. Confira com o cliente antes de dar por resolvido.

---

## O que anotar ao terminar

Três respostas, que é o que este teste existe para descobrir:

1. O cardápio digital **saiu do ar** ou só ficou "fechado"?
2. O pagamento liberou tudo **sozinho**, sem intervenção manual?
3. Sobrou algo em `reconciliation.errors` em qualquer um dos disparos?
