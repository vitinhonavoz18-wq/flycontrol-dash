# Anúncio FlyControl — projeto editável

Vídeo vertical (1080×1920) feito com [Remotion](https://remotion.dev) a partir das telas **reais** dos
cardápios em `conectfly.com.br`.

## Passo a passo para refazer

```bash
npm install
# 0) vídeos de capa: baixe o hero_video_url de cada loja (tabela pizzerias_public) e converta para WebM
#    em capture/hero/<identificador>.webm — o Chromium de gravação não toca H.264.
#    ffmpeg -i loja.mp4 -an -c:v libvpx-vp9 -crf 24 -b:v 0 capture/hero/<identificador>.webm
# 1) gravar as telas reais (quadro a quadro, 30 fps). Bloqueia qualquer envio: nenhum pedido é criado.
node capture/shoot.mjs
for d in capture/frames/*; do ffmpeg -y -framerate 30 -i $d/%04d.jpg -c:v libx264 -crf 15 -pix_fmt yuv420p public/clips/$(basename $d).mp4; done
cp capture/stills/*.jpg public/stills/ && cp capture/frames/al/0000.jpg public/stills/al0.jpg
# 2) linha do tempo a partir dos tempos reais da locução (public/audio/words.json)
python3 audio/timeline.py
# 3) trilha, efeitos, tratamento da voz e mix
python3 audio/build.py && ./audio/finalize.sh && python3 audio/export_text.py
# 4) vídeos
npx remotion bundle src/index.ts --out-dir out/bundle && ./render-all.sh
```

Para ver e mexer no navegador: `npx remotion studio src/index.ts`.

## Onde mexer

- `src/timeline.json` — tempos de cada palavra da locução e marcadores (gerado por `audio/timeline.py`).
- `src/scenes/Before.tsx` — conversa caótica, congelamento, pergunta e a virada (fragmentação/reconstrução).
- `src/scenes/Menus.tsx` — os cardápios reais em sequência + selo "VÍDEO NA CAPA".
- `src/scenes/Montage.tsx` — os cinco vídeos de capa lado a lado.
- `src/scenes/Features.tsx` — escolha → adicionais → carrinho → resumo (telas reais do Açaí Deus Proverá).
- `src/scenes/Finale.tsx` — composição final, logo e CTA.
- `capture/` — scripts de gravação (Playwright). `capture/lib.mjs` bloqueia toda escrita no site.
- `audio/build.py` — trilha e efeitos sintetizados (originais, sem licença de terceiros).
