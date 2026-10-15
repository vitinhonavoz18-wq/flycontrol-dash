#!/bin/bash
# Quadros de conferência: quadros.sh COMPOSICAO seg1 seg2 ...
cd "$(dirname "$0")/.."
HS=$(ls /opt/pw-browsers/chromium_headless_shell-1194/*/headless_shell)
C=$1; shift; mkdir -p renders/quadros
for s in "$@"; do
  fr=$(python3 -c "print(round($s*30))")
  npx remotion still renders/bundle $C renders/quadros/$C-$s.png --frame=$fr --browser-executable=$HS --log=error --scale=0.5 &
  [ $(jobs -r | wc -l) -ge 3 ] && wait -n
done
wait
