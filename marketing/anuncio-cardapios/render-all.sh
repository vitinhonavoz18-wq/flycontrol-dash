#!/bin/bash
# Renderiza todas as versões finais a partir do pacote em out/bundle.
cd "$(dirname "$0")"
HS=$(ls /opt/pw-browsers/chromium_headless_shell-1194/*/headless_shell)
R="npx remotion render out/bundle --browser-executable=$HS --concurrency=4 --log=error --codec=h264 --crf=16 --audio-codec=aac --audio-bitrate=320k"
$R Anuncio out/final/FlyControl-anuncio-completo.mp4
$R SemNarracao out/final/FlyControl-sem-narracao.mp4
$R Resumido out/final/FlyControl-anuncio-resumido.mp4
$R PreviewTransicao out/final/FlyControl-preview-transicao.mp4
echo FIM
