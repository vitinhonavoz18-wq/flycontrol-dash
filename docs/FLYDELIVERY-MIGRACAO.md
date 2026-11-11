# FlyControl → FlyDelivery: o que mudou, o que não mudou e como publicar

Este documento é o mapa da troca de marca. Ele responde a quatro perguntas:

1. O que existe no sistema hoje (inventário real, conferido no código)?
2. O que mudou de nome e o que **não pode** mudar de nome?
3. Como colocar no ar com segurança — e como voltar atrás?
4. O que ficou pendente?

> **A ideia em uma frase:** trocamos a **fachada** (nome, logotipo, cores,
> textos, menu) e deixamos o **encanamento** como estava (endereços, tabelas,
> chaves). Fachada nova não pode fazer o carteiro errar o endereço.

---

## 1. Inventário: o que o sistema é de verdade

Conferido no repositório em novembro de 2026. Nada aqui é suposição.

### Tecnologia

| Peça | O que é |
|---|---|
| Telas | React 19 + TanStack Start/Router, Tailwind 4, componentes Radix |
| Servidor | Rotas `/api/*` e funções de servidor do próprio TanStack Start, rodando na Cloudflare (Workers) |
| Banco e login | Supabase (PostgreSQL + Auth). 157 migrações, ~98 tabelas, ~91 com trava de acesso por linha (RLS), ~212 regras de acesso |
| Publicação | GitHub Actions: `deploy.yml` publica na Cloudflare quando algo entra na `main`; `migrations.yml` aplica as migrações do banco, com limite de segurança |
| Testes | Vitest — 1.895 testes passando ao fim deste trabalho |

### Módulos que existem (todos preservados)

| Módulo | Onde | Classificação |
|---|---|---|
| Quadro de pedidos em tempo real (kanban, som, arrastar) | `/dashboard` | A — mantido |
| Busca de pedidos | `/search-orders` | A — mantido |
| Mesas, comandas, garçons, comissões | `/tables`, `/waiters`, `/commissions`, portal do garçom | A — mantido |
| Cardápio, combos, pizzaria premium | `/menu`, `/combos` | A — mantido |
| Estoque e PDV (balcão) | `/inventory/*` | A — mantido |
| Relatórios e finanças | `/finance` | **B — corrigido** (cancelados fora da conta, período personalizado) |
| Marketing por WhatsApp (n8n + UAZAPI) | `/marketing` | A — mantido |
| Chat/CRM com IA | `/chat`, `/api/crm.*` | A — mantido |
| App FlyDelivery (vitrine, impulsionar, Pix com divisão SyncPay) | `/flydelivery` | A — mantido, **renomeado na tela para "App FlyDelivery"** |
| Minha loja, aparência do site, bairros de entrega | `/my-store` | A — mantido |
| Plano e cobrança (InfinityPay), Clube CENTS | `/billing`, `/assinar`, `/pagamento` | A — mantido |
| Programa de afiliados | `/affiliates/*`, `/admin/affiliates/*` | A — mantido |
| Administração da plataforma | `/admin/*` | A — mantido |
| Comanda impressa (58/80 mm) pelo navegador | `/print/$orderId` | A — mantido, marca nova em traço |
| Guia de configuração (onboarding) | componente global | A — mantido |
| Entrada de pedidos do site | `POST /api/orders` | **B — corrigido** (pedido repetido não entra duas vezes) |
| Menu lateral e menu "Mais" do celular | `routes/_app.tsx`, `BottomNav` | **B — refeito** a partir de uma lista única |
| Página pública, login, cadastro | `/`, `/login`, `/signup`, `/plans` | **B — redesenhados** |
| Função antiga `webhook-orders` | Supabase Edge Function | D — legado já desativado (responde "use /api/orders") |

### O que o pedido original citava e **não existe** no sistema

| Item | Situação |
|---|---|
| **PrintNode** (impressão automática pelo servidor) | **Não existe.** A impressão hoje é pelo navegador: o lojista abre a comanda e imprime. Não foi criada integração nova — ver "Pendências". |
| Papéis "gerente" e "funcionário/operador" | **Não existem.** Os papéis reais são dois: `super_admin` (equipe da plataforma) e `owner` (dono da loja). Garçom tem login próprio, separado. |
| Menus "Integrações", "Impressão" e "Automações" | **Não foram criados.** Essas configurações já moram dentro de "Configurações"; criar itens de menu para telas que não existem seria porta pintada na parede. |
| Modelos de e-mail com a marca | Não há modelos de e-mail no repositório (os e-mails de login saem do Supabase — ver "O que você precisa fazer"). |

---

## 2. Mapa de nomes: o que mudou e o que ficou

### Mudou (tudo o que o lojista lê ou vê)

- Nome do produto em ~170 textos de tela, mensagens de erro e descrições de cobrança.
- Logotipo em todas as telas (agora um componente só: `src/components/brand/BrandLogo.tsx`).
- Ícones do aplicativo instalado, ícone da aba, tela "sem conexão", prévia do link no WhatsApp.
- Cores (paleta oficial em `src/styles.css`) e letra do painel (Inter).
- Oito textos gravados **dentro do banco** (migração `20261111120000`).
- Nomes de arquivo públicos com a marca antiga (`/images/flycontrol-*.webp` → `/images/painel-*.webp`).

### NÃO mudou — e não pode mudar sem um plano próprio

Cada item abaixo é uma porta por onde **outro sistema** entra, ou uma gaveta
onde o navegador do cliente **já guardou** alguma coisa.

| Nome técnico | Onde | Quem depende | O que quebra se renomear |
|---|---|---|---|
| `flycontrol.conectfly.com.br` | domínio do painel | lojistas, site de pedidos, InfinityPay, SyncPay, n8n | tudo: login, pedidos, pagamentos |
| `FLYCONTROL_PUBLIC_URL` | variável do servidor (Cloudflare) | criação de loja, retorno de pagamento, fotos do cardápio | loja nova nasce sem receber pedidos |
| `flycontrol_id`, `flycontrol_base_url` | campos enviados ao site de pedidos | SiteCreatorFly (`conectfly`) | site não acha a loja |
| `/api/public/flycontrol-table-closed` | endereço **no site de pedidos** | aviso de mesa fechada | mesa fecha no painel e continua aberta no site |
| `flycontrol_fiqon_logs` e chaves estrangeiras | tabela do banco | registro de testes de integração | registros somem do painel |
| `flycontrol-theme`, `flycontrol_sound_on`, `flycontrol:papel-da-comanda`, `flycontrol:fatura-adiada`, `flycontrol.checkout.intent` | guardados no navegador do lojista | preferências de cada aparelho | todo lojista perde tema, som e papel escolhidos |
| `flycontrol.waiterSession.v1` | guardado no celular do garçom | login do garçom | todos os garçons são deslogados no meio do serviço |
| `flycontrol-<loja>` | nome da conexão no WhatsApp (UAZAPI) | conexão de WhatsApp de cada loja | lojas perdem a conexão e precisam ler o QR Code de novo |
| `flycontrol-afiliados:` | "tempero" do cálculo que protege o IP no rastreio de afiliados | contagem de cliques | cliques antigos e novos deixam de bater |
| `source: "flycontrol"`, `flycontrol-test`, `flycontrol_manual_test` | marcações de origem em registros | relatórios e filtros | histórico fica partido em dois nomes |
| `flycontrol-v2` (prefixo `flycontrol-`) | cache do aplicativo instalado | limpeza automática do cache antigo | cache velho nunca é apagado |
| `flycontrol-dash` | nome do repositório e do Worker na Cloudflare | publicação | publicação cria um Worker novo, sem as configurações |
| `@flycontrolofc` | perfil no Instagram | — | **decisão sua** — ver "O que você precisa fazer" |

Há um teste automático segurando os mais perigosos: `src/lib/brand.test.ts`.

### Os dois "FlyDelivery"

Já existia um FlyDelivery: o **aplicativo** onde o cliente final acha a loja e
pede (repositório `Flydelivery`). Agora o painel do restaurante também se
chama FlyDelivery. Para o lojista não confundir a vitrine com a cozinha:

- na tela, o aplicativo aparece sempre como **"app FlyDelivery"** (menu, selo
  do pedido, textos da vitrine e dos recebimentos);
- no código, tudo o que é `flydelivery_*` continua sendo do **aplicativo**;
- nos comentários antigos, "FlyControl" continua significando **este painel**.

O programa de afiliados continua se chamando "Parceiros". Atenção: se um dia o
painel ganhar o sobrenome "FlyDelivery Parceiros", o programa de afiliados
precisará de outro nome.

---

## 3. O que mudou de comportamento (além da aparência)

Três mudanças mexem em **como o sistema funciona**, não só em como ele parece.

### 3.1 Pedido repetido não entra duas vezes

- **Antes:** o site reenvia o pedido até 3 vezes quando não recebe resposta. Se
  o painel já tinha gravado e só a resposta se perdeu, o reenvio criava um
  segundo pedido igual — duas comandas e dois pedidos na conta de quem paga por
  pedido.
- **Agora:** o painel reconhece o número de série do pedido e responde "já
  recebi" sem gravar de novo.
- **Contrato com o site:** não mudou. A resposta ao reenvio tem os mesmos
  campos de sempre, mais `duplicate: true`.
- **Onde:** `src/lib/orders/pedidoRepetido.ts`, `src/routes/api/orders.ts`,
  migração `20261111130000`.

### 3.2 Pedido cancelado saiu do faturamento

- **Antes:** "Faturamento", "Ticket médio", gráficos e rankings somavam
  também os pedidos cancelados.
- **Agora:** só contam pedidos não cancelados. Os cancelados aparecem num
  aviso à parte (quantos e quanto valiam) e continuam na lista de pedidos.
- **Efeito visível:** lojas com cancelamentos vão ver o faturamento **menor**
  do que viam. O número novo é o correto.
- **Onde:** `src/lib/finance/metricas.ts`, `src/routes/_app/finance.tsx`.

### 3.3 Tema claro passou a ser o padrão

- Quem **nunca** escolheu um tema passa a ver o claro (a identidade nova é
  "branco e laranja"). Quem já tinha escolhido continua com a sua escolha.
- A chave "Modo escuro" está no pé do menu lateral.

---

## 4. Migrações do banco

Duas migrações novas. As duas foram testadas num PostgreSQL descartável,
inclusive rodando duas vezes seguidas, e **nenhuma apaga ou altera pedidos,
clientes, produtos ou lojas**.

| Arquivo | O que faz | Risco |
|---|---|---|
| `20261111120000_marca_flydelivery_nos_textos.sql` | Troca "FlyControl" por "FlyDelivery" em 3 descrições do Clube CENTS e na frase de 3 regras do banco. Mantém dono, permissões e travas de segurança de cada função. | Baixo. Só palavras. |
| `20261111130000_pedido_externo_unico.sql` | Cria a trava que impede dois pedidos do site com o mesmo número de série na mesma loja. **Se já existirem repetidos antigos, não cria a trava, avisa e termina sem erro.** | Baixo. Bloqueia a escrita na tabela de pedidos por um instante enquanto cria o índice. |

Elas são aplicadas sozinhas pelo `migrations.yml` quando este trabalho entrar
na `main`.

**Como conferir depois se a trava do banco foi criada** (Supabase → SQL Editor):

```sql
select count(*) as trava_existe
  from pg_indexes
 where indexname = 'orders_pedido_externo_unico';
```

- `1` → criada, tudo certo.
- `0` → havia pedidos repetidos antigos. A proteção do painel funciona do
  mesmo jeito; só o caso raríssimo de dois reenvios no mesmo milésimo fica
  descoberto. Para ver os repetidos:

```sql
select tenant_id, external_order_id, count(*) as vezes, min(created_at) as primeiro
  from public.orders
 where external_order_id is not null and source = 'sitecreatorfly'
 group by 1, 2
having count(*) > 1
 order by primeiro desc;
```

  Decidir o que fazer com eles é decisão de negócio (podem ter entrado em
  cobrança). **Não apague nada sem conferir.**

---

## 5. Como publicar

O trabalho está no ramo `claude/loving-feynman-i4zgqy`. **Nada foi publicado.**
Entrar na `main` é o que publica — e isso é decisão sua.

### Antes

1. **Backup do banco** — siga `docs/backup/COMO-FAZER-BACKUP-DO-BANCO.md`.
2. Escolha um horário de pouco movimento (as migrações rodam junto com a
   publicação; a madrugada ou o meio da tarde de um dia útil).

### Publicar

3. Abra o pull request do ramo para a `main` e faça o merge.
4. Acompanhe em GitHub → Actions: "Deploy to Cloudflare Workers" e
   "Migrações do banco" precisam terminar verdes.

### Depois (10 minutos de conferência)

5. Abra o painel: nome e logo novos, menu em quatro grupos, aviso "O
   FlyControl evoluiu" no topo.
6. Faça **um pedido de teste pelo site de uma loja** e veja-o chegar no quadro.
7. Imprima a comanda desse pedido.
8. Abra "Relatórios e finanças" e confira os números do dia.
9. Cole o endereço do painel no WhatsApp: a prévia deve mostrar a arte nova
   (o WhatsApp pode levar algumas horas para atualizar).
10. Rode a consulta da trava do banco (seção 4).

---

## 6. Como voltar atrás

| O que deu errado | O que fazer |
|---|---|
| Qualquer coisa na tela ou nos pedidos | GitHub → o pull request já mesclado → **Revert** → merge. A publicação volta sozinha para a versão anterior. |
| Quer a marca antiga também nos textos do banco | Rode `docs/REVERTER-NO-SUPABASE-marca-flydelivery.sql` no SQL Editor (testado). |
| Quer remover a trava de pedido repetido do banco | `drop index if exists public.orders_pedido_externo_unico;` — não apaga pedido nenhum. |

Voltar atrás **não perde dados**: nenhuma das mudanças apaga ou transforma
pedidos, clientes, produtos, lojas ou cobranças.

Observação: depois de um revert, quem já instalou o aplicativo pode continuar
vendo o ícone novo por um tempo (o aparelho guarda o ícone).

---

## 7. O que você precisa fazer do seu lado

| Onde | O quê | Por quê |
|---|---|---|
| Supabase → Authentication → Email Templates | Trocar "FlyControl" por "FlyDelivery" nos e-mails de confirmação e de troca de senha | Esses textos moram no Supabase, fora do repositório |
| Supabase → Authentication → URL Configuration | Conferir o "Site name" | Aparece nos e-mails |
| Google Cloud → tela de consentimento do login com Google | Trocar o nome e a logo do aplicativo | É o que aparece em "Continuar com Google" |
| InfinityPay e SyncPay | Conferir o nome que aparece para quem paga | As descrições das cobranças novas já saem como "FlyDelivery", mas o nome da conta é configurado lá |
| Instagram | Decidir se o perfil `@flycontrolofc` muda de nome | O rodapé do site aponta para ele; se mudar, me avise para atualizar `src/lib/landing/contato.ts` |
| n8n | Nada obrigatório | Os fluxos usam endereços e chaves, que não mudaram |
| Domínio | Decidir se o painel ganha um endereço novo (ex.: `painel.flydelivery...`) | **Não foi alterado.** Trocar domínio exige plano próprio: DNS, redirecionamento do endereço antigo, atualizar `FLYCONTROL_PUBLIC_URL`, InfinityPay, SyncPay, n8n e o site de pedidos |

---

## 8. Pendências e pontos de atenção

Em ordem de importância.

1. **E-mail de administrador escrito no código.** Um endereço de e-mail
   específico é tratado como administrador em quatro telas
   (`routes/_app.tsx`, `routes/_app/admin.tsx`, `routes/_app/dashboard.tsx`,
   `components/mobile/BottomNav.tsx`), numa função do Supabase e em três
   migrações do banco. Os dados continuam protegidos pelas regras do banco,
   mas é frágil: é a chave-mestra pendurada com etiqueta na parede. A lista
   de administradores deveria vir só do banco (papel `super_admin`). Não foi
   alterado para não mudar quem acessa o quê sem a sua decisão.
2. **A entrada de pedidos (`/api/orders`) tem 1.100 linhas e quase nenhum
   teste próprio.** É a porta mais importante do sistema. Os testes novos
   cobrem a trava de pedido repetido; o restante merece testes antes de
   qualquer reforma.
3. **Impressão automática (PrintNode) não existe.** Hoje alguém precisa clicar
   para imprimir. Automatizar exige contratar o PrintNode (pago), instalar um
   programa no computador da loja e criar a integração do zero.
4. **Contraste do laranja.** Texto branco sobre o laranja da marca (botões)
   fica abaixo do recomendado para letra pequena. É o padrão visual da marca e
   foi mantido; para rótulos e links usei um laranja mais fechado.
5. **A arte do hambúrguer** da página inicial foi recortada da imagem de
   referência (972 px). Funciona, mas uma versão maior e sem texto ficaria
   mais nítida em telas grandes.
6. **O símbolo da marca é uma imagem**, não um desenho vetorial (o brilho 3D
   não se reproduz bem em vetor). O letreiro "FLY DELIVERY" e o ícone
   simplificado são vetoriais. Um vetor fiel do símbolo é trabalho para um
   designer.
7. **Fotos de tela na página inicial** mostram o painel no tema escuro antigo
   (sem logotipo). Continuam verdadeiras, mas vale refazê-las com o visual
   novo depois da publicação.
8. **Comentários do código** ainda dizem "FlyControl" em ~200 arquivos. Foi
   proposital (ver seção 2), mas quem ler o código precisa saber.
9. **Papéis de gerente e funcionário** não existem — só dono da loja,
   administrador da plataforma e o login separado do garçom. Criar papéis
   intermediários é um projeto à parte (banco, regras de acesso e telas).
10. **1 erro de tipagem e ~980 avisos de formatação** já existiam antes deste
    trabalho e continuam (nenhum foi introduzido por ele, fora 5 avisos de
    quebra de linha em arquivos que já tinham avisos).

---

## 9. Onde está cada peça nova

| Arquivo | Para quê |
|---|---|
| `src/lib/brand.ts` | Nome, slogan, cores e o aviso de transição — **mude o período do aviso aqui** |
| `src/components/brand/BrandLogo.tsx` | O logotipo, em todas as variações |
| `src/components/brand/BrandTransitionNotice.tsx` | A faixa "O FlyControl evoluiu" |
| `src/lib/navegacao.ts` | A lista do menu (computador e celular leem daqui) |
| `src/styles.css` | A paleta e os temas claro/escuro |
| `public/brand/` | Logotipo, símbolo, letreiro e ícone para usar fora do sistema (artes, e-mails, redes sociais) |
| `src/lib/orders/pedidoRepetido.ts` | A regra do pedido repetido |
| `src/lib/finance/metricas.ts` | As definições dos números do financeiro |
