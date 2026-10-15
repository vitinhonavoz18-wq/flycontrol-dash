#!/usr/bin/env bash
# Refaz trilha + efeitos + mixagem e normaliza para -14 LUFS (padrão de Reels).
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/audio.py
cd public/audio
J=$(ffmpeg -nostats -i mix_bruto.wav -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
M=$(echo "$J" | python3 -c "import json,sys;d=json.load(sys.stdin);print(f\"measured_I={d['input_i']}:measured_TP={d['input_tp']}:measured_LRA={d['input_lra']}:measured_thresh={d['input_thresh']}:offset={d['target_offset']}\")")
ffmpeg -v error -y -i mix_bruto.wav -af "loudnorm=I=-14:TP=-1.5:LRA=11:$M:linear=true,aresample=48000" -c:a pcm_s24le mix_final.wav
ffmpeg -nostats -i mix_final.wav -af ebur128=peak=true -f null - 2>&1 | grep -E '^\s+(I:|Peak:)'
