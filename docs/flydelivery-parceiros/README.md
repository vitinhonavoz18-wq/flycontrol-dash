# FlyDelivery Parceiros — página nova (em teste)

A página nova do FlyDelivery Parceiros mora em **`/flydelivery-parceiros`**,
dentro do mesmo sistema do FlyControl, mas separada dele.

- A página inicial atual do FlyControl (`/`) **não foi alterada**.
- Nada foi publicado. A publicação do site só acontece quando algo entra na
  branch `main` (ver `.github/workflows/deploy.yml`).
- A página diz ao Google **"não me indexe"** enquanto estiver em teste.

É como montar a vitrine nova nos fundos da loja: a porta da frente continua
funcionando igual, e só quem recebe o endereço vê a vitrine nova.

---

## Onde está cada coisa

| O quê | Onde |
|---|---|
| A rota (o endereço `/flydelivery-parceiros`) | `src/routes/flydelivery-parceiros.tsx` |
| A página inteira, montada | `src/components/flydelivery-parceiros/FlyDeliveryParceirosPage.tsx` |
| As seções (Hero, Ecossistema, Pedidos, Marketplace, Recursos, Operação, FlyBoy, Chamada final, Rodapé) | `src/components/flydelivery-parceiros/*.tsx` |
| Todos os textos e listas | `src/components/flydelivery-parceiros/dados.ts` |
| Cores, botões e animações | `src/components/flydelivery-parceiros/parceiros.css` |
| Título, descrição, Google e prévia do WhatsApp | `src/lib/flydelivery-parceiros/site.ts` |
| Vídeo, foto inicial e símbolo | `src/assets/flydelivery-parceiros/` |
| Ícones da aba e imagem da prévia do link | `public/flydelivery-parceiros/` |
| Vídeo original (intacto) | `docs/flydelivery-parceiros/hero-original.mp4` |

---

## Como abrir no seu computador

Precisa do [Bun](https://bun.sh) instalado e de um arquivo `.env` com os
endereços públicos do Supabase (o modelo está em `.env.example`). Sem eles o
sistema inteiro não abre — não é coisa da página nova.

```bash
bun install
bun run dev
```

Depois abra **http://localhost:8080/flydelivery-parceiros**.

Para conferir antes de qualquer publicação:

```bash
bun run test     # testes automáticos
bun run build    # monta o site como ele iria para o ar
```

---

## As duas chaves (variáveis de ambiente, opcionais)

| Chave | Para quê | Se não existir |
|---|---|---|
| `VITE_FLYDELIVERY_PARCEIROS_URL` | Endereço completo da página (ex.: `https://parceiros.flydelivery.com.br`). Vira o endereço oficial informado ao Google e a base da imagem da prévia do WhatsApp. | Usa `https://flycontrol.conectfly.com.br/flydelivery-parceiros` |
| `VITE_FLYDELIVERY_PARCEIROS_INDEXAR` | Só com o valor `sim` o Google pode mostrar a página nas buscas. | **Não indexa** (seguro) |

Esquecer de configurar nunca publica a página de teste no Google — o padrão
é sempre "não indexar".

---

## O vídeo do Hero

O arquivo que chegou (`hero-original.mp4`, 1280×720, 8 s, 3 MB) é uma tela de
site inteira: já vem com o menu, o título e os botões desenhados dentro. Se
fosse usado inteiro do lado direito, o visitante leria o título duas vezes.

Por isso a versão do site mostra **só o lado direito do quadro**, onde a
animação acontece. Nada foi redesenhado, só enquadrado. Também saiu o áudio,
porque o vídeo toca sempre mudo.

| Arquivo | Tamanho | Para quem |
|---|---|---|
| `hero-loop.mp4` (H.264) | ~0,8 MB | Quase todos os navegadores |
| `hero-loop.webm` (VP9) | ~0,9 MB | Reserva, só para quem não toca MP4 |
| `hero-poster.webp` | ~48 KB | A foto que aparece na hora |

Como foram gerados (recorte de 744×640 a partir do ponto x=536, y=80):

```bash
ffmpeg -i hero-original.mp4 -vf "crop=744:640:536:80" -an \
  -c:v libx264 -preset veryslow -crf 25 -profile:v high -pix_fmt yuv420p \
  -movflags +faststart hero-loop.mp4

ffmpeg -i hero-original.mp4 -vf "crop=744:640:536:80" -an \
  -c:v libvpx-vp9 -crf 35 -b:v 0 -row-mt 1 -deadline good -cpu-used 1 -g 96 \
  -pix_fmt yuv420p hero-loop.webm

ffmpeg -i hero-original.mp4 -vf "crop=744:640:536:80" -frames:v 1 \
  -c:v libwebp -quality 82 hero-poster.webp
```

**Observação:** o vídeo termina no celular e recomeça no hambúrguer. A virada
do loop é um corte seco — está assim no arquivo original. Se quiser uma
emenda invisível, o ajuste é no vídeo, não no site.

---

## Publicar num endereço de teste (staging) — SÓ COM AUTORIZAÇÃO

O sistema roda na **Cloudflare Workers**. Hoje existe um "worker" chamado
`flycontrol-dash`, que atende `flycontrol.conectfly.com.br` e é publicado
automaticamente quando algo entra na `main`.

A ideia para o teste é criar um **segundo worker, com outro nome**, a partir
do mesmo código. Ele não encosta no primeiro: é uma segunda loja com a mesma
planta, em outro endereço.

1. **Criar o worker de teste.** O roteiro pronto está em
   `docs/flydelivery-parceiros/deploy-staging.yml.exemplo`. Ele publica com o
   nome `flydelivery-parceiros-staging` e **tira o agendamento diário de
   cobrança** do worker de teste — senão ele também rodaria a cobrança todo
   dia às 5h. Para usar, copie o arquivo para `.github/workflows/` (com
   extensão `.yml`) — antes disso ele não faz nada.

2. **Configurar no painel da Cloudflare** (Workers → `flydelivery-parceiros-staging`
   → Settings):
   - Variáveis: só as **públicas** do Supabase (`SUPABASE_URL`,
     `SUPABASE_PUBLISHABLE_KEY`).
   - **Não** colocar no teste: `SUPABASE_SERVICE_ROLE_KEY`, `BILLING_CRON_SECRET`,
     chaves da InfinityPay, da UAZAPI ou do SiteCreatorFly. O teste é para ver a
     página, não para mexer em cobrança ou cadastro de verdade.

3. **Endereço.** Em Domains & Routes → Add → Custom Domain, por exemplo
   `parceiros.flydelivery.com.br`. Isso só funciona se o domínio
   `flydelivery.com.br` estiver na mesma conta da Cloudflare. Se não estiver,
   dá para usar um subdomínio do `conectfly.com.br` ou o endereço gratuito
   `*.workers.dev` que a Cloudflare oferece.

4. **Abrir direto na página nova.** No endereço de teste, a raiz `/` ainda
   mostra a página do FlyControl. Para abrir direto na nova, crie uma regra de
   redirecionamento na Cloudflare (Rules → Redirect Rules) de `/` para
   `/flydelivery-parceiros` — **só no domínio de teste**.

5. **Fechar com senha (recomendado).** O Cloudflare Access (Zero Trust) deixa
   o endereço de teste aberto só para e-mails autorizados. É grátis para
   equipes pequenas.

Nenhum desses passos muda o `flycontrol-dash`, o domínio oficial ou o DNS
existente.

---

## O dia da troca (futuro) — SÓ COM AUTORIZAÇÃO

Quando chegar a hora de a página nova virar a principal:

1. Em `src/routes/index.tsx`, trocar o componente por
   `FlyDeliveryParceirosPage` e o cabeçalho por `cabecalhoDaPagina()`, mais o
   CSS da página (igual está em `src/routes/flydelivery-parceiros.tsx`).
2. Configurar `VITE_FLYDELIVERY_PARCEIROS_URL` com o endereço oficial e
   `VITE_FLYDELIVERY_PARCEIROS_INDEXAR=sim`.
3. Tirar o selo "Em breve" do FlyBoy quando o aplicativo do entregador existir.

Nenhuma seção precisa ser refeita.
