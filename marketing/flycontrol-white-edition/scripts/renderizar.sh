#!/bin/bash
# Renderiza as versões finais da White Edition a partir de renders/bundle.
cd "$(dirname "$0")/.."
HS=$(ls /opt/pw-browsers/chromium_headless_shell-1194/*/headless_shell)
R="npx remotion render renders/bundle --browser-executable=$HS --log=error --codec=h264 --audio-codec=aac --audio-bitrate=320k --pixel-format=yuv420p"
$R WhiteEditionV2 renders/FlyControl_White_Edition_V2.mp4 --concurrency=4 --crf=16
$R WhiteEdition25s renders/FlyControl_White_Edition_25s.mp4 --concurrency=4 --crf=16
$R WhiteEditionSemVoz renders/FlyControl_White_Edition_SemVoz.mp4 --concurrency=4 --crf=16
$R WhiteEditionV2 renders/FlyControl_White_Edition_V2_Master_4K.mp4 --concurrency=3 --crf=16 --scale=2
echo FIM
