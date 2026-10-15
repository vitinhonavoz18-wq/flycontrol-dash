# FlyControl — "Quanto custa vender?" (projeto editável)

Anúncio comparativo vertical (1080×1920, 30 fps) feito com [Remotion](https://remotion.dev): iFood × 99Food × FlyControl.

- `componentes/calculos.ts` — **todos os números do vídeo** (centavos inteiros). Mudou uma taxa? Mude aqui e rode
  `npx tsx scripts/verificar-calculos.ts`.
- `composicoes/roteiro.json` — tempo de cada cena em cada versão (53 s e 30 s) e os momentos dos efeitos sonoros.
- `componentes/scenes/` — as cenas: `Taxas.tsx` (1–3), `Virada.tsx` (4–5), `CemPedidos.tsx` (6), `Cardapios.tsx` (7), `Final.tsx` (8).
- `componentes/` — estúdio branco, celular/tablet 3D, tipografia 3D, moedas, nota que se divide, contadores.
- `assets/` — cardápios reais (vídeos de capa e capturas do fluxo), painel em Modo Claro, marca, foto do hambúrguer, fontes, áudio.
- `efeitos-sonoros/` — trilha e efeitos criados por código (`trilha_comparativo.py`) e as trilhas separadas em `stems/`.
- `auditoria/` — páginas oficiais salvas, scripts de captura e a conferência dos cálculos.
- `FlyControl_Comparativo_Auditoria.md` — fontes, datas, planos, taxas, cálculos e o que ficou fora da conta.

## Refazer

```bash
npm install
npx tsx scripts/verificar-calculos.ts
python3 efeitos-sonoros/trilha_comparativo.py 53s && python3 efeitos-sonoros/trilha_comparativo.py 30s
python3 scripts/exportar_legendas.py
npx remotion bundle composicoes/index.ts --out-dir renders/bundle --public-dir assets
./scripts/quadros.sh Comparativo53s 3 9 26 36   # quadros de conferência
./scripts/renderizar.sh                          # MP4 finais
```

Sem narração por enquanto (créditos da ElevenLabs insuficientes). Para acrescentar a voz depois: gere a locução,
misture com `efeitos-sonoros/stems/` e aponte a composição `Comparativo53s` para o novo áudio em `composicoes/Root.tsx`.
