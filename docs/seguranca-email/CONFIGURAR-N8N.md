# Como ligar as credenciais do fluxo de e-mail no n8n

> Leva uns 20 minutos. Você não precisa mexer em nenhum nó além dos dois
> indicados. **Não ative o workflow** no final — isso fica para a homologação.

Workflows envolvidos (no seu n8n, em "Overview"):

- `FLYCONTROL - SEGURANÇA - ENVIO DE CÓDIGO POR E-MAIL` — o fluxo principal.
- `FLYCONTROL - SEGURANÇA - GERAR SEGREDO DO HOOK (usar 1 vez)` — o ajudante.

---

## Parte 1 — O segredo da assinatura (5 min)

É a "senha combinada" entre o Supabase e o n8n. Funciona como o código que o
motoboy fala na portaria: se não bater, o pedido não entra.

1. Abra o workflow **FLYCONTROL - SEGURANÇA - GERAR SEGREDO DO HOOK (usar 1 vez)**.
2. Clique em **Execute workflow** (botão laranja embaixo).
3. Clique no último nó, **Mostrar os dois formatos**. Aparecem dois valores:
   - `para_o_n8n` (64 letras e números);
   - `para_o_supabase` (começa com `v1,whsec_`).
4. Copie os dois para um lugar seguro e temporário (o gerenciador de senhas do
   navegador, por exemplo). **Não mande por WhatsApp nem e-mail.**
5. No menu da esquerda do n8n, vá em **Credentials** → **Add credential** →
   procure **Crypto** → **Continue**.
6. Dê o nome `FlyControl - segredo do hook de e-mail`.
7. No campo **Secret**, cole o valor `para_o_n8n`. Clique em **Save**.

> Rodou o ajudante de novo? Ele gera um segredo **novo**. Aí precisa trocar nos
> dois lugares (n8n e Supabase), senão os e-mails param.

## Parte 2 — O Gmail que vai enviar (15 min)

### 2.1 No Google Cloud (só uma vez)

1. Entre em <https://console.cloud.google.com> **com a conta Gmail remetente**.
2. No topo, clique no seletor de projeto → **New project** → nome
   `FlyControl Emails` → **Create**.
3. Menu ☰ → **APIs & Services** → **Library** → procure **Gmail API** →
   **Enable**.
4. Menu ☰ → **APIs & Services** → **OAuth consent screen**:
   - Tipo **External** → **Create**.
   - Nome do app: `FlyControl`. E-mail de suporte: a conta remetente.
   - Avance até o fim e salve.
   - **Importante:** volte nessa tela e clique em **Publish app** → **Confirm**.
     Se ficar em "Testing", o Google desliga o acesso a cada 7 dias e os
     e-mails param sem aviso.
5. Menu ☰ → **APIs & Services** → **Credentials** → **Create credentials** →
   **OAuth client ID**:
   - Tipo: **Web application**. Nome: `n8n`.
   - Em **Authorized redirect URIs**, clique em **Add URI** e cole:
     `https://conectfly-n8n.lnuwza.easypanel.host/rest/oauth2-credential/callback`
     (é o mesmo endereço que o n8n mostra como "OAuth Redirect URL" no passo
     2.2 — se for diferente, use o que o n8n mostrar).
   - **Create**. Copie o **Client ID** e o **Client secret**.

### 2.2 No n8n

1. **Credentials** → **Add credential** → procure **Gmail OAuth2 API** →
   **Continue**.
2. Nome: `Gmail FlyControl (remetente)`.
3. Cole o **Client ID** e o **Client Secret**.
4. Clique em **Sign in with Google** e entre **com a conta remetente**. O Google
   pode avisar "app não verificado": clique em **Avançado** → **Acessar
   FlyControl (não seguro)**. É o seu próprio app; o aviso aparece porque ele
   não passou pela verificação do Google, que só é exigida para apps públicos.
5. Deve aparecer "Account connected". **Save**.

> O nome que o cliente vê como remetente é o **nome da conta Google**. Para
> aparecer "FlyControl", ajuste o nome em <https://myaccount.google.com> →
> Informações pessoais → Nome.

## Parte 3 — Trocar as credenciais no fluxo (2 min)

Abra **FLYCONTROL - SEGURANÇA - ENVIO DE CÓDIGO POR E-MAIL**.

1. Dê dois cliques no nó **Calcular assinatura (HMAC)** (dentro do grupo
   "Conferência da assinatura").
   - Em **Credential to connect with**, ele pode estar mostrando
     **Meta App Secret (Crypto)** — o n8n escolheu sozinho porque era a única
     credencial desse tipo. **Troque** para `FlyControl - segredo do hook de e-mail`.
   - (Enquanto estiver com a da Meta, nada é enviado: a assinatura nunca bate.)
2. Dê dois cliques no nó **Enviar pelo Gmail** (grupo "Montagem e envio").
   - Em **Credential for Gmail OAuth2 API**, escolha `Gmail FlyControl (remetente)`.
3. Clique em **Save** (canto superior direito).
4. **Não clique em "Active"/"Publish".** O fluxo continua desligado até a
   homologação.

## Parte 4 — Me avise

Mande uma mensagem dizendo "credenciais prontas". **Não mande os valores dos
segredos** — eu não preciso deles.

O valor `para_o_supabase` só será usado na homologação (Fase 6), em
Supabase → Authentication → Hooks → Send Email.
