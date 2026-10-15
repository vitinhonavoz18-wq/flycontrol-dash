# Anúncio Reels — CRM + IA do FlyControl

Vídeo vertical (9:16) de 45 segundos para Instagram Reels, feito 100% em
código: animação em **Remotion + React**, trilha e efeitos **sintetizados
aqui mesmo** (sem música de terceiros), narração com voz neural brasileira.

Este projeto é separado do painel FlyControl. Ele **não altera nada** no
sistema — só usa o logotipo, o personagem, as cores e o desenho das telas
como referência.

## O que sai daqui

| Arquivo | O que é |
| --- | --- |
| `saida/flycontrol_crm_anuncio_final.mp4` | vídeo final 1080 × 1920 (o que o Instagram usa) |
| `saida/flycontrol_crm_anuncio_final_4k.mp4` | mesmo vídeo em 2160 × 3840 (arquivo-mestre) |
| `saida/flycontrol_crm_capa.png` | capa do Reels, 2160 × 3840 |
| `saida/flycontrol_crm_legendas.srt` | legendas sincronizadas |

## Como renderizar de novo

Precisa de Node 20+, Python 3 com `numpy` e `scipy`, e FFmpeg.

```bash
npm install
pip install numpy scipy edge-tts   # edge-tts só se for refazer a narração

npm run audio        # trilha + efeitos + mixagem (-14 LUFS)
npm run render:1080  # vídeo para o Instagram
npm run render:4k    # vídeo-mestre 4K (~25 min)
npm run capa         # capa em PNG
npm run legendas     # arquivo .srt
npm run studio       # abre o editor visual no navegador, para ajustar
```

Em servidor sem navegador próprio, aponte o Chromium instalado com
`REMOTION_CHROME=/caminho/do/chrome` (veja `remotion.config.ts`).

## Onde mudar cada coisa

| Quero mudar… | Arquivo |
| --- | --- |
| o momento de cada cena e de cada efeito | `src/tempos.json` (um só lugar, vale para vídeo e áudio) |
| o texto da narração | `scripts/gerar_narracao.py`, depois `npm run narracao`, `npm run legendas` e `npm run audio` |
| as quebras da legenda | `scripts/legendas.py` (lista `QUEBRAS`) |
| conversas, nomes e cartões fictícios | `src/dados.ts` |
| cardápio fictício da cena 4 | `src/cenas/CenaIA.tsx` (`COMBOS`) |
| cores e fontes | `src/estilo.ts` |
| música, efeitos e volumes | `scripts/audio.py` |

### Trocar a cena 6 por uma filmagem real

A cena do benefício usa o personagem oficial do FlyControl, porque não havia
como gerar ou obter filmagem de um restaurante. Para usar um vídeo real
(vertical, ~7 s, de preferência gravado no próprio estabelecimento):

1. coloque o arquivo em `public/video/cozinha.mp4`;
2. em `src/Root.tsx`, troque `videoCena6: null` por `videoCena6: "video/cozinha.mp4"`;
3. renderize de novo.

## Storyboard técnico

Quadros a 30 por segundo. Os tempos de fala vêm das marcas de cada palavra
da narração.

| Cena | Tempo | Quadros | Imagem | Narração | Som |
| --- | --- | --- | --- | --- | --- |
| 1 · A dor | 0:00–0:06,6 | 0–198 | Título "MUITA MENSAGEM NO / HORÁRIO DE PICO?" (laranja). Celular 3D sobe de baixo, inclinado; conversas chegam com banner de notificação e contador de não lidas. | "Sexta-feira, horário de pico. O movimento aumenta, e seu WhatsApp não para." | pulso tenso em lá menor; "plim" a cada mensagem |
| 2 · Sobrecarga | 0:06,6–0:11,6 | 198–348 | Câmera se aproxima; 18 cartões de mensagem flutuam em profundidade (os de trás desfocados). "ENQUANTO VOCÊ PRODUZ... QUEM RESPONDE?". Aos 10 s tudo congela, a cor esfria e uma onda laranja sai do celular. | "Mas quem cuida de tantas mensagens enquanto os pedidos precisam sair?" | arpejo acelera; no congelamento a música para e sobra um grave |
| 3 · Transformação | 0:11,3–0:16,4 | 340–492 | Feixe de luz laranja cruza a tela; os cartões voam para dentro do painel "Chat" do FlyControl (menu real: Pedidos, Mesas, Cardápio, Marketing, Chat). Ícone do mensageiro ⇄ FlyControl, "WhatsApp conectado". | "Com o FlyControl, seu atendimento ganha uma nova inteligência." | subida + impacto; trilha vira para dó maior, positiva |
| 4 · IA em ação | 0:16,4–0:24,4 | 492–732 | Selo "IA FLYCONTROL — ATENDIMENTO AUTOMATIZADO". Passos 1-2-3 acendem junto com a fala. Conversa cliente × Atendente IA (azul, como no chat real); cardápio sobe; cliente toca no combo; fluxo de dados até a conversa. | "Conecte seu WhatsApp, centralize as conversas e ative a inteligência artificial para auxiliar no atendimento dos clientes." | digitação, cliques, "blips" de dados |
| 5 · Ecossistema | 0:24,4–0:32 | 732–960 | Composição 3D girando devagar: WHATSAPP → CRM FLYCONTROL → IA INTELIGENTE → CARDÁPIO + PEDIDOS, ligados por linhas laranja. Um ponto de luz leva o atendimento de um a um; no fim surge o cartão "#1843 · NOVO PEDIDO · via Chat IA". Textos em sequência: CONVERSAS CENTRALIZADAS / RESPOSTAS AUTOMATIZADAS / GESTÃO CONECTADA. | "Tudo integrado ao cardápio digital e à gestão de pedidos, para uma operação muito mais ágil." | ponto alto da trilha, bateria cheia |
| 6 · Benefício | 0:32–0:38,5 | 960–1155 | Ambiente quente com luzes desfocadas; personagem do FlyControl tranquilo; celular em primeiro plano com o Chat organizado. "MENOS TEMPO RESPONDENDO. / MAIS TEMPO CRESCENDO." | "Menos tarefas repetitivas. Mais tempo para focar no que realmente importa: o seu negócio." | trilha calma, piano |
| 7 · CTA | 0:38,5–0:45 | 1155–1350 | Fundo branco; celular se afasta; logotipo oficial aparece com brilho. "SEU ATENDIMENTO PODE IR ALÉM." / "CRM + WHATSAPP + INTELIGÊNCIA ARTIFICIAL" / botão laranja "CONHEÇA O FLYCONTROL" / flycontrol.conectfly.com.br | "FlyControl. Inteligência para o seu atendimento. Conheça agora." | acorde final + assinatura sonora (três sinos) |

## Áreas seguras do Reels

- Nada importante nos 230 px de cima (barra do Instagram) nem abaixo de
  1 560 px (nome do perfil, legenda do post e botões).
- A legenda queimada fica em 1 452–1 540 px.
- A coluna da direita (ícones de curtir/comentar) só recebe elementos
  decorativos.

## Áudio

- Narração: voz neural `pt-BR-AntonioNeural` (Microsoft, via `edge-tts`).
- Trilha e efeitos: sintetizados em `scripts/audio.py` — composição original.
- Música abaixa ~11 dB sempre que há fala; volume final -14 LUFS, pico -1,5 dB.
