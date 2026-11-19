# Cardápios no FlyDelivery: o que mudou e como publicar

> **Em uma frase:** os cardápios digitais saíram de `conectfly.com.br/<loja>`
> e passaram a ter endereço oficial **`cardapio.flydelivery.app/<loja>`**. O
> endereço antigo continua abrindo — leva o cliente para o novo, com QR Code
> de mesa e tudo. Nenhum dado foi movido: cada loja, produto e pedido continua
> exatamente onde estava.

Conferido no código e na Cloudflare em 19/11/2026.

---

## 1. Como o sistema era (inventário real)

| Peça | Onde mora o código | Onde roda | Endereço | Banco |
|---|---|---|---|---|
| **Painel do restaurante** (FlyDelivery) | `flycontrol-dash` | Cloudflare Worker `flycontrol-dash` | `flydelivery.app` (oficial) e `flycontrol.conectfly.com.br` (antigo, ainda recebe avisos de pagamento e pedidos) | Supabase `knhenchgntttraaeewlj` (segundo `supabase/config.toml`) |
| **Cardápios / site de pedidos** (SiteCreatorFly) | `conectfly` | Cloudflare Worker `conectfly` | `conectfly.com.br/<loja>` | Supabase `glyausrubnpkodgxosdj` (segundo `supabase/config.toml`; lojas, produtos, imagens) |
| **App FlyDelivery** (cliente final) | `Flydelivery` | Lojas de aplicativo (Expo) | links `flydelivery.app/loja/<loja>` | mesmo banco do painel |
| Site da empresa Connectfly + CRM | `conectfly.` (com ponto) | Worker `conectfly-site` | `site.conectfly.com.br` | Cloudflare D1 próprio |

**Não fazem parte dos cardápios** (ficaram como estão): `conectfly.` (é o site
da Connectfly, a empresa), e os demais Workers da conta (barbearia, loteria,
imobiliária, etc.).

**Já estava certo antes deste trabalho:** o painel já respondia em
`flydelivery.app` e mandava `www.` e `http://` para o endereço oficial.

**O que faltava:** os cardápios — a parte que o cliente final mais vê — ainda
tinham só o endereço da Connectfly, e o painel mostrava/imprimia esse endereço
para o lojista (link de divulgação, QR Code das mesas, PDF).

### Por que não juntamos os bancos de dados

Painel e cardápios usam **bancos separados que conversam pela internet**
(o painel cria a loja no SiteCreatorFly, o cardápio manda os pedidos para o
painel). Isso já é um sistema único para várias lojas ao mesmo tempo: cadastrar
um restaurante novo no painel cria o cardápio dele sozinho, sem deploy e sem
banco novo.

Juntar os dois bancos seria uma mudança enorme, com risco real de perder
pedidos, e **não resolve nenhum problema do cliente**. A troca que importa para
o produto é o endereço. Por isso: nenhum dado foi copiado, movido ou alterado.

---

## 2. Como ficou

| O que | Endereço oficial | Endereço antigo |
|---|---|---|
| Página de vendas e painel | `https://flydelivery.app` | `flycontrol.conectfly.com.br` continua funcionando (sem redirecionar — InfinityPay e SiteCreatorFly ainda avisam por lá) |
| Cardápio de cada loja | `https://cardapio.flydelivery.app/<loja>` | `conectfly.com.br/<loja>` → redireciona (301) para o novo, mantendo `?mode=table&table_token=...` |
| Link de campanha do app | `https://flydelivery.app/loja/<loja>` | — (antes dava "página não encontrada" sem o app; agora abre o cardápio da loja) |
| Raiz `cardapio.flydelivery.app/` | leva para `flydelivery.app` | — |
| API entre os sistemas (`/api/*`) | continua em `conectfly.com.br` (e também responde no endereço novo) | — |
| Editor interno do SiteCreatorFly | continua em `conectfly.com.br` | — |

**Por que um "cardapio." na frente** e não `flydelivery.app/<loja>`: em
`flydelivery.app` moram a página de vendas e o painel (`/login`, `/plans`,
`/dashboard`...). Uma loja chamada "login" disputaria o mesmo endereço com o
painel — é como duas lojas com o mesmo número na mesma rua. Com o subdomínio,
cada uma tem a sua porta.

### O que muda para cada pessoa

- **Cliente final:** nada de negativo. O cardápio é o mesmo (layout, fotos,
  cores, carrinho, mesa). Quem tem o link antigo ou o QR Code antigo da mesa
  chega no mesmo cardápio, só que com o endereço novo na barra.
- **Lojista:** no painel, o link para divulgar, o QR Code, o PDF de divulgação
  e o QR Code das mesas passam a sair com `cardapio.flydelivery.app`. Os QR
  Codes já impressos **não precisam ser trocados**.
- **Loja nova:** já nasce com o endereço `cardapio.flydelivery.app/<loja>`.

---

## 3. O que foi feito

### Na Cloudflare (já está no ar)

- Criado o endereço `cardapio.flydelivery.app`, ligado ao mesmo programa que
  serve os cardápios (Worker `conectfly`). Certificado HTTPS emitido.
  **Conferido em produção:** a mesma loja abre idêntica nos dois endereços,
  sem nenhum erro na página.

### No código dos cardápios (`conectfly`, ramo `claude/wonderful-curie-9dppb6`)

- `src/lib/site/publicDomain.ts` — o **único lugar** que define os endereços.
- `src/start.ts` — o redirecionamento do endereço antigo para o novo.
- Interruptor `MENU_LEGACY_REDIRECT` em `wrangler.jsonc` (`"true"` liga).
- Leitura do QR Code da mesa e caixa reconhecem o endereço novo.
- QR Code de mesa, endereço de sincronização e textos do editor saem do arquivo
  central, sem endereço escrito à mão.
- Prévia do link (WhatsApp/Instagram) com a marca FlyDelivery.
- Teste automático: `src/lib/site/publicDomain.test.ts` (345 testes passando).

### No painel (`flycontrol-dash`, ramo `claude/wonderful-curie-9dppb6`)

- `src/lib/site/enderecoDaLoja.ts`: `linkDoCardapio`, `linkDaMesa`,
  `destinoDoLinkDaLoja`. Links antigos gravados no banco são **convertidos na
  hora de mostrar** — o banco não foi alterado.
- Divulgação da loja, QR Code das mesas e lista de lojas do administrador usam
  o endereço oficial.
- Nova página `flydelivery.app/loja/<loja>` (sem o app → cardápio da loja).
- Trava de segurança de sincronização de cardápio aceita o endereço novo.
- 1.953 testes passando; compilação de produção OK.

---

## 4. Situação da publicação (19/11/2026, 04:58 UTC)

**Já está no ar.** A Cloudflare está configurada para publicar em produção
**qualquer ramo** enviado ao GitHub (gatilho "Deploy non-production branches"
com `wrangler deploy`). Ao enviar o ramo `claude/wonderful-curie-9dppb6`, as
duas partes foram publicadas:

| Worker | Versão no ar | Versão anterior (para voltar) |
|---|---|---|
| `conectfly` (cardápios) | `507cc520` | `a4c1333a` |
| `flycontrol-dash` (painel) | `615fe741` | `f32d7b6f` |

**O que falta, e é importante:** fazer o merge do ramo na `main` nos dois
repositórios. Sem isso, a próxima publicação da `main` (qualquer outro ajuste)
**volta o sistema para a versão antiga** — os cardápios param de redirecionar
e o painel volta a mostrar `conectfly.com.br`. Nada quebra, mas a migração se
desfaz.

1. `flycontrol-dash`: pull request de `claude/wonderful-curie-9dppb6` → `main` → merge.
2. `conectfly`: mesmo ramo → `main` → merge.

### Conferência depois de publicar (10 minutos)

| Teste | Como | Esperado |
|---|---|---|
| Link antigo | Abrir `conectfly.com.br/<sua-loja>` | Barra de endereço vira `cardapio.flydelivery.app/<sua-loja>` e o cardápio aparece |
| QR Code antigo da mesa | Ler um QR Code já impresso | Abre a mesa certa no endereço novo |
| Pedido | Fazer um pedido de teste pelo endereço novo | Chega no quadro do painel |
| Painel | Minha loja → divulgação | Link e QR Code com `cardapio.flydelivery.app` |
| App | Abrir `flydelivery.app/loja/<sua-loja>` no computador | Abre o cardápio da loja |
| Editor | Abrir `conectfly.com.br/` | Editor do SiteCreatorFly, como sempre |

---

## 5. Como voltar atrás

| Situação | O que fazer | Perde dados? |
|---|---|---|
| Redirecionamento dando problema | No `conectfly`, trocar `"MENU_LEGACY_REDIRECT": "true"` por `"false"` em `wrangler.jsonc` e publicar. O endereço antigo volta a abrir o cardápio direto. | Não |
| Voltar **na hora**, sem esperar compilação | Cloudflare → Workers → (`conectfly` ou `flycontrol-dash`) → Deployments → na versão anterior da tabela acima → **Rollback** | Não |
| Qualquer problema no painel | GitHub → PR mesclado → **Revert** → merge | Não |
| Qualquer problema nos cardápios | GitHub → PR mesclado → **Revert** → merge | Não |
| Quer desligar o endereço novo (só se o PR dos cardápios **não** foi publicado) | Cloudflare → Workers → `conectfly` → Settings → Domains & Routes → remover `cardapio.flydelivery.app` | Não |

**Atenção:** depois que o PR dos cardápios for publicado, **não remova**
`cardapio.flydelivery.app` — lojas novas já terão esse endereço gravado.
Navegadores guardam o redirecionamento por até 1 dia.

---

## 6. Pendências e pontos de atenção

Em ordem de importância.

1. **Bancos de dados não foram inspecionados.** O acesso ao Supabase desta
   sessão só enxerga um projeto que não é do FlyDelivery. Não houve mudança em
   banco, então não houve risco — mas também não conferi contagens, regras de
   acesso (RLS) nem backups dos dois bancos.
2. **Ramos vão direto para produção.** O gatilho da Cloudflare para "ramos
   que não são o principal" usa `wrangler deploy`, que publica para todo
   mundo. É como cada rascunho da cozinha já ir para a mesa do cliente.
   Recomendo trocar o comando desse gatilho para `npx wrangler versions upload`
   (gera só uma prévia com endereço próprio) em Cloudflare → Workers →
   `conectfly` e `flycontrol-dash` → Settings → Builds. **Não alterei.**
3. **Publicação dupla.** Nos dois repositórios, cada merge na `main` publica
   **duas vezes**: pelo GitHub Actions e pela integração Git da Cloudflare
   (Workers Builds). Hoje as duas dão certo, mas é como dois entregadores
   levando o mesmo pedido: se um dia um falhar ou atrasar, pode ficar no ar a
   versão errada. Recomendo manter só o GitHub Actions (que roda os testes) e
   desligar o "Deploy default branch" em Cloudflare → Workers → `conectfly` e
   `flycontrol-dash` → Settings → Builds. **Não alterei** — é decisão sua.
4. **App FlyDelivery abrindo direto pelo link.** O arquivo
   `flydelivery.app/.well-known/assetlinks.json` ainda não existe (dá 404).
   Sem ele, no Android o link abre no navegador (que agora mostra o cardápio)
   em vez do app. Precisa da impressão digital do certificado do app (ver
   `PUBLICACAO.md` no repositório `Flydelivery`).
5. **Fase 2 — API no endereço novo.** As conversas servidor-com-servidor
   (`/api/*`) ainda usam `conectfly.com.br`. Funciona, e o cliente não vê. Para
   tirar de vez: trocar `API_ORIGIN` em `publicDomain.ts` (conectfly), o
   segredo `SITECREATORFLY_BASE_URL` do Worker `flycontrol-dash` e o endereço
   em `src/lib/notifyTableClosed.functions.ts` para
   `https://cardapio.flydelivery.app` — depois que os dois PRs estiverem no ar.
6. **Painel aceita chamadas de qualquer site** nas rotas de pedido
   (`/api/orders`, `/api/public/*`): devolve o "pode entrar" para qualquer
   origem. Já era assim; a proteção real é a chave de cada loja. Vale fechar
   para `cardapio.flydelivery.app` + endereços antigos num trabalho separado.
7. **Mapa do site (`sitemap.xml`)** não existe em nenhum dos domínios. Para o
   Google achar os cardápios, o ideal é gerar a lista de lojas ativas.
8. **Domínio do Instagram/Supabase/Google:** sem mudança necessária para os
   cardápios (o editor e o login continuam onde estavam).
