# FlyControl — White Edition V2 (projeto editável)

Anúncio vertical feito com [Remotion](https://remotion.dev). Pastas:

- `assets/` — tudo que o vídeo usa (clipes reais dos cardápios, telas do painel em Modo Claro, recortes de UI, fontes, marca, áudio final). É a pasta "pública" do Remotion.
- `capturas-reais/` — capturas originais: `painel-white/` (com o registro da ativação do Modo Claro) e `cardapios/`.
- `componentes-3d/` — estúdio branco, celular/tablet 3D, tipografia 3D, conversa clara, legendas e as cenas (`scenes/`).
- `composicoes/` — composições (`WhiteEditionV2`, `WhiteEdition25s`, `WhiteEditionSemVoz`) e as linhas do tempo da voz.
- `narracao/` — locução (Bianca, ElevenLabs), tempos de cada palavra e os scripts que montam a linha do tempo e as legendas.
- `efeitos-sonoros/` — trilha e efeitos sintetizados por código (`trilha_white.py`).
- `scripts/` — captura do painel (`captura-painel-white.mjs`), medições, quadros de conferência e renderização.
- `renders/` — vídeos finais, legendas e marcadores. `relatorios/` — relatório e auditoria.

## Refazer

```bash
npm install
python3 narracao/montar_timeline.py            # linhas do tempo a partir da voz
python3 efeitos-sonoros/trilha_white.py v2      # trilha + mix (e: ... 25s)
python3 narracao/exportar_legendas.py           # .srt e marcadores
npx remotion bundle composicoes/index.ts --out-dir renders/bundle --public-dir assets
./scripts/renderizar.sh
```

Para trocar a narração (ex.: gravar o roteiro novo quando houver créditos na ElevenLabs), substitua
`narracao/voice_proc.wav` + `narracao/words.json` e ajuste os trechos em `narracao/montar_timeline.py`; as animações
seguem os novos tempos sozinhas.

Captura do painel: rodar o `flycontrol-dash` com `npx vite dev --port 8080` e `node scripts/captura-painel-white.mjs`.
Os dados são de demonstração (`scripts/mock-painel.mjs`); nada é gravado no banco real.
