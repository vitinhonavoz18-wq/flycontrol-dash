#!/bin/bash
# Renderiza as versões finais a partir de renders/bundle (rode antes: npx remotion bundle ...).
cd "$(dirname "$0")/.."
HS=$(ls /opt/pw-browsers/chromium_headless_shell-1194/*/headless_shell)
R="npx remotion render renders/bundle --browser-executable=$HS --log=error --codec=h264 --audio-codec=aac --audio-bitrate=320k --pixel-format=yuv420p --crf=16"
$R Comparativo53s renders/FlyControl_Comparativo_Taxas_53s.mp4 --concurrency=4
$R Comparativo30s renders/FlyControl_Comparativo_Taxas_30s.mp4 --concurrency=4
# Sem narração gravada, a versão "sem voz" é a mesma edição de 53 s (trilha + efeitos).
# Quando houver locução, gere o mix com voz para Comparativo53s e mantenha esta como está.
cp renders/FlyControl_Comparativo_Taxas_53s.mp4 renders/FlyControl_Comparativo_Taxas_SemVoz.mp4  # idêntico a: $R ComparativoSemVoz ...
echo FIM
