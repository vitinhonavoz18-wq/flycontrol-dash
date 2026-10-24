# Diagnóstico — verificação de identidade por e-mail no FlyControl

> Fase 0 (somente leitura). Data: 2026-10-24.
> Nada foi alterado no Supabase, no n8n nem no código. Nenhuma chave, senha ou
> dado de cliente aparece aqui — só nomes de variáveis e contagens.

## Resumo em 30 segundos

- **Hoje o restaurante não tem como recuperar a senha.** A tela `/login` não
  tem "Esqueci minha senha". Só o portal de afiliados tem, e por link.
- **Hoje ninguém confirma o e-mail no cadastro.** O servidor cria a conta já
  marcada como "confirmada". É como o caderno de reservas aceitar qualquer
  telefone sem ligar para conferir: se o cliente digitar o e-mail errado, ele
  paga e depois não consegue recuperar a conta.
- **Troca de senha logado e troca de e-mail não existem** no painel do
  restaurante.
- **O Supabase já tem tudo o que precisamos** (códigos de 6 dígitos, validade,
  uso único, confirmação nos dois endereços). A recomendação é usar o que ele
  já faz e deixar o n8n só como carteiro. Não vamos criar tabela de códigos.
- **Pontos que dependem de você** estão na seção 6 e no final ("Decisões").

---

## 1. Stack encontrada

| Item | O que é |
|---|---|
| Framework | TanStack Start 1.168 + TanStack Router 1.170, React 19, Vite 7, Tailwind 4, componentes no estilo shadcn em `src/components/ui` |
| Onde roda | Cloudflare Worker (`wrangler.jsonc`, Nitro preset cloudflare). Deploy pelo GitHub Actions ao dar push na `main` |
| Código de servidor | `createServerFn` em arquivos `*.functions.ts` (28) e rotas HTTP em `src/routes/api/*`. Toda chamada de server function leva o token do usuário automaticamente (`src/start.ts` → `auth-attacher.ts`) |
| Autenticação | **Supabase Auth** (projeto `FLYCONTROL`, ref `knhenchgntttraaeewlj`, região São Paulo). `@supabase/supabase-js` resolvido para **2.110.7** no `bun.lock` |
| Cliente do navegador | `src/integrations/supabase/client.ts` — sessão no `localStorage`, `flowType` não configurado (padrão "implícito": tokens chegam no fim da URL) |
| Cliente administrativo | `src/integrations/supabase/client.server.ts` (`SUPABASE_SERVICE_ROLE_KEY`) — só em arquivos de servidor |
| Banco | Postgres 17, 130 tabelas em `public`, todas com RLS ligado. 155 migrations em `supabase/migrations/` |
| Testes | Vitest 4 + Testing Library + jsdom, 115 arquivos de teste. Mock global do Supabase em `src/test/setup.ts` |
| n8n | Instância própria no EasyPanel (`conectfly-n8n.lnuwza.easypanel.host`), sem projetos de equipe |

**Comandos** (rodar com `bun`, que é o que o CI usa):

| Para quê | Comando | Observação |
|---|---|---|
| Instalar | `bun install --frozen-lockfile` | `node_modules` não está instalado nesta sessão ainda |
| Lint | `bun run lint` | ESLint + Prettier |
| Typecheck | `bunx tsc --noEmit` | Não há script; o `tsconfig.json` já tem `noEmit` e `strict` |
| Testes | `bun run test` | `vitest run` |
| Build | `bun run build` | |

**CI** (`.github/workflows/`): `deploy.yml` só instala, faz build e publica —
**não roda lint, teste nem typecheck**. `migrations.yml` aplica migrations
automaticamente quando algo em `supabase/migrations/` chega na `main`.

**Variáveis de ambiente (só nomes).**

- Vão para o navegador (e podem, são públicas): `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Só servidor: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `CRM_N8N_SECRET`, `MARKETING_N8N_SECRET`,
  `FL_WEBHOOK_SECRET`, `BILLING_CRON_SECRET`, `SITECREATORFLY_*`,
  `INFINITYPAY_*`, `UAZAPI_*`, `SYNCPAY_*`, `WAITER_TOKEN_SECRET`,
  `FLYDELIVERY_RECONCILE_SECRET`, `PAYMENT_PROVIDER`, `FLYCONTROL_PUBLIC_URL`,
  `FLYSTATUS_MEDIA_HOSTS`, `SIGNUP_DEBUG_ERRORS`.
- **Vazamento para o navegador: nenhum encontrado.** Nenhum componente ou tela
  importa o cliente administrativo; o único `process.env` do lado do navegador
  lê só o par público. Vou confirmar com um build de verdade na Fase 2.
- **Esta tarefa não precisa de variável nova no FlyControl.** O segredo do hook
  fica só no Supabase e no n8n (ver seção 5).

---

## 2. Os fluxos hoje

Legenda: **Painel** = o FlyControl do restaurante (`/login`, `/settings`).
**Afiliado** = portal `/affiliates/*`.

| Fluxo | Já existe? | Como funciona hoje | O que falta |
|---|---|---|---|
| **1. Recuperação de senha — Painel** | **Não** | `/login` não tem o link. O próprio cadastro diz "Tente entrar ou recuperar a senha", mas não há onde recuperar | Tudo: link, tela do e-mail (resposta igual exista a conta ou não), tela do código, tela da nova senha, tela de sucesso |
| 1b. Recuperação — Afiliado | Sim, **por link** | `resetPasswordForEmail` → link no e-mail → `/affiliates/reset-password` → `updateUser({ password })`. Já responde igual exista a conta ou não | Trocar link por código. **Quando o hook do n8n for ligado, o e-mail só terá código — esta tela precisa migrar junto** |
| **2. Confirmação de e-mail no cadastro — Painel** | **Não** | O servidor cria a conta com `auth.admin.createUser({ email_confirm: true })` (`src/lib/signup/signup.functions.ts:391`). A conta já nasce confirmada; em seguida o navegador entra sozinho com a senha. O comentário no código explica: "sem fluxo de e-mail configurado, exigir confirmação deixaria o usuário sem conseguir entrar depois de pagar" | Criar a conta **não confirmada**, mandar o código, tela de código **antes** de liberar o pagamento/teste, estado claro para quem tenta entrar sem confirmar, botão de reenviar. **Também falta anti-enumeração**: hoje o cadastro responde "Já existe uma conta com este e-mail" |
| 2b. Cadastro — Afiliado | Mesmo modelo | `admin.createUser({ email_confirm: true })` em `src/lib/afiliados/cadastro.functions.ts:132` | Mesma mudança (se você quiser incluir afiliados — ver Decisões) |
| 2c. Cadastro com Google | Sim | O Google já confirmou o e-mail | **Nada.** Fica como está |
| **3. Troca de senha logado — Painel** | **Não** | `/settings` não tem seção de segurança | Seção "Segurança" com reautenticação (código no e-mail) + nova senha + registro do evento |
| 3b. Troca de senha — Afiliado | Sim, parcial | Confere a senha atual entrando de novo (`signInWithPassword`) e chama `updateUser({ password })`. Sem código, sem registro | Passar a usar o mesmo componente do Painel |
| **4. Troca de e-mail** | **Não existe em lugar nenhum** | — | Tela, reautenticação, códigos nos dois endereços, aviso de segurança |
| Login | Sim | `signInWithPassword` e Google. Erros do Supabase aparecem **em inglês** no `/login` | Tratar "e-mail não confirmado" com mensagem clara e botão de reenviar |
| Logout | Sim | `signOut()` | Nada (só teste de regressão) |
| Proteção das telas | Sim | No navegador (`useEffect` no layout `_app`). Os dados de verdade são protegidos pelo banco (RLS) e pelo servidor (confere o token com `getClaims`) | Nada para esta tarefa |
| Garçons | Sim, login próprio | Usuário + senha guardada com PBKDF2, fora do Supabase Auth | **Não é afetado** por nada desta tarefa |

**Números do banco (sem dados pessoais):** 32 contas; 31 foram "confirmadas" no
mesmo segundo em que foram criadas (prova de que ninguém confirma de verdade);
1 conta antiga (julho) nunca confirmada, nunca entrou e não tem loja; nenhuma
recuperação de senha pedida até hoje; nenhuma troca de e-mail pendente.

---

## 3. O que pode ser reaproveitado

| O quê | Onde | Como usar |
|---|---|---|
| Regra de senha (mín. 8, letra + número) | `src/lib/signup/validation.ts` (`validatePassword`, `validatePasswordConfirmation`) | Mesma regra em todas as telas novas |
| Visual da tela de login (cartão, logo, tokens de cor) | `src/routes/login.tsx`, `src/styles.css` | Telas de recuperação e código seguem o mesmo cartão |
| `PasswordInput` (campo com olho) | `src/components/ui/password-input.tsx` | Telas de nova senha |
| Padrão de seção em Configurações | `src/routes/_app/settings.tsx` (cartões `rounded-xl border ... p-5`) | Nova seção "Segurança" |
| Lógica de recuperação e troca de senha do afiliado | `affiliates.login.tsx`, `affiliates.reset-password.tsx`, `affiliates.dashboard.settings.tsx` | Vira um componente compartilhado — sem duplicar telas |
| Mensagem genérica anti-enumeração | `affiliates.login.tsx` ("Se existir uma conta com...") | Mesmo texto no Painel |
| Avisos (toasts) | `sonner`, já montado em `__root.tsx` | Mensagens de sucesso/erro |
| Limite de cadastros por endereço de internet | `signup_attempts` + `checkAndRecordSignupAttempt` | Continua valendo |
| Padrão de assinatura HMAC com horário | `src/lib/webhookSignature.ts`, `src/lib/flydelivery/pagamentos/webhook.ts` | Referência; o hook do Supabase usa o padrão "Standard Webhooks", parecido |
| Testes com mock do Supabase | `src/test/setup.ts`, `MenuImportDialog.test.tsx` | Modelo para os testes novos |
| **Recursos nativos do Supabase** | — | Códigos, validade, uso único, reenvio com intervalo, confirmação nos dois e-mails, avisos de "senha alterada" e "e-mail alterado" |

**Não existe:** componente de código (OTP) — vou criar um pequeno, sem
biblioteca nova; tabela de eventos de segurança de conta.

---

## 4. Riscos encontrados

Explicados com exemplo, do mais importante para o menos.

**R1 — Se o n8n cair, cadastro e recuperação param.**
Quando o hook de e-mail do Supabase for ligado, **todo** e-mail de
autenticação passa pelo n8n — o Supabase deixa de usar o envio próprio dele.
Se o n8n estiver fora do ar, quem tentar se cadastrar com senha, recuperar a
senha, trocar o e-mail ou trocar a senha recebe erro. É como o motoboy único
da loja ficar doente: os pedidos continuam chegando, mas nenhum sai.
- Continua funcionando: login, logout, entrar com Google, uso normal do painel.
- Hoje o n8n é uma instância única no EasyPanel (não há reserva).
- "Plano B" em caso de pane: desligar o hook no painel do Supabase (1 clique).
  Mas o envio padrão do Supabase **só entrega para e-mails da própria equipe do
  projeto e em quantidade mínima** — ou seja, na prática o plano B só funciona
  se configurarmos um SMTP reserva (serviço de e-mail transacional; existem
  planos gratuitos). Decisão de custo sua — ver Decisões.
- Mitigação sem custo: alerta de "n8n fora do ar" (monitor de disponibilidade)
  e o workflow responder rápido.

**R2 — O acesso ao Gmail pode "vencer" a cada 7 dias.**
Se o app do Google Cloud usado na conexão OAuth do Gmail ficar no modo
"Teste", o Google derruba a autorização a cada 7 dias e os e-mails param sem
aviso. É como a senha do estacionamento que vale só uma semana. Precisa
publicar o app ("Em produção") no Google Cloud (passo a passo na seção 6).

**R3 — O Gmail tem limite diário.**
Conta Gmail comum envia cerca de 500 e-mails por dia (Google Workspace, cerca
de 2.000). Hoje são 32 contas, sobra muito. Mas alguém mal-intencionado
poderia pedir "esqueci minha senha" sem parar para esgotar a cota. Os limites
de envio do Supabase (por hora e 60 s entre e-mails para a mesma pessoa)
seguram isso — precisam ser configurados (seção 6).

**R4 — O Supabase não bloqueia um código depois de N erros.**
O limite nativo de tentativas é **por endereço de internet** (cerca de 30
tentativas a cada 5 minutos), não "por código". Com 1 milhão de combinações e
validade de 10 minutos, adivinhar exigiria milhares de endereços diferentes —
risco baixo, mas não é exatamente a regra "limite de tentativas incorretas
por código" que você pediu. Opções para fechar mais: CAPTCHA invisível do
Cloudflare (Turnstile), que o Supabase aceita nativamente. **Criar códigos
próprios só por isso traria mais risco do que resolve** (ver seção 5).

**R5 — A recuperação abre uma sessão antes da senha nova.**
No Supabase, quando o código de recuperação é aceito, a pessoa já fica
"logada"; a senha nova vem no passo seguinte. Se alguém fechar a aba nesse
meio, fica logado sem ter trocado a senha. Mitigação: a tela leva direto para
a nova senha, o painel não abre enquanto a troca não for concluída e, se a
pessoa desistir, a sessão é encerrada. A Fase 2 documenta e testa isso.

**R6 — "Troca de senha segura" do Supabase só exige código se o login tiver
mais de 24 horas.** (A confirmar na Fase 4, depois de instalar as
dependências.) O painel sempre vai pedir o código, mas quem chamar a API
direto com uma sessão recente consegue trocar sem código. Proteção extra: o
e-mail automático "sua senha foi alterada" chega ao dono da conta na hora.

**R7 — Ligar o hook troca todos os e-mails de uma vez.**
Inclui o link de recuperação do afiliado. Por isso o hook só deve ser ligado
**depois** que todas as telas novas estiverem prontas (Fase 6), nunca antes.

**R8 — O cadastro hoje revela quem é cliente.**
Digitar um e-mail no cadastro e ver "Já existe uma conta com este e-mail"
confirma para qualquer pessoa que aquele e-mail usa o FlyControl. É como o
porteiro responder "o seu Fulano mora no 302, sim". A Fase 3 troca por uma
resposta única.

**R9 — Cliente que digita o e-mail errado paga e fica sem acesso.**
Hoje o pagamento acontece logo depois do cadastro, sem conferir o e-mail. Com
a confirmação **antes** do pagamento, isso deixa de acontecer.

**R10 — Não há ambiente de teste do Supabase.**
Nenhuma "branch" de desenvolvimento no Supabase, `supabase/config.toml` só tem
o ID do projeto, e o Docker desta sessão está parado. As configurações de Auth
(confirmação, validade do código, hook) **só podem ser mudadas no painel do
Supabase** — a ferramenta que eu tenho (MCP) lê o banco, mas não mexe nessas
configurações. Ver Decisões.

**R11 — Verificar a assinatura no n8n tem um detalhe técnico.**
O Supabase assina com uma chave em formato base64; o nó "Crypto" do n8n trata a
chave como texto. Solução prevista: gerar um segredo só com letras e números,
de modo que as duas leituras deem a mesma chave, e guardá-lo numa credencial
do tipo "Crypto" do n8n (nunca solto dentro do workflow). Nenhum workflow atual
do n8n verifica assinatura — é um padrão novo. Vou provar com teste na Fase 1
antes de seguir; se não funcionar, a alternativa é uma Edge Function do
Supabase fazer a conferência e repassar ao n8n.

**R12 — O n8n guarda o conteúdo das execuções.**
Por padrão, cada execução fica salva com o que chegou — inclusive o código. O
workflow novo terá o salvamento desligado para execuções com sucesso **e com
erro**, e o ramo de erro não repete o conteúdo.

**R13 — O hook tem 5 segundos no total.**
Se o n8n demorar mais, o Supabase desiste e o usuário vê erro. O envio pelo
Gmail costuma levar 1–2 s; o workflow será enxuto.

**Fora do escopo, mas vale saber:**
- Proteção contra senhas vazadas desligada no Supabase (já apontado na
  auditoria de 22/10, SEC-19). Proponho ligar junto, no Portão 2.
- **Duas migrations com o mesmo número** (`20261022120000_…`). O CI aplica
  migrations sozinho na `main`; números repetidos podem travar a próxima
  aplicação. Qualquer migration desta tarefa usará um número novo e único.
- O CI não roda testes. Uma quebra só aparece em produção.

---

## 5. Decisão de arquitetura: **nativo do Supabase**

**Decisão:** usar os códigos nativos do Supabase Auth. O FlyControl chama as
funções oficiais; o Supabase gera, guarda, expira e confere os códigos; o n8n
só entrega o e-mail.

```
Usuário ──(pede código)──▶ Supabase Auth ──(hook assinado)──▶ n8n ──(Gmail OAuth2)──▶ e-mail do usuário
Usuário ──(digita código)──▶ Supabase Auth  (confere, expira, uso único)
```

Por quê, com exemplo: é como usar o cofre que veio do banco em vez de mandar
fazer um cofre na serralheria da esquina. O cofre do banco já foi testado por
milhares de clientes; o nosso teria de provar sozinho que não abre com um
grampo.

| Necessidade | Recurso nativo |
|---|---|
| Código de 6 dígitos | `{{ .Token }}` / campo `token` do hook ("Email OTP Length" = 6) |
| Validade de 10 min | "Email OTP Expiration" = 600 s |
| Uso único e código novo invalida o anterior | Comportamento do Supabase |
| Reenvio com intervalo mínimo | Limite de 60 s entre e-mails para o mesmo usuário |
| Recuperação | `resetPasswordForEmail` → `verifyOtp({ type: 'recovery' })` → `updateUser({ password })` |
| Confirmação de cadastro | `verifyOtp({ type: 'signup' })`; reenvio com `resend({ type: 'signup' })` |
| Troca de senha logado | `reauthenticate()` → `updateUser({ password, nonce })` com "Secure password change" |
| Troca de e-mail | `updateUser({ email })` com "Secure email change" → `verifyOtp({ type: 'email_change' })` nos dois endereços |
| Aviso "senha alterada" / "e-mail alterado" | Tipos `password_changed_notification` e `email_changed_notification` do próprio hook |
| Assinatura do pedido ao n8n | Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`) |

Os valores exatos de `type` serão conferidos nos tipos da versão instalada
(2.110.7) assim que as dependências forem instaladas, no início da Fase 2.

**Única peça própria proposta:** uma tabelinha de **eventos de segurança da
conta** (ex.: "senha alterada", "e-mail alterado"), preenchida por um gatilho
do próprio banco quando o Supabase grava a mudança. Motivo: o registro nativo
do Supabase hoje vai para os logs da plataforma (a tabela
`auth.audit_log_entries` está vazia) e esses logs somem em poucos dias. O
gatilho não guarda senha nem código — só "quem, o quê, quando". Como mexe no
banco, só aplico depois do Portão 2.

**Por que não criar códigos próprios:** obrigaria a guardar hash, comparar em
tempo constante, consumir de forma atômica, controlar tentativas e expiração —
cada item é um lugar novo para errar, e um erro ali vira sequestro de conta. O
único ganho seria o bloqueio "por código" (R4), que dá para aproximar com
CAPTCHA sem tocar em identidade.

### Como o cadastro vai funcionar (detalhe importante)

Como o cadastro do Painel é feito pelo servidor (para criar loja, plano e teste
grátis de uma vez), o interruptor "Confirm email" do Supabase sozinho não
resolve. O plano:
1. O servidor cria a conta **não confirmada** (`email_confirm: false`).
2. O servidor pede ao Supabase o código de confirmação (`resend` tipo
   `signup`), que sai pelo n8n.
3. A tela pede o código; o Supabase confere.
4. Só então o navegador entra e segue para o pagamento ou o teste grátis.
5. Quem fechar a aba e tentar entrar depois vê "Confirme seu e-mail" e o botão
   de reenviar. O próprio Supabase barra o login de quem não confirmou.

Se o passo 2 não funcionar com contas criadas pelo servidor (a confirmar na
Fase 3), a alternativa é o cadastro passar a usar `signUp()` do navegador.

---

## 6. Configurações externas que faltam

Nada disso foi feito. Cada item diz onde fazer. Os itens do Supabase ficam
para o Portão 2 e o hook só no Portão 3/Fase 6.

### Supabase — painel do projeto FLYCONTROL (supabase.com/dashboard)

| # | Onde | O quê | Quando |
|---|---|---|---|
| S1 | Authentication → Sign In / Providers → Email | "Confirm email" **ligado** | Fase 6 |
| S2 | Mesmo lugar | "Secure email change" **ligado** | Fase 6 |
| S3 | Mesmo lugar | "Secure password change" **ligado** | Fase 6 |
| S4 | Mesmo lugar | "Email OTP Expiration" = **600** segundos | Fase 6 |
| S5 | Mesmo lugar | "Email OTP Length" = **6** | Fase 6 |
| S6 | Mesmo lugar (ou Attack Protection) | "Prevent use of leaked passwords" ligado; tamanho mínimo 8, com letras e números | Portão 2 |
| S7 | Authentication → Rate Limits | E-mails por hora (sugestão: 30), verificações de código (manter 30 a cada 5 min), intervalo entre e-mails ao mesmo usuário 60 s | Fase 6 |
| S8 | Authentication → Emails → Security notifications | Ligar "Password changed" e "Email address changed" | Fase 6 |
| S9 | Authentication → Hooks → Send Email (HTTP) | URL do webhook do n8n + "Generate secret" (formato `v1,whsec_…`) | **Fase 6, depois dos Portões 2, 3 e 4** |

Rollback de cada um: voltar o interruptor/valor no mesmo lugar. Para o hook:
desligar o hook em Authentication → Hooks.

### Google Cloud + n8n — conta Gmail remetente

| # | Onde | O quê |
|---|---|---|
| G1 | console.cloud.google.com → APIs & Services → Library | Ativar "Gmail API" num projeto do Google Cloud |
| G2 | APIs & Services → OAuth consent screen | Tipo "External", e **publicar ("In production")** — evita o vencimento a cada 7 dias (R2) |
| G3 | APIs & Services → Credentials → Create OAuth client ID (Web) | Colar a "OAuth Redirect URL" que o n8n mostra ao criar a credencial |
| G4 | n8n → Credentials → New → "Gmail OAuth2 API" | Colar Client ID e Client Secret, clicar "Sign in with Google" com a **conta remetente**. Nome sugerido: `Gmail FlyControl (remetente)` |
| G5 | n8n → Credentials → New → "Crypto" | Guardar o segredo do hook (gerado na Fase 1, seguindo R11). Nome sugerido: `FlyControl - segredo do hook de e-mail` |

**Hoje não existe credencial Gmail no n8n** (há OpenAI, Redis, Postgres, Google
Calendar, cabeçalhos HTTP e uma "Crypto" da Meta — nenhuma será reutilizada).

### Cloudflare / GitHub

Nenhuma variável nova prevista.

---

## 7. Plano de fases ajustado

| Fase | O que entra | Precisa de você? |
|---|---|---|
| **1. Workflow do n8n (inativo)** | Webhook → confere assinatura e horário → só tipos conhecidos (`signup`, `recovery`, `email_change`, `reauthentication`, `password_changed_notification`, `email_changed_notification`) → monta HTML + texto → Gmail → responde JSON com o código HTTP certo; ramo de erro sem dados; salvamento de execuções desligado. Primeiro um teste curto provando a conferência da assinatura (R11). Validação e teste com dados fictícios, **sem enviar e-mail** | Credenciais G1–G5 para o teste real (antes disso, testo com dados fictícios) |
| **2. Recuperação de senha** | Link no `/login`; telas e-mail → código → nova senha → sucesso; componente de código reutilizável; migrar o afiliado para o mesmo componente; tratar sessão aberta pela recuperação (R5); encerrar as outras sessões depois da troca e documentar | Não |
| **3. Confirmação no cadastro** | Conta criada não confirmada; código antes do pagamento/teste; resposta única (R8); estado "confirme seu e-mail" no login com reenviar; mensagens em português no `/login` | Decisões 3 e 4 abaixo |
| **4. Troca de senha logado** | Seção "Segurança" em `/settings`; código por e-mail (`reauthenticate`) + nova senha; afiliado reaproveita; tabela de eventos + gatilho (migration) | Portão 2 para a migration |
| **5. Troca de e-mail** | Mesma seção; reautenticação; códigos no endereço antigo e no novo; e-mail antigo vale até confirmar; tratar e-mail já em uso, código vencido e pedidos repetidos; aviso de segurança | Não |
| **6. Homologação** | Configurações S1–S9 em ambiente de teste, workflow ativo, cada fluxo de verdade com o e-mail de teste | Portões 2, 3 e 4 |

**Testes:** Vitest (já existente). Testo a nossa integração com o Supabase
(chamadas certas, telas, mensagens, nada sensível no console), não as garantias
do próprio Supabase. O n8n é testado com dados fictícios (assinatura válida,
inválida, horário antigo, tipo proibido, falha do Gmail).

**Ordem de ligar em produção (fora do escopo, só para registro):** publicar o
código das Fases 2–5 → ativar o workflow → ligar S1–S8 → ligar o hook (S9) →
testar com o e-mail de teste. Nunca ligar o hook antes do código estar no ar
(R7).

---

## Decisões que preciso de você (Portão 1)

1. **Dados que vieram em branco.** O pedido chegou com `{{EMAIL_DE_TESTE}}` e
   `{{GMAIL_REMETENTE}}` sem preencher. Preciso dos dois antes da Fase 1 ter
   teste real.
2. **Branch.** Esta sessão foi aberta para trabalhar na branch
   `claude/awesome-cray-cepqyp`, e só posso enviar para ela sem sua permissão
   explícita. Sigo nela, ou você autoriza criar e enviar para
   `feat/verificacao-email`?
3. **Ambiente de teste do Supabase (R10).** Opções:
   a) **Branch de desenvolvimento do Supabase** — isolada e com painel próprio
      para testar as configurações de Auth; tem custo por hora enquanto
      existir (exige plano pago) e eu apago ao final;
   b) **projeto Supabase separado de testes** — mesmo isolamento, você cria no
      painel;
   c) **testar no projeto de produção** só na janela da Fase 6, com o e-mail de
      teste e rollback imediato — mais barato, mas mexe no que os clientes
      usam.
   Recomendo **a** ou **b**.
4. **Confirmação antes do pagamento?** Recomendo pedir o código **antes** de
   mandar para o pagamento/teste grátis (R9). Efeito colateral: se o n8n estiver
   fora do ar, o cadastro com senha para nesse ponto (o com Google não).
5. **Incluir afiliados** na confirmação de cadastro e nas telas novas? Recomendo
   sim — é o mesmo login.
6. **SMTP reserva (R1)?** Um serviço de e-mail transacional como reserva para o
   dia em que o n8n cair. Tem plano gratuito, mas é mais uma conta para manter.
   Posso deixar documentado e você decide depois.
7. **CAPTCHA (R4)?** Turnstile do Cloudflare nas telas de código e "esqueci a
   senha". Recomendo deixar para depois da Fase 6, como reforço.
