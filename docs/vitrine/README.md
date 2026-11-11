# Vitrine de Cardápios (`/vitrine`)

A página pública que mostra, em vídeo, cardápios reais de clientes do FlyDelivery
funcionando: a capa da loja, a rolagem pelo cardápio, um produto entrando no
carrinho e o resumo do pedido. É o "test drive" para o dono de pizzaria ou
hamburgueria entender, em 15 segundos, o que vai receber.

- Página: `src/routes/vitrine.tsx`
- Card e player: `src/components/vitrine/`
- Lista de cardápios (e a decisão de publicar): `src/lib/vitrine/demonstracoes.json`
- Vídeos, capas e logos: `public/vitrine/<loja>/`
- Gerador dos vídeos: `scripts/vitrine/gerar-demonstracoes.mjs`
- Conferência no navegador: `scripts/vitrine/validar-vitrine.mjs`
- Resultado da última conferência: `docs/vitrine/validacao.json` e `docs/vitrine/capturas/`

## O que foi encontrado do trabalho anterior

| Onde | O que era | O que aconteceu |
|---|---|---|
| Repositório `Flydelivery` (`scripts/previews/`) | Gravador automático, feito para o app FlyDelivery, que já resolvia a lentidão: captura quadro a quadro com o horário real de cada quadro, bloqueio de envios, toques reais | **Reaproveitado** — a mesma técnica virou o gerador desta vitrine, adaptado para os sites de pedido das lojas |
| Pasta do vídeo de lançamento | 12 gravações curtas (7,8 s) dos sites das lojas: só capa e rolagem, 660 px de largura, sem otimização para a web | **Não atendiam** (sem produto e sem carrinho, baixa resolução, arquivos pesados): todas regravadas |
| `public/hero-media/` neste repositório | Vídeos antigos de capa (Cheirosa, Mr. Pizza, HS Boteco…) | **Mantidos sem mudança**: não são usados pelo código daqui, mas podem estar ligados no banco como capa de algum site. Apagar sem conferir poderia deixar uma loja sem capa |

## As demonstrações (gravadas em 11/11/2026, à noite)

Todas: formato de celular 9:16, captura em **1080×1920 (Full HD vertical)** a
27–37 quadros por segundo, publicadas em 720×1280 (MP4 H.264 sem áudio, com
"faststart"), mais uma versão WebM 40% menor para os navegadores que a aceitam,
e foto de capa (poster) de ~50 KB.

| Loja | Categoria | Na vitrine | Duração | MP4 | WebM | O que o vídeo mostra |
|---|---|---|---|---|---|---|
| JC BURGUER | Hamburgueria | sim | 15,6 s | 2,30 MB | sim | capa → cardápio → produto adicionado → resumo do pedido |
| PAIXÃO AÇAI | Açaí | sim | 16,6 s | 1,71 MB | sim | capa → cardápio → produto → resumo → entrega e pagamento |
| TEMPERO DA DONA | Restaurante | sim | 15,5 s | 2,79 MB | sim | capa → cardápio → produto → resumo do pedido |
| ALPHA PASTELARIA | Lanchonete | sim | 17,1 s | 2,10 MB | sim | capa → cardápio → categoria → produto → resumo do pedido |
| D’LUA DOCES | Doces | sim | 14,6 s | 2,05 MB | sim | capa → cardápio (**loja fechada na hora da gravação**) |
| Brasa do João | Restaurante | sim | 15,5 s | 1,75 MB | sim | capa → cardápio → produto → resumo do pedido |
| Açai Deus provera | Lanchonete | sim | 15,5 s | 2,00 MB | sim | capa → cardápio → produto → resumo do pedido |
| Sandwitch | Restaurante | sim | 16,6 s | 1,72 MB | sim | capa → cardápio → produto → resumo → entrega e pagamento |
| Xerife Pastéis Penha | Lanchonete | sim | 15,5 s | 1,26 MB | sim | capa → cardápio → produto → resumo do pedido |
| DEPOSITO ARAÚJO | Restaurante | sim | 17,1 s | 1,38 MB | sim | capa → cardápio → categoria → produto → resumo do pedido |
| EMILY BURGUER | Hamburgueria | **não** | 17,0 s | 1,47 MB | sim | capa → cardápio → categoria → produto → resumo do pedido |
| AÇAI E LOVE | Açaí | sim | 14,5 s | 2,69 MB | sim | capa → cardápio (**loja fechada na hora da gravação**) |

**Emily Burguer está fora da vitrine** até alguém conferir: o logo no site
dela mostra "Pizza Favela" e o cardápio tem preços que parecem de teste
(R$ 500,00, R$ 800,00).

As **categorias** vêm do cadastro de cada loja. Algumas parecem trocadas (o Açaí
Deus Proverá está como "Lanchonete" e o Depósito Araújo, que vende bebidas, como
"Restaurante"). Para corrigir só na vitrine, edite o campo `categoria` no JSON.

## Segurança das gravações

- Tudo o que não é leitura (pedido, estatística, formulário) é **bloqueado na
  rede** durante a gravação. Foi bloqueado 1 envio por loja: a medição de
  visitas da Cloudflare (`cdn-cgi/rum`).
- O gravador toca em **"Adicionar"** e no carrinho. Também toca em **"Próximo
  passo"**, que só troca de tela: isso foi conferido no código do site
  (`SiteCartDrawer.tsx`, `goToCheckout`). Ele **nunca** toca em "Finalizar pedido".
- Não há login e nenhum campo de nome ou WhatsApp é preenchido. Nenhum pedido,
  mensagem ou dado de cliente foi criado.

## Como gerar ou atualizar os vídeos

Precisa: Node 22, FFmpeg e Playwright com Chromium.

```bash
npm run vitrine:gerar
```
Grava os cardápios que estão sem vídeo, com gravação de outra versão do roteiro
ou com vídeo de mais de 30 dias. Os que estão em dia são mantidos, nada é
duplicado.

```bash
npm run vitrine:gerar -- --so jc-burguer,paixao-acai
```
Só algumas lojas.

```bash
npm run vitrine:gerar -- --so d-lua-doces,acaielove --forcar
```
Regrava mesmo estando em dia. Exemplo: as lojas que estavam fechadas, gravadas
de novo no horário de funcionamento.

```bash
npm run vitrine:validar -- http://127.0.0.1:5173
```
Confere a vitrine no navegador, com o site rodando (`npm run dev`).

## Como colocar um cardápio novo na vitrine

1. Gere o vídeo, trocando o apelido (o final do endereço `conectfly.com.br/...`), o nome e a categoria:

```bash
npm run vitrine:gerar -- --novo apelido-da-loja --nome "Nome da Loja" --categoria Pizzaria --cidade "Salvador · BA"
```

2. Assista ao vídeo em `public/vitrine/apelido-da-loja/demo.mp4`.
3. Com a **autorização do cliente**, abra `src/lib/vitrine/demonstracoes.json` e mude `"publicar": false` para `true`. Se quiser, coloque o logo em `public/vitrine/apelido-da-loja/logo.webp` e preencha `"logo"`.
4. Publique o site normalmente.

Loja nova **nunca** aparece sozinha: entra com `publicar: false`.

## Desempenho (medido na versão de produção, localmente)

| Aparelho (emulado) | LCP | "Pulo" de tela (CLS) | Vídeos tocando ao mesmo tempo | Erros |
|---|---|---|---|---|
| iPhone 13 | 0,56 s | 0 | no máximo 1 | 0 |
| Pixel 7 | 0,37 s | 0 | no máximo 1 | 0 |
| iPad Mini | 0,34 s | 0 | no máximo 1 | 0 |
| Computador | 0,41 s | 0 | no máximo 1 | 0 |

- **Antes de rolar, a página baixa só as fotos de capa.** Nenhum vídeo é
  carregado antes de o card chegar perto da tela. Os 12 vídeos somam 23 MB:
  baixar todos na abertura travaria o 4G.
- **Um vídeo toca por vez:** o card mais presente na tela. Fora da tela ou com a
  aba trocada, ele pausa. Ao sair da página, a memória do vídeo é devolvida.
- **"Reduzir movimento" ou economia de dados ligados no aparelho:** nada toca
  sozinho; aparece a foto e um botão de play.
- **Janela ampliada aberta:** os vídeos dos cards param.

> LCP e CLS medidos em rede local (sem simular 4G) e com emulação no Chromium.
> Não houve teste em celular físico nem em Safari ou Firefox de verdade.
