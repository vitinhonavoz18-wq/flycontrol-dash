# Auditoria de segurança — FlyControl — 22/10/2026

> Relatório escrito para o dono do projeto. Termos técnicos vêm explicados na
> hora. Nenhuma chave, senha ou dado de cliente aparece aqui.

## 1. Resumo executivo

O FlyControl já tinha passado por um bom trabalho de proteção nas rotas do
próprio painel (pedidos com chave da loja e limite por minuto, avisos de
pagamento que são reconferidos na InfinityPay/SyncPay, Chat com duas chaves).

O problema principal estava **no banco de dados**, numa camada que fica
"por trás" do painel: o Supabase publica cada função do banco como um
endereço na internet, e várias funções que trabalham com a chave mestra
estavam abertas para **qualquer visitante, sem login**. Com isso era possível,
por exemplo, pegar as mensagens de WhatsApp que uma loja ia mandar aos
clientes, ver o faturamento de todas as lojas da plataforma e mexer no ciclo
de cobrança do CENTS.

As correções estão prontas e testadas numa cópia simulada do banco, **mas a
parte do banco ainda NÃO está no ar** — precisa ser aplicada (passo a passo na
seção 10).

| Gravidade   | Encontrados | Corrigidos no código | Ainda abertos |
| ----------- | ----------- | -------------------- | ------------- |
| Crítica     | 3           | 3 (1 já vai no deploy; 2 dependem de aplicar o SQL) | 0 |
| Alta        | 6           | 5                    | 1 (SEC-08)    |
| Média       | 6           | 5                    | 1 (SEC-15)    |
| Baixa       | 8           | 3                    | 5             |
| Informativa | 5           | —                    | —             |

## 2. Arquitetura analisada

- **Painel (este repositório):** TanStack Start (React) publicado como Worker
  na Cloudflare. Endereços de servidor em `src/routes/api/*` e "funções de
  servidor" (`createServerFn`) em `src/lib/**/*.functions.ts`.
- **Banco:** Supabase/PostgreSQL (projeto FLYCONTROL), com regras de acesso
  por linha (RLS) e 150+ migrações.
- **Funções na nuvem do Supabase:** `admin-*`, `public-tables`,
  `webhook-orders`, `club-close-cycle` (neste repositório) e funções de
  Mercado Pago / FlyDelivery (publicadas a partir de outro lugar).
- **Integrações:** SiteCreatorFly (pedidos e mesas), InfinityPay (assinatura),
  SyncPay (Pix do FlyDelivery), n8n + UAZAPI (WhatsApp do Chat e Marketing).
- **Robôs:** cron da Cloudflare (cobrança diária) e cron do banco (CENTS,
  afiliados).

## 3. Achados

Legenda de situação: **CT** = corrigido e testado · **CN** = corrigido, mas
não testado integralmente · **AB** = identificado, não corrigido · **NV** = não
foi possível verificar.

### Críticos

| ID | O quê | Onde | Situação |
| -- | ----- | ---- | -------- |
| SEC-01 | Visitante sem login conseguia ler e "segurar" a fila de WhatsApp de qualquer loja com Chat (telefone + texto), injetar mensagens falsas na caixa de entrada e renomear clientes. | Funções `crm_next_outbox`, `crm_receive_message`, `crm_attach_media`, `crm_rename_customer` | **CT** em banco simulado; falta aplicar em produção |
| SEC-02 | Visitante sem login lia o faturamento de dia/semana/mês de **todas** as lojas (com o id do dono) e o total da plataforma. | Visões `pizzeria_financial_metrics` e `admin_global_financial_metrics` | **CT** em banco simulado; falta aplicar |
| SEC-09 | Biblioteca do servidor (TanStack Start) com falha pública de XSS refletido nas respostas das funções de servidor; e a `seroval`, que ela usa, com falha crítica. | `package.json` | **CT** — atualizado para versões corrigidas; testes, build e servidor local OK |

**Evidência SEC-01/02:** consulta de permissões no banco de produção
(somente leitura) mostrou `anon` com permissão de execução/leitura. Causa raiz
do SEC-01: as migrações `20260915050000_leads_unificados` e
`20260918140327_chat_midia` apagaram e recriaram as funções do Chat, e função
recriada nasce aberta — as travas da fundação do CRM se perderam. A
exploração **não** foi feita em produção.

### Altos

| ID | O quê | Onde | Situação |
| -- | ----- | ---- | -------- |
| SEC-03 | Visitante podia fechar antes da hora ciclos do CENTS e recalcular nível/preço de qualquer loja. | Funções `club_*` | **CT** simulado; falta aplicar |
| SEC-04 | O aviso "mesa fechada" enviado **assinado** ao SiteCreatorFly podia ser disparado por qualquer pessoa, sem login, com loja/mesa/senha da comanda inventadas — o FlyControl assinava. | `src/lib/notifyTableClosed.functions.ts` | **CT** — servidor local respondeu 401 sem login e o aviso nem começou |
| SEC-05 | Qualquer conta logada (o cadastro é aberto) podia mudar preço ou apagar tamanhos de pizza de **qualquer** loja. | Regra "Enable all for authenticated users" em `pizzeria_pizza_sizes` | **CT** simulado; falta aplicar |
| SEC-06 | Qualquer conta logada lia a senha (`customer_token`) de todas as comandas abertas; e a consulta antiga de status entregava essa senha a quem só soubesse loja + número da mesa. | Regra "Public can read session lifecycle" + `/api/public/table-session-status` | **CT** (código) e **CT** simulado (banco; falta aplicar) |
| SEC-07 | Função na nuvem `webhook-orders` (no ar) cria pedido em qualquer loja só com o nome da loja, sem senha e sem limite. Nunca foi usada de verdade (0 pedidos). | `supabase/functions/webhook-orders` | **CN** — código desativado; **continua no ar até publicar ou apagar** |
| SEC-08 | As "senhas" dos QR Codes das mesas são públicas: qualquer visitante lista as mesas de qualquer loja com o código. Com ele, dá para abrir/assumir a comanda de uma mesa e trocar a senha da comanda ativa (o cliente real perde o acesso). | Regras de `restaurant_tables`, função `public-tables`, `/api/public/open-table-session` | **AB** — exige mudança combinada com o SiteCreatorFly (ver seção 9) |

### Médios

| ID | O quê | Situação |
| -- | ----- | -------- |
| SEC-10 | Login do garçom sem limite de tentativas (senha pode ter 4 letras). Agora: no máximo 10 erros por usuário e 30 por endereço de internet a cada 15 min. | **CN** — não testado contra o banco real |
| SEC-11 | Garçom desativado ou apagado continuava entrando por até 12 h com o "crachá" já emitido. | **CN** |
| SEC-12 | Visitante podia apagar o histórico de localização dos entregadores (`flycourier_purge_old_locations`). | **CT** simulado; falta aplicar |
| SEC-13 | Qualquer conta logada criava mesas em loja alheia e inscrevia qualquer loja no CENTS. Agora a função confere dono/administrador. | **CT** simulado; falta aplicar |
| SEC-14 | Qualquer conta logada via a lista de quem é administrador da plataforma. | **CT** simulado; falta aplicar |
| SEC-15 | Visitante sem login ainda lê nome do cliente e valores de todas as comandas (sem a senha). Pode estar sendo usado para acompanhar a mesa em tempo real. | **AB** — conferir antes de fechar |

### Baixos

| ID | O quê | Situação |
| -- | ----- | -------- |
| SEC-16 | `/api/orders` devolvia mensagem interna do banco no erro e o registro de pedidos externos guardava a chave inteira da loja quando ela vinha no corpo. | **CT** (teste de regressão) |
| SEC-17 | Registro de abertura de mesa gravava o código da mesa inteiro. | **CT** |
| SEC-18 | Funções internas de recálculo de comanda/limpeza abertas a visitantes. | **CT** simulado; falta aplicar |
| SEC-19 | Supabase Auth com a proteção contra senhas vazadas desligada. | **AB** — ajuste manual (seção 10) |
| SEC-20 | Dependências de **desenvolvimento** com falhas (vite, shell-quote, undici via jsdom…). Não vão para o sistema no ar. | **AB** |
| SEC-21 | Função `club-close-cycle` sem senha (só fecha ciclos já vencidos; repetir não duplica). | **AB** |
| SEC-22 | `company_has_crm_chat` e `is_admin(uuid)` abertas: revelam "a loja X tem Chat" / "o usuário Y é admin". | **AB** |
| SEC-23 | Endereços públicos aceitam qualquer site de origem (CORS). Sem cookie de sessão envolvido, impacto baixo. | **AB** |

### Informativos

- **SEC-24** Algumas funções do estoque/PDV testam `current_user = 'service_role'`,
  o que nunca é verdade dentro delas. Não abre brecha; só faz chamadas do
  servidor a essas funções serem recusadas.
- **SEC-25** O histórico de migrações do banco está desencontrado do
  repositório: o robô de migrações vai **travar** e não aplicará nada sozinho.
- **SEC-26** Confirmar na Cloudflare que `INFINITYPAY_TRUST_RETURN` está
  `false` (não consegui ler as variáveis de produção daqui).
- **SEC-27** Histórico do git: só aparece a chave **pública** de um projeto
  antigo. Nenhuma chave secreta vazada encontrada.
- **SEC-28** As funções de Mercado Pago e FlyDelivery publicadas no Supabase
  não estão neste repositório e não foram auditadas.

### O que estava bom

Avisos de pagamento (InfinityPay e SyncPay) nunca confiam no aviso — sempre
reconferem no provedor; Chat com chave mestra + senha por loja, comparadas sem
vazar pelo tempo; robô de cobrança com segredo obrigatório; proxy de cardápio
com trava contra endereços internos; regras de pedidos, cardápio e estoque
isolando lojas; senhas de garçom com PBKDF2.

## 4. Arquivos alterados

| Arquivo | Por quê |
| ------- | ------- |
| `supabase/migrations/20261022160000_tranca_funcoes_e_visoes_expostas.sql` | SEC-01/02/03/05/06/12/13/14/18 |
| `docs/REVERTER-NO-SUPABASE-tranca-funcoes-e-visoes.sql` | Desfazer a migração, se preciso |
| `src/lib/notifyTableClosed.functions.ts` | SEC-04 |
| `src/lib/waiterAuth.functions.ts`, `src/lib/signup/rateLimit.server.ts` | SEC-10/11 |
| `src/routes/api/public/table-session-status.ts` | SEC-06 |
| `src/routes/api/orders.ts`, `src/routes/api/public/open-table-session.ts` | SEC-16/17 |
| `supabase/functions/webhook-orders/index.ts` | SEC-07 |
| `package.json`, `bun.lock` | SEC-09 (`@tanstack/react-start` 1.168.60, `@tanstack/react-router` 1.170.41, `seroval` 1.6.8 fixo) |
| `src/routes/__root.tsx` | Ajuste de tipo exigido pela versão nova do roteador |
| `src/lib/server/auditoriaSeguranca.test.ts` | 27 testes que impedem as falhas de voltarem |

## 5. Testes executados

| Teste | Comando | Resultado |
| ----- | ------- | --------- |
| Suíte completa | `bun run test` | 107 arquivos, 1683 testes, todos passando |
| Testes novos | `npx vitest run src/lib/server/auditoriaSeguranca.test.ts` | 27/27; conferido que um deles fica vermelho se a trava for removida |
| Tipos | `npx tsc --noEmit` | 1 erro, que **já existia** antes (`src/utils/menuSync.test.ts`) |
| Lint dos arquivos mexidos | `npx eslint …` | Nenhum erro novo (os antigos de formatação continuam) |
| Build | `bun run build` | OK |
| Servidor local | `wrangler dev` sobre o build | Início, login e `/api/health` respondendo 200; aviso de mesa fechada sem login → **401** |
| Banco simulado | PostgreSQL 16 local imitando permissões do Supabase; 22 cenários antes/depois | Antes: 13 cenários abertos. Depois: todos fechados; dono, admin e servidor continuam funcionando; reversão testada |
| Dependências | `bun audit` | Críticas de produção resolvidas; sobram só ferramentas de desenvolvimento |
| Segredos | busca por padrões de chaves no código e nas 1360 versões do histórico | Só chave pública antiga |

## 6. O que não foi possível testar

- Aplicar a migração no banco de produção (não autorizado; e o robô vai travar — SEC-25).
- Login do garçom contra o banco real (precisa do Supabase de produção).
- Funções de Mercado Pago/FlyDelivery publicadas fora deste repositório.
- Fluxos de IA do n8n (ficam no n8n). Do lado do FlyControl, a IA só alcança a loja cuja senha ela apresenta — não consegue pular para outra loja, mesmo que alguém "convença" a IA.
- Variáveis de produção na Cloudflare (SEC-26).

## 7. Riscos que continuam

1. **Até a migração ser aplicada, SEC-01, 02, 03, 05, 06 (parte do banco), 12, 13, 14 e 18 continuam abertos em produção.**
2. SEC-08 (código das mesas público) e SEC-07 (`webhook-orders` no ar).
3. SEC-15, 19 a 23.

## 8. Plano de prioridades

1. Aplicar a migração (hoje).
2. Apagar a função `webhook-orders` no Supabase.
3. Ligar a proteção contra senhas vazadas.
4. Projeto combinado com o SiteCreatorFly para SEC-08: cadastrar a chave nas 14 lojas sem chave, passar a exigir a chave em `open-table-session`, e trocar a leitura direta das mesas por uma conferência que não exponha o código.
5. Atualizar ferramentas de desenvolvimento (SEC-20) com calma, em mudança separada.
6. Acertar o histórico de migrações (SEC-25) para o robô voltar a funcionar.

## 9. Avaliação final

Depois de aplicada a migração, o risco cai de forma importante: as portas que
qualquer visitante conseguia abrir ficam fechadas, e as que dependem de login
passam a conferir se a pessoa é dona da loja. Isso **não é garantia de
segurança total**: SEC-08 continua sendo a principal porta aberta, e as
funções publicadas fora deste repositório não foram examinadas.
