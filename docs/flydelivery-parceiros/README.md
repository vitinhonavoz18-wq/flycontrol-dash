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

| O quê                                                                                                  | Onde                                                                |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| A rota (o endereço `/flydelivery-parceiros`)                                                           | `src/routes/flydelivery-parceiros.tsx`                              |
| A página inteira, montada                                                                              | `src/components/flydelivery-parceiros/FlyDeliveryParceirosPage.tsx` |
| As seções (Hero, Ecossistema, Pedidos, Marketplace, Recursos, Operação, FlyBoy, Chamada final, Rodapé) | `src/components/flydelivery-parceiros/*.tsx`                        |
| Todos os textos e listas                                                                               | `src/components/flydelivery-parceiros/dados.ts`                     |
| Cores, botões e animações                                                                              | `src/components/flydelivery-parceiros/parceiros.css`                |
| Título, descrição, Google e prévia do WhatsApp                                                         | `src/lib/flydelivery-parceiros/site.ts`                             |
| Imagem do hambúrguer e símbolo                                                                         | `src/assets/flydelivery-parceiros/`                                 |
| Ícones da aba e imagem da prévia do link                                                               | `public/flydelivery-parceiros/`                                     |
| Vídeo original do Hero (intacto, não usado pela página)                                                | `docs/flydelivery-parceiros/hero-original.mp4`                      |

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

## As chaves (variáveis de ambiente, opcionais)

| Chave                                    | Para quê                                                                                                                                                         | Se não existir                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `VITE_FLYDELIVERY_PARCEIROS_URL`         | Endereço completo da página (ex.: `https://parceiros.flydelivery.com.br`). Vira o endereço oficial informado ao Google e a base da imagem da prévia do WhatsApp. | Usa `https://flycontrol.conectfly.com.br/flydelivery-parceiros` |
| `VITE_FLYDELIVERY_PARCEIROS_INDEXAR`     | Só com o valor `sim` o Google pode mostrar a página nas buscas.                                                                                                  | **Não indexa** (seguro)                                         |
| `VITE_FLYDELIVERY_PARCEIROS_SISTEMA_URL` | Onde ficam cadastro, login, Termos e Privacidade. Usado na cópia de teste para mandar o visitante ao site oficial.                                               | Links internos (o normal)                                       |

Esquecer de configurar nunca publica a página de teste no Google — o padrão
é sempre "não indexar".

---

## A animação do Hero

O lado direito do Hero é uma **animação nativa da página** (não é mais um
vídeo): hambúrguer → Gestão de Pedidos → hambúrguer → Marketplace →
hambúrguer, num ciclo de 8 segundos sem emenda visível.

| Peça              | De onde vem                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Hambúrguer        | `src/assets/flydelivery-parceiros/hero-hamburguer.webp` — o primeiro quadro do vídeo oficial do Hero (o mesmo que a página já mostrava) |
| Gestão de Pedidos | o componente `QuadroDePedidos` — o mesmo da seção "Gestão de pedidos"                                                                   |
| Marketplace       | o componente `CelularMarketplace` — o mesmo da seção "Marketplace"                                                                      |

Onde ajustar:

- **Componente:** `src/components/flydelivery-parceiros/HeroVisual.tsx`.
- **Tempo e movimento:** `parceiros.css`, seção "HERO — o ciclo do
  hambúrguer". Os ajustes ficam no topo da seção, com nome em português
  (`--fdp-heroi-ciclo`, `--fdp-heroi-balanco`, `--fdp-heroi-flutuacao`…), e a
  linha do tempo está escrita num quadro logo acima deles.

Garantias (conferidas por testes automáticos em `parceiros.test.ts`):

- o último instante de cada camada é idêntico ao primeiro — o laço não salta;
- todas as camadas usam o mesmo ciclo de 8 s;
- só se anima transparência, posição/escala/giro e um desfoque leve — nada
  que empurre o resto da página;
- quem pede menos movimento no aparelho vê só o hambúrguer, parado;
- sem cronômetros no código: o tempo é todo do CSS.

A animação pausa sozinha quando o Hero sai da tela e tem um botão "Pausar
animação" que aparece para quem navega pelo teclado (Tab).

O vídeo de referência de movimento não foi adicionado ao projeto. O vídeo
original do Hero não é mais usado pela página, mas continua guardado intacto
em `hero-original.mp4`.

---

## A cópia de teste (preview) na Cloudflare

O sistema roda na **Cloudflare Workers**. O site oficial é o "worker"
`flycontrol-dash`, que atende `flycontrol.conectfly.com.br` e só é publicado
quando algo entra na `main` (`.github/workflows/deploy.yml`).

A cópia de teste é um **segundo worker, com outro nome**:
`flydelivery-parceiros-preview`, no endereço gratuito da Cloudflare
(`https://flydelivery-parceiros-preview.<sua-conta>.workers.dev`). É uma
segunda loja com a mesma planta, em outro endereço — não encosta na primeira.

**Como ela é publicada:** `.github/workflows/preview-flydelivery-parceiros.yml`
roda sozinho quando chega código nas branches `claude/ecstatic-allen-de1jao` ou
`staging/flydelivery-parceiros` (ou clicando em "Run workflow" no GitHub). A
`main` continua indo só para o site oficial.

**As travas** (se qualquer uma falhar, nada é publicado):

- a chave do Supabase tem que ser a **pública** (uma chave secreta colada no
  lugar errado é recusada);
- o nome do worker tem que ser o de teste, nunca `flycontrol-dash`;
- sem agendamento: a cobrança diária das 05:00 não existe na cópia;
- sem rotas nem domínios: ela só atende no endereço `*.workers.dev`;
- a porta de entrada da cópia passa por 35 conferências automáticas
  (`.github/preview-parceiros/testar-entrada.mjs`) antes de cada publicação;
- depois de publicada, a cópia é conferida de verdade pela internet.

**O que a cópia faz** (pela porta de entrada `entrada.mjs`):

- mostra **só a página nova**, no endereço exato — `/` cai nela, e qualquer
  coisa depois dela (`/flydelivery-parceiros/xyz`) volta para ela;
- qualquer outro endereço (login, cadastro, painel) vai para o site oficial;
- não aceita envio de nada (cadastro, formulário, pagamento): só abrir páginas;
- a página entregue proíbe o navegador de falar com o banco de dados;
- pede ao Google para não indexar nada (páginas e imagens).

Os botões "Começar grátis", "Entrar", "Termos" e "Privacidade" abrem o site
oficial, levando junto o código de afiliado (`?ref=`) se a pessoa chegou com um.

**O que a cópia recebe:** só o endereço e a chave **pública** do Supabase — as
mesmas que qualquer navegador já recebe. Nenhuma chave secreta.

**Atenção — endereço `workers.dev` do site oficial:** o site oficial também
responde em `flycontrol-dash.<sua-conta>.workers.dev` (é o padrão da
Cloudflare quando não se desliga). O endereço da cópia revela o `<sua-conta>`,
o que torna esse endereço fácil de adivinhar. Recomendação (decisão sua):
Workers → `flycontrol-dash` → Settings → Domains & Routes → desligar o
`workers.dev`. Antes, confira se a variável `FLYCONTROL_PUBLIC_URL` do site
oficial aponta para `flycontrol.conectfly.com.br` — a cobrança diária usa esse
endereço.

**Domínio próprio (opcional, futuro):** no painel da Cloudflare, Workers →
`flydelivery-parceiros-preview` → Settings → Domains & Routes → Add → Custom
Domain (ex.: `parceiros.flydelivery.com.br`). Só funciona se o domínio estiver
na mesma conta da Cloudflare. Para fechar com senha, use o Cloudflare Access
(Zero Trust), grátis para equipes pequenas.

**Para apagar a cópia:** Workers → `flydelivery-parceiros-preview` → Settings →
Delete. O site oficial não é afetado.

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
