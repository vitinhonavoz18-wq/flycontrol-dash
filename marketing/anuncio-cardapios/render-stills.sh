#!/bin/bash
# Gera quadros de conferência em segundos específicos (usa o pacote já montado em out/bundle).
cd "$(dirname "$0")"
for s in "$@"; do
  fr=$(python3 -c "print(round($s*30))")
  npx remotion still out/bundle Anuncio out/frames/t$s.png --frame=$fr --browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell --log=error --scale=0.5 &
done
wait
