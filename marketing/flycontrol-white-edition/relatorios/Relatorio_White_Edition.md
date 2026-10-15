# FlyControl — White Edition V2: relatório de produção

## 1. O que foi entregue

| Arquivo | O que é |
|---|---|
| `renders/FlyControl_White_Edition_V2.mp4` | Vídeo principal, 1080×1920, 30 fps, **36,2 s**, com narração, trilha, efeitos, legendas e telas reais |
| `renders/FlyControl_White_Edition_V2_Master_4K.mp4` | Master do vídeo principal em **2160×3840** (4K vertical) |
| `renders/FlyControl_White_Edition_25s.mp4` | Versão curta para anúncio, **24,8 s** |
| `renders/FlyControl_White_Edition_SemVoz.mp4` | Versão sem locução (só trilha e efeitos, sem legenda) |
| `renders/FlyControl_White_Edition_Legendas.srt` | Legendas sincronizadas da V2 (`..._25s_Legendas.srt` para a curta) |
| `renders/timeline-marcadores-v2.csv` / `-25s.csv` | Cada momento-chave: segundo, quadro e marcador |
| `narracao/v2_narracao_tratada.wav` | Locução tratada, posicionada no tempo do vídeo |
| `assets/audio/v2_trilha_sem_voz.wav` | Trilha + efeitos sem voz |
| Pasta `flycontrol-white-edition/` | Projeto editável completo (código, componentes 3D, capturas, áudio) |

O projeto da primeira versão (`flycontrol-ad/`) não foi alterado: a White Edition vive numa pasta própria.

## 2. Como o Modo Claro (White) foi ativado

- O painel do FlyControl (`flycontrol-dash`) foi aberto no navegador automatizado, rodando aqui no ambiente de
  desenvolvimento, com **dados de demonstração** (não há acesso de login à produção, e os pedidos reais têm dados
  pessoais de clientes).
- Ele abriu no tema padrão, escuro (`<html class="dark">`), e o interruptor da barra lateral dizia **"Modo Escuro"**.
- O robô **clicou no interruptor real** (`#theme-toggle`, em `src/routes/_app.tsx`). Resultado conferido pelo próprio
  script antes de capturar: classe `light` na página, preferência `flycontrol-theme = light` salva **só naquele
  navegador de gravação**, fundo branco e o rótulo trocado para **"Modo Claro"**. Se o tema não tivesse mudado, o
  script pararia com erro em vez de inventar uma captura.
- Nada do código do FlyControl foi alterado e nenhuma preferência de outro usuário foi tocada.
- Registro completo: `capturas-reais/painel-white/registro-da-captura.txt`; prova visual:
  `00-antes-modo-escuro.png` × `01-depois-modo-claro-computador.png`.

## 3. Telas capturadas

**Painel FlyControl em Modo Claro** (tablet na horizontal, 1180×820 em alta definição):
1. Quadro de pedidos com as colunas reais **Novo pedido / Em preparo / Saiu para entrega**.
2. Detalhes do pedido #1041 (cliente, itens, pagamento, "Mover para").
3. Toque em **"Em preparo"**: abre a tela FlyStatus "Em Preparo — Enviar ao Cliente".
4. Quadro atualizado: o pedido #1041 passa para a coluna "Em preparo".

As posições das colunas e dos botões foram **medidas no próprio navegador** (`componentes-3d/medidas-painel.json` e
`toques-tablet.json`), por isso os contornos laranja e os toques caem exatamente sobre os elementos reais.

**Cardápios** (os mesmos da versão anterior, gravados do site no ar em `conectfly.com.br`, já com o vídeo de capa
correto de cada loja):

| Estabelecimento | Endereço | Como aparece |
|---|---|---|
| Açaí e Love | `/teste-001-5srj` | surge da transformação, com o celular girando em 3D; vídeo de capa |
| Açaí Deus Proverá | `/acai-deus-provera` | câmera desliza para a direita ("açaí"); hambúrguer real em destaque fotográfico |
| D'lua Doces | `/d-lua-doces` | entra pela profundidade ("doce") |
| Brasa do João | `/brasa-do-joao` | aproximação da foto real do vídeo de capa (a churrasqueira) |
| Alpha Pastelaria | `/alpha-pastelaria` | navegação real: a categoria "Pastéis" aberta, rolando |

Os cardápios mantêm as cores e a identidade de cada loja. O branco é só do cenário e do painel.

Na transformação, os "cartões" que substituem as mensagens são **recortes de telas reais**: categoria Açaí (Açaí e
Love), Açaí na Tigela, botão "Adicionar", adicionais escolhidos (Nutella, Calda de Morango, Paçoca), botão do
carrinho "1 item R$ 18,00", resumo "Seu pedido", hambúrguer e categoria Pastéis (Alpha).

## 4. Funcionalidades mostradas (todas existem)

Vídeo de capa · categorias · produtos com foto · adicionais · carrinho · resumo do pedido · quadro de gestão com as 3
etapas · detalhes do pedido · mudança de status · aviso ao cliente (FlyStatus) · tema claro do painel.

## 5. Recursos audiovisuais

- **Estúdio branco** (tokens reais do tema claro: fundo #F8F9FB, texto #111827, laranja #ff5a00, gradiente
  #ff5a00 → #ff7a00 → #ffc247, borda #E5E7EB), piso com reflexo, luz de estúdio, partículas laranja.
- Efeitos: Orange Light Sweep, Clean UI Morph, Floating Devices (celular branco com frente e verso de verdade, tablet
  grafite), Orange Impact Ring, reflexos de vidro, linhas de luz laranja finas.
- Tipografia 3D grafite/laranja, palavra a palavra no tempo da voz; legendas em pílula de vidro na área segura.
- **Narração:** a locução da voz "Bianca" (ElevenLabs) já gravada, cortada nos silêncios naturais. Tempos de cada
  palavra vêm do alinhamento da própria ElevenLabs (`narracao/words.json`), e todas as animações leem esses tempos.
- **Trilha nova** (Lá maior, 116 bpm, tech corporate), composta por código, sem amostras de terceiros: livre para
  publicidade. Ela começa curiosa, para no congelamento, sobe com o riser e explode no "FlyControl".
- Mix: -14 LUFS (padrão das redes), pico -0,8 dB (sem distorção), voz ~8,5 dB acima da trilha.

## 6. Limitações (importante)

1. **Narração reaproveitada, não nova.** A ElevenLabs tinha só 51 créditos (a narração nova precisava de 551) e o
   plano gratuito está bloqueado. Por sua escolha, usei trechos da locução já gravada. As frases ficam **próximas, mas
   não iguais** ao roteiro novo:
   - "Quantas mensagens seu cliente precisa mandar…" virou "Seu cliente ainda precisa mandar várias mensagens só pra fazer um pedido?";
   - "Conheça uma experiência…" virou "Com o FlyControl, existe um jeito muito mais simples, moderno e profissional";
   - "Cardápios digitais com a identidade de cada negócio…" virou "Seja um açaí, um doce, um hambúrguer… cada negócio com o seu próprio cardápio";
   - "E para o seu negócio, uma gestão…" virou "Seu negócio merece uma experiência de pedidos muito mais profissional";
   - "FlyControl. Transforme a experiência…" virou "Conheça agora!".

   Os textos na tela seguem a voz. Com créditos recarregados, dá para gerar o roteiro exato e trocar só o áudio: as
   animações se reajustam sozinhas aos novos tempos.
2. **Painel com dados de demonstração.** As capturas são do painel original, rodando no ambiente de desenvolvimento.
   Clientes e endereços dos pedidos são fictícios; produtos e preços são os reais do Açaí Deus Proverá.
3. O cartão "Clube" que aparece na imagem de referência depende de uma função do servidor que não roda com dados de
   demonstração, então **não aparece** nas capturas (não foi inventado).
4. A imagem da tela "Em preparo" é a arte **padrão** do sistema (um cozinheiro de pizzaria), porque a loja ainda não
   enviou a arte própria.
5. A marca exibida no painel é **FlyControl** (é o que o painel mostra hoje); "FlyDelivery" aparece só como item do menu.

## 7. Auditoria final

- [x] Modo claro ativado pelo interruptor e conferido (classe, preferência e rótulo).
- [x] Branco e laranja como identidade do cenário; cardápios com as cores próprias.
- [x] Os 5 estabelecimentos presentes, cada um com o seu vídeo de capa.
- [x] Transformação diferente da 1ª versão (cartões que viram componentes reais + giro de 180° + anel laranja).
- [x] Narração sincronizada pelos tempos reais das palavras; legendas .srt geradas dos mesmos tempos.
- [x] Áudio sem clipping (pico -0,8 dB) e no volume padrão (-14 LUFS).
- [x] Vídeo original e projeto anterior intactos.
- [x] MP4 finais renderizados de verdade (H.264 + AAC 320 kbps).
