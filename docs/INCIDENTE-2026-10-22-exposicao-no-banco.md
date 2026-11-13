# Incidente de segurança — exposição de dados no banco (22/10/2026)

**Classificação:** incidente de segurança **prioritário**, aberto.
**Situação:** exposição confirmada no banco de produção; correção pronta e
testada, **ainda não aplicada**. Nada foi alterado em produção durante a
investigação.

## 1. Como foi verificado

Para cada perfil — visitante sem login (`anon`), conta logada qualquer,
lojista, administrador e servidor —, o banco de produção foi consultado "na
pele" desse perfil, numa transação desfeita no final (`ROLLBACK`). Nenhuma
função que grava foi chamada.

O roteiro está em `docs/VALIDAR-NO-SUPABASE-tranca.sql`. Resultado em
produção, 22/10/2026: **19 de 46 verificações ok, 27 falham**. É o mesmo
número do banco de teste antes da trava.

## 2. O que está exposto hoje

### Para qualquer visitante, sem login, só com a chave pública do site

| O quê | Onde | Alcance |
| --- | --- | --- |
| Faturamento do dia, da semana e do mês, nº de pedidos, ticket médio, último pedido, nome e situação de cada loja, **com o id do dono** | visão `pizzeria_financial_metrics` | **todas as 16 lojas** |
| Faturamento total da plataforma | visão `admin_global_financial_metrics` | plataforma inteira |
| Fila de saída do WhatsApp: telefone, nome do contato, texto e mídia de cada mensagem **no momento do envio**. Quem chama ainda "segura" as mensagens (ficam marcadas como em envio e não saem) | função `crm_next_outbox` | as 3 lojas com Chat ativo — 981 mensagens enviadas nos últimos 7 dias. A fila não guarda histórico: o risco é interceptar e bloquear o que está saindo |
| Inserir mensagem falsa na caixa de entrada do Chat; renomear cliente; anexar mídia | `crm_receive_message`, `crm_rename_customer`, `crm_attach_media` | lojas com Chat |
| Fechar ciclo do CENTS antes da hora; recalcular nível e preço | funções `club_*` | qualquer loja |
| Apagar o histórico de localização dos entregadores | `flycourier_purge_old_locations` | todos |
| Criar mesas em loja alheia; inscrever loja no CENTS | `generate_default_restaurant_tables`, `enroll_company_in_cents` | qualquer loja |

**Como o visitante descobre o número de cada loja:** a própria visão de
faturamento entrega o id das 16 lojas. Então a cadeia "descobrir a loja →
interceptar o WhatsApp dela" funciona sem nenhuma outra informação.

### Para qualquer conta logada (o cadastro é aberto)

Tudo acima, mais:
- a lista de papéis dos **32 usuários** (quem é administrador);
- a senha (`customer_token`) das comandas abertas;
- os tamanhos de pizza de outras lojas, com permissão de alterar e apagar.

### O que NÃO está exposto (conferido)

Pedidos, itens, clientes do marketing, conversas e mensagens guardadas do
Chat, segredos do WhatsApp, assinaturas, faturas, estoque e afiliados: o
visitante vê **0 linhas** ou é barrado. O que ele vê do FlyDelivery
(vitrine, produtos e zonas de entrega) e dos planos é público por desenho.

### Houve uso indevido?

Nos registros de acesso disponíveis (o plano gratuito guarda só as últimas
**24 horas**), todas as chamadas a essas funções vieram do próprio servidor
do FlyControl, e ninguém leu as visões de faturamento. Antes disso, **não há
registro** para afirmar nem descartar.

## 3. Correção

- **Definitiva:** `supabase/migrations/20261022160000_tranca_funcoes_e_visoes_expostas.sql`.
  - Tira de visitantes e contas logadas as 14 funções que só o servidor usa.
  - Põe a conferência "é o dono ou o administrador?" dentro das 2 funções
    que o painel chama.
  - Faz o faturamento obedecer as regras de quem pede.
  - Fecha as 3 regras largas: tamanhos de pizza, papéis e comandas.
  - Não apaga nem altera dado. **Não depende** de nada do CRM 2.0.
- **Contenção imediata (opcional):** `docs/CONTENCAO-IMEDIATA-faturamento-e-whatsapp.sql`.
  Só as linhas da trava que fecham o WhatsApp e o faturamento, para quando
  for preciso fechar o mais grave em minutos. Um teste garante que cada linha
  existe igual na trava completa.

### Provas

`scripts/testes-permissoes/rodar.sh` sobe um PostgreSQL descartável que
imita as permissões do Supabase (sem dado real) e roda a validação de 46
itens:

| Etapa | Resultado |
| --- | --- |
| Antes da trava | 19/46 |
| Trava completa | 46/46 |
| Com o CRM 2.0 aplicado junto | 46/46 |
| Depois da reversão | 19/46 (volta ao exato estado anterior) |
| Contenção sozinha | 28/46 (WhatsApp e faturamento fechados) |
| Trava completa por cima da contenção | 46/46 |
| Arquivo de aplicação do SQL Editor | 46/46, anota só a versão `20261022160000`, e rodar duas vezes não quebra |

Também verificado: com uma linha da trava removida de propósito, o teste
fica vermelho.

### Ordem de aplicação

As duas migrações pendentes deste mês **não dependem uma da outra**. Testadas
nas duas ordens, o resultado é igual.

1. Backup conferido (`docs/backup/COMO-FAZER-BACKUP-DO-BANCO.md`).
2. `docs/VALIDAR-NO-SUPABASE-tranca.sql`. Esperado: 19/46.
3. `docs/APLICAR-NO-SUPABASE-tranca-de-seguranca.sql` (a trava, numa
   transação só, com a anotação no caderno). Prioridade: primeiro.
4. `docs/VALIDAR-NO-SUPABASE-tranca.sql`. Esperado: **46/46**.
5. Teste rápido no painel: login, pedido de teste, Chat e tela de faturamento
   do administrador.
6. Depois, em outra etapa: `docs/APLICAR-NO-SUPABASE-chat-crm-2.sql` (CRM 2.0,
   tipos de arquivo do Chat — também ainda não aplicado).

Se algo der errado no passo 3 ou 4: `docs/REVERTER-NO-SUPABASE-tranca-funcoes-e-visoes.sql`.

## 4. O robô de migrações (GitHub Actions)

- **Identidade usada:** os segredos do repositório `SUPABASE_ACCESS_TOKEN`
  (token pessoal de uma conta do Supabase) e `SUPABASE_DB_PASSWORD`. Os
  valores não foram lidos nem impressos.
- **O que foi negado:** o primeiro passo, `supabase link --project-ref
  knhenchgntttraaeewlj`, que pede à API de gestão do Supabase acesso ao
  projeto. Resposta: *"Your account does not have the necessary privileges
  to access this endpoint"*. Ou seja, o token é aceito (não é um token
  inválido), mas **a conta dona dele não tem acesso a este projeto**.
- **Quando começou:** a última execução com sucesso foi em **04/09 05:53**;
  todas desde **11/09 18:39** falham com essa mesma mensagem, 18 seguidas.
  Nessa semana, a conta dona do token perdeu acesso à organização dona do
  projeto (hoje "arthurgarciaba-dev's Org"): saiu da organização, ou o
  projeto mudou de organização, ou o token foi gerado em outra conta. Daqui
  não dá para ver qual das três — a lista de membros e a origem do token só
  aparecem no painel do Supabase.
- **Ajuste mínimo (quando for a hora):** gerar um token novo numa conta que
  seja membro da organização do projeto e trocar só o segredo
  `SUPABASE_ACCESS_TOKEN` no GitHub. No plano gratuito, os papéis são por
  organização, e o de **Desenvolvedor** já basta para o robô. Nenhuma
  permissão do banco precisa mudar.
- **Recomendação:** não consertar antes de acertar o caderno de mudanças.
  Mesmo funcionando, o robô para na própria trava, porque o banco tem 55
  anotações sem arquivo correspondente. E quando o caderno for acertado, o
  robô aplicaria sozinho tudo o que está pendente, inclusive duas mudanças
  antigas nunca aplicadas (Pix SyncPay e número diário do pedido). Esse
  acerto é uma etapa própria, com revisão.
