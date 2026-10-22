# Como fazer uma cópia completa do banco do FlyControl no seu computador

> Escrito para quem não é programador. Siga na ordem. Tempo estimado: 40
> minutos na primeira vez (a maior parte é instalar programas), 5 minutos nas
> próximas.
>
> **Por que fazer isso agora:** o Supabase do FlyControl está no plano
> gratuito, e o plano gratuito **não guarda backup automático** que você possa
> baixar ou restaurar. A própria documentação do Supabase recomenda, para esse
> plano, exportar o banco com o comando `supabase db dump` e guardar a cópia
> fora do Supabase.

---

## Antes de começar: as regras de ouro

1. **A senha do banco nunca vai para o chat, e-mail, WhatsApp ou GitHub.**
   Você só digita a senha no terminal do seu computador, quando ele pedir —
   e ela nem aparece na tela enquanto você digita.
2. **O arquivo de backup é tão sensível quanto a senha.** Ele tem nome,
   telefone e endereço de clientes, as conversas de WhatsApp das lojas, as
   chaves de integração das lojas e os logins da plataforma. Trate como o
   cofre da loja (veja a parte 5).
3. **Nunca salve o backup dentro da pasta do projeto `flycontrol-dash`.**
   Uma pasta de projeto vai para o GitHub; o backup nunca pode ir.
4. **Neste passo a passo só existem comandos de LEITURA.** Se algum dia
   alguém pedir para você rodar `db push`, `db reset` ou `restore` nesta
   pasta de backup, pare e pergunte antes.

---

## Parte 1 — O que você precisa ter

| Programa | Para quê | Onde baixar |
| --- | --- | --- |
| **Docker Desktop** | O programa do Supabase usa o Docker por baixo para gerar a cópia no formato certo | docker.com/products/docker-desktop |
| **Node.js (versão LTS)** | Para rodar o programa do Supabase e o conferente do backup | nodejs.org |
| **7-Zip** (Windows) ou **Keka** (Mac) | Para trancar o backup com senha forte | 7-zip.org / keka.io |

**Espaço livre necessário:** uns **6 GB** no total.

- Docker Desktop + a imagem do banco que ele baixa: 3 a 5 GB (fica instalado).
- Os arquivos de backup: **entre 20 e 80 MB** (o banco tem 52 MB hoje).
- O backup trancado (compactado): **entre 5 e 20 MB**.

Depois de instalar o Docker Desktop, **abra o programa** e espere aparecer
"Docker Desktop is running" (ou a baleia parada, sem animação, no canto da
tela). Ele precisa ficar aberto durante a cópia.

### Ache a senha do banco antes de começar

É a senha criada junto com o projeto do Supabase (não é a senha do seu login
no site do Supabase). Ela costuma estar no seu gerenciador de senhas.

> **Se você não tiver a senha:** NÃO a troque ainda. A mesma senha está
> guardada no GitHub (segredo `SUPABASE_DB_PASSWORD`, usado pelo robô de
> migrações). Se for preciso trocar, me avise antes: trocar a senha sem
> atualizar o GitHub quebra o robô.

---

## Parte 2 — Gerar a cópia

### Passo 1. Crie uma pasta para o backup

Fora da pasta do projeto. Sugestão de nome, com a data:

- **Windows:** `C:\Users\SEU-USUARIO\Documents\backup-flycontrol-2026-10-22`
- **Mac:** `Documentos/backup-flycontrol-2026-10-22`

### Passo 2. Abra o terminal dentro dessa pasta

- **Windows:** abra a pasta no Explorador de Arquivos, clique na barra de
  endereço, digite `powershell` e aperte Enter.
- **Mac:** clique com o botão direito na pasta → **Serviços** → **Novo
  Terminal na Pasta**.

A partir daqui, cada bloco cinza é um comando: copie, cole no terminal e
aperte Enter. Espere terminar antes de passar para o próximo.

### Passo 3. Entre na sua conta do Supabase

```
npx supabase@latest login
```

O navegador abre; confirme o acesso. No terminal deve aparecer
`You are now logged in`.

(Na primeira vez ele pergunta `Need to install the following packages ... Ok to proceed?` — digite `y` e Enter.)

### Passo 4. Prepare a pasta

```
npx supabase@latest init
```

Se ele perguntar sobre "VS Code settings" ou "Deno", responda `N`. Isso só cria
uma subpasta `supabase` com um arquivo de configuração — nada vai para a
internet.

### Passo 5. Ligue a pasta ao projeto do FlyControl

```
npx supabase@latest link --project-ref knhenchgntttraaeewlj
```

Quando aparecer `Enter your database password`, **digite a senha do banco**
(ela não aparece enquanto você digita — é normal) e aperte Enter.

Deve terminar com `Finished supabase link`.

> Confira o código `knhenchgntttraaeewlj`: é o do FlyControl. O do
> SiteCreatorFly é outro. Fazer a cópia do projeto errado não estraga nada,
> mas não serve de backup do FlyControl.

### Passo 6. Gere os três arquivos

Rode **um de cada vez**:

```
npx supabase@latest db dump -f roles.sql --role-only
```

```
npx supabase@latest db dump -f schema.sql
```

```
npx supabase@latest db dump -f data.sql --use-copy --data-only
```

Cada um leva de alguns segundos a poucos minutos. Ao final de cada um deve
aparecer `Dumped schema to ...` ou `Dumped data to ...`.

| Arquivo | O que tem dentro | Tamanho esperado |
| --- | --- | --- |
| `roles.sql` | Os "crachás" (papéis) do banco, sem senha | poucos KB |
| `schema.sql` | A planta do banco: tabelas, regras de acesso, funções, gatilhos | 1 a 5 MB |
| `data.sql` | Os dados: lojas, pedidos, cardápios, clientes, conversas, logins | 20 a 70 MB |

### Passo 7. Desligue a pasta do projeto

```
npx supabase@latest unlink
```

```
npx supabase@latest logout
```

Isso apaga do computador a ligação com o projeto e a sessão do Supabase. O
backup continua na pasta.

---

## Parte 3 — Conferir se o backup ficou completo

Um backup que nunca foi conferido é como um extintor que nunca foi
inspecionado: você só descobre que está vazio no dia do incêndio.

### Conferência automática

Precisa do arquivo `scripts/conferir-backup.mjs` do projeto. Se você tem o
projeto `flycontrol-dash` no computador, ele já está lá. Se não, baixe pelo
GitHub (abra o arquivo no site → botão **Download raw file**) e salve dentro
da pasta do backup.

Ainda no terminal da pasta do backup:

- **Se salvou o conferente dentro da pasta do backup:**

  ```
  node conferir-backup.mjs .
  ```

- **Se está usando o do projeto:** troque o caminho pelo da sua pasta do projeto:

  ```
  node CAMINHO-DO-PROJETO/flycontrol-dash/scripts/conferir-backup.mjs .
  ```

Ele **só lê** os arquivos, não usa internet e não mostra nenhum dado de
cliente — só contagens. Ele confere quatro coisas:

1. os três arquivos existem e não estão vazios;
2. a planta do banco tem as tabelas, funções e regras principais (mais de
   100 tabelas);
3. cada uma das 20 tabelas do gabarito tem **pelo menos** o número de linhas
   que tinha em 22/10/2026 (o gabarito está em
   `docs/backup/FOTOGRAFIA-ANTES-DA-TRANCA-2026-10-22.md`). Pedidos e
   mensagens podem ter mais, porque o sistema continua funcionando;
4. a impressão digital (SHA-256) de cada arquivo.

**Resultado esperado:** a última linha diz `BACKUP CONFERIDO`.

Se aparecer `PROBLEMA(S)` ou `INCOMPLETO`, **não use esse backup**. Apague os
três arquivos e repita a Parte 2. Se der erro de novo, me mande **só a
mensagem de erro** (nunca o arquivo).

### Anote a impressão digital

Copie as três linhas da seção 4 do resultado (os códigos longos de letras e
números) para um arquivo de texto chamado `impressao-digital.txt`, **na mesma
pasta**. Se um dia alguém (ou um defeito no disco) alterar o backup, a
impressão digital muda e você percebe.

Para conferir de novo no futuro:

- **Windows:** `certutil -hashfile data.sql SHA256`
- **Mac:** `shasum -a 256 data.sql`

O código mostrado tem que ser igual ao anotado.

---

## Parte 4 — Como seria a restauração

### Para a trava de segurança: NÃO se restaura o banco inteiro

A trava de segurança não apaga nem altera nenhum dado: ela só muda **quem
pode usar** certas funções e relatórios. Se algo der errado depois de
aplicada, o caminho é o arquivo de reversão
`docs/REVERTER-NO-SUPABASE-tranca-funcoes-e-visoes.sql`. Ele roda em segundos
e devolve as permissões exatamente como estavam (testado: 0 diferenças em 30
itens).

O backup completo é a **rede de segurança para um desastre**, como alguém
apagar uma tabela por engano. Não é a ferramenta do dia a dia.

### Restauração completa (só em desastre, e sempre comigo junto)

Restaurar por cima do banco que está no ar **apaga o que entrou depois do
backup**. É como trocar o caderno de pedidos do dia pelo de ontem: os pedidos
de hoje somem. Por isso, a ordem é sempre esta:

1. **Restaurar primeiro num banco de teste**, nunca direto no de produção.
   - **Opção A:** um projeto novo no Supabase. No plano gratuito o limite é de
     2 projetos ativos, e você já tem 2 (FlyControl e SiteCreatorFly). Seria
     preciso pausar um ou contratar um plano pago.
   - **Opção B:** um Supabase local no seu computador, usando o Docker
     Desktop. Não custa nada. Eu te guio quando for preciso.
2. Carregar os três arquivos, nesta ordem, com o comando da documentação
   oficial do Supabase:

   ```
   psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command "SET session_replication_role = replica" --file data.sql --dbname "ENDEREÇO-DO-BANCO-DE-TESTE"
   ```

   - `--single-transaction`: ou entra tudo, ou não entra nada.
   - `session_replication_role = replica`: desliga os gatilhos durante a
     carga, para nada ser processado duas vezes (por exemplo, recalcular
     comandas ou mandar aviso).
3. Conferir o banco de teste: as mesmas contagens do gabarito, login de um
   lojista de teste e abertura do painel.
4. Só então decidir, com você, se o banco restaurado vira o oficial. Isso
   exige trocar os endereços e as chaves do Supabase na Cloudflare e no
   GitHub, e todos os usuários precisarão entrar de novo.

### O que o backup do banco NÃO traz

Isto precisa ser refeito à parte numa restauração completa:

| Item | Onde fica | Observação |
| --- | --- | --- |
| Fotos do cardápio e artes de status | Storage do Supabase (~268 MB) | A trava não mexe nelas. Backup opcional à parte |
| Funções na nuvem (`admin-*`, `public-tables`, etc.) | Código no GitHub | As de **Mercado Pago e FlyDelivery** publicadas no Supabase não estão neste repositório |
| Segredos das funções na nuvem | Painel do Supabase → Edge Functions → Secrets | Não vão no backup, de propósito |
| Configurações de login (Google, e-mails) | Painel do Supabase → Authentication | Anotar à parte |
| Tarefas agendadas do banco | O backup pode não incluir | Hoje são 4: `club-close-due-cycles`, `afiliados-liberar-comissoes`, `afiliados-repasses`, `mercadopago-manutencao` |

---

## Parte 5 — Como guardar com segurança

O backup contém **dados pessoais de clientes** (LGPD), **logins da
plataforma** e **chaves das integrações** das lojas (WhatsApp, pedidos,
pagamentos). Se vazar, é como perder o cofre e o caderno de clientes de
todas as lojas de uma vez.

### Trancar (obrigatório)

1. Selecione `roles.sql`, `schema.sql`, `data.sql` e `impressao-digital.txt`.
2. Compacte com senha:
   - **Windows / 7-Zip:** botão direito → 7-Zip → **Adicionar ao arquivo...**
     → formato **7z** → em **Criptografia**, escolha **AES-256**, digite uma
     senha forte e marque **Criptografar nomes de arquivo**.
   - **Mac / Keka:** formato **7z**, marque **Encrypt** e digite a senha.
   - **Não use** o "zip com senha" comum do Windows ou do Mac: a proteção
     dele é fraca.
3. Senha: no mínimo 16 caracteres, **diferente** da senha do banco, guardada
   no seu gerenciador de senhas — nunca num papel junto do backup nem num
   arquivo na mesma pasta.
4. Abra o arquivo trancado uma vez para testar se a senha funciona.
5. Só depois, apague os `.sql` soltos e **esvazie a lixeira**.

### Onde guardar

- **Duas cópias trancadas** em lugares diferentes. Por exemplo: o
  computador + um pendrive ou HD externo guardado em lugar seguro. Também
  pode ser um serviço de nuvem, **desde que o arquivo já esteja trancado**.

**Nunca:**
- no GitHub (nem em repositório privado);
- no WhatsApp, no e-mail ou no chat — **inclusive comigo**;
- numa pasta compartilhada com outras pessoas;
- solto (sem senha) em Drive, Dropbox ou OneDrive.

### Quanto tempo guardar

- Este backup: até a trava estar aplicada e conferida, mais **30 dias**.
  Depois disso, apague-o e fique só com o backup mais recente.
- A LGPD pede para não guardar dados pessoais além do necessário. Uma rotina
  sugerida: um backup por mês, mantendo os 3 últimos.

---

## Resumo em uma linha

Instale o Docker Desktop e o Node, rode os comandos da Parte 2 na pasta do
backup, confira com o `conferir-backup.mjs` até aparecer
`BACKUP CONFERIDO`, tranque com 7-Zip AES-256 e guarde duas cópias trancadas
fora do GitHub.
