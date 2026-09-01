# DATABASE — tudo que é banco de dados mora aqui

Esta pasta guarda **todo** o banco de dados do FlyControl: a estrutura das
tabelas, as regras de quem pode ver o quê, as funções, os gatilhos e as
funções de borda (Edge Functions). Nada de banco vive fora daqui.

## Por que tem uma pasta `supabase` dentro de `DATABASE`

Porque a ferramenta da Supabase **exige** uma pasta chamada exatamente
`supabase`. É como a caixa de correio que só aceita carta no formato dela:
não adianta achar o nome feio, o carteiro só entrega naquele.

A solução foi a pasta `DATABASE` por fora, com a `supabase` dentro. Você tem
o nome que faz sentido para você, e a ferramenta continua encontrando o que
precisa — o robô que aplica as mudanças é apontado para cá com
`--workdir DATABASE`.

```
DATABASE/
└── supabase/
    ├── config.toml      identificação do projeto na Supabase
    ├── migrations/      as mudanças no banco, em ordem de data
    ├── rollback/        os roteiros de "desfazer" (NÃO são aplicados sozinhos)
    └── functions/       Edge Functions (código que roda perto do banco)
```

---

## A regra de ouro das migrations

**Migration que já foi aplicada nunca é editada nem renomeada.**

O banco guarda um caderno com o nome de cada arquivo que já rodou. Mudar o
nome faz o banco achar que é arquivo novo e tentar rodar de novo. Mudar o
conteúdo faz o repositório passar a mentir sobre o que existe lá dentro.

Precisa corrigir algo? **Arquivo novo, com data nova.** O histórico fica.

Os roteiros de `rollback/` ficam **fora** de `migrations/` de propósito: se
caíssem lá dentro, o robô os aplicaria sozinho e desfaria a correção no mesmo
instante em que ela foi feita.

---

## Padrão de nomes

| O que | Idioma | Por quê |
| --- | --- | --- |
| Tabelas, colunas, funções, gatilhos | **inglês** | é o que 100% das 52 tabelas já usam; mudar isso seria reescrever o banco inteiro |
| Comentários e documentação | **português** | quem lê para decidir é o dono do negócio, não só quem programa |
| Nome do arquivo de migration | **português**, descritivo | é o que aparece na lista; `pedido_restaurado_volta_a_contar` diz o que faz, `4d92d2f3-a6d8` não diz nada |

Resumindo: **o código fala inglês, a explicação fala português.**

### Exceções conhecidas

Duas funções nasceram com nome em português e **já estão em produção**, então
não são renomeadas por enquanto (renomear exige migration nova, e o ganho é
só estético):

- `limpar_texto_do_cardapio`
- `sanear_textos_do_cardapio`

---

## ⚠️ O mesmo restaurante tem CINCO nomes diferentes

Este é o principal problema de identificação do banco hoje. Todas as colunas
abaixo apontam para **exatamente a mesma coisa**: a linha do restaurante em
`pizzerias.id`. Só o nome muda, dependendo de quando a tabela foi criada.

É o estoque chamar o mesmo produto de "refri", "refrigerante", "bebida",
"lata" e "produto 12" em cinco cadernos diferentes. Funciona, mas todo mundo
que chega perde uma hora entendendo.

| Nome da coluna | Tabelas | Onde apareceu |
| --- | --- | --- |
| `company_id` | 15 | `billing_cycles`, `checkout_intents`, `club_audit_logs`, `club_customer_achievements`, `club_customer_status`, `club_cycles`, `club_history`, `club_notifications`, `club_rankings`, `club_vouchers`, `invoices`, `subscription_events`, `subscriptions`, `trial_grants`, `usage_events` |
| `tenant_id` | 11 | `orders`, `marketing_campaign_recipients`, `marketing_campaigns`, `marketing_customers`, `marketing_events`, `marketing_templates`, `marketing_usage`, `marketing_whatsapp_instances`, `order_status_history`, `restaurant_tables`, `waiters` |
| `pizzeria_id` | 5 | `combos`, `menu_categories`, `menu_extras`, `menu_products`, `pizzeria_pizza_sizes` |
| `restaurant_id` | 3 | `flycontrol_fiqon_logs`, `table_close_requests`, `table_sessions` |
| `target_store_id` | 1 | `admin_audit_logs` |

### Por que ainda não foi unificado

Porque unificar hoje **quebraria a cobrança em silêncio**, e isso é pior que
o nome feio.

O comando que renomeia coluna no PostgreSQL (`ALTER TABLE ... RENAME COLUMN`)
conserta sozinho as políticas de acesso, os índices e as chaves — mas **não
mexe no corpo das funções**, que o banco guarda como texto puro.

E `company_id` aparece **106 vezes dentro do corpo das funções do motor
financeiro do CENTS**. Depois do rename elas continuariam existindo, mas
falhariam ao rodar — e falhariam justamente no caminho do dinheiro.

É a diferença entre trocar a placa da rua e trocar o endereço escrito em mil
comandas já impressas: a placa muda numa canetada, as comandas não.

**Para unificar de verdade** é preciso, na mesma migration: renomear a coluna
**e** reescrever as ~20 funções que a citam, com teste de cada uma. É trabalho
real, planejável — só não é trabalho que se faça de passagem.

### Regra para tabela NOVA

Toda tabela criada daqui em diante usa **`tenant_id`**. É o nome que a tabela
mais central (`orders`) já usa e o termo padrão do mercado para "de quem é
esta linha" num sistema que atende vários clientes.

---

## Onde fica cada assunto

| Assunto | Tabelas principais |
| --- | --- |
| Lojas e usuários | `pizzerias`, `profiles`, `user_roles`, `blocked_emails` |
| Pedidos | `orders`, `order_items`, `order_status_history` |
| Cardápio | `menu_categories`, `menu_products`, `menu_extras`, `combos`, `combo_items`, `pizzeria_pizza_sizes` |
| Mesas e comandas | `restaurant_tables`, `table_sessions`, `table_session_orders`, `table_close_requests`, `waiters` |
| Cobrança | `plans`, `plan_price_versions`, `plan_features`, `subscriptions`, `billing_cycles`, `usage_events`, `invoices`, `invoice_items`, `payment_transactions`, `subscription_events`, `trial_grants`, `checkout_intents` |
| Clube CENTS (fidelidade) | `clubs`, `club_levels`, `club_benefits`, `club_settings`, `club_cycles`, `club_customer_status`, `club_achievements`, `club_customer_achievements`, `club_history`, `club_notifications`, `club_rankings`, `club_vouchers`, `club_campaigns`, `club_audit_logs` |
| Marketing (WhatsApp) | `marketing_customers`, `marketing_campaigns`, `marketing_campaign_recipients`, `marketing_templates`, `marketing_whatsapp_instances`, `marketing_events`, `marketing_usage` |
| Auditoria e diagnóstico | `admin_audit_logs`, `external_order_logs`, `flycontrol_fiqon_logs`, `signup_attempts` |

## Dinheiro

Sempre em **centavos inteiros** (`BIGINT`), nunca com casa decimal — assim não
aparece aquele centavo a mais que surge do nada no arredondamento.

O módulo de cobrança (`plan_price_versions`, `billing_cycles`, `usage_events`,
`invoices`) já segue isso. As tabelas mais antigas (`orders.total`,
`table_sessions`) ainda usam reais com vírgula, e o Clube CENTS usa `NUMERIC`
— dívida registrada, não corrigida.
