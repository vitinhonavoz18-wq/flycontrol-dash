#!/bin/bash
# Renderiza as versões finais a partir de renders/bundle (rode antes: npx remotion bundle ...).
cd "$(dirname "$0")/.."
HS=$(ls /opt/pw-browsers/chromium_headless_shell-1194/*/headless_shell)
R="npx remotion render renders/bundle --browser-executable=$HS --log=error --codec=h264 --audio-codec=aac --audio-bitrate=320k --pixel-format=yuv420p --crf=16"
$R Comparativo53s renders/FlyControl_Comparativo_Taxas_53s.mp4 --concurrency=4
$R Comparativo30s renders/FlyControl_Comparativo_Taxas_30s.mp4 --concurrency=4
$R ComparativoSemVoz renders/FlyControl_Comparativo_Taxas_SemVoz.mp4 --concurrency=4
echo FIM
