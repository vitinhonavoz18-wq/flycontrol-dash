#!/bin/bash
# Nivela o mix final em -14 LUFS (padrão de Instagram/TikTok/YouTube) e aplica o MESMO ganho às versões separadas.
set -e
cd "$(dirname "$0")/.."
I=$(ffmpeg -hide_banner -nostats -i audio/mix_pre.wav -af ebur128=peak=true -f null - 2>&1 | grep -A1 "Integrated loudness" | grep "I:" | awk '{print $2}')
G=$(python3 -c "print(-14.0 - ($I))")
echo "loudness=$I LUFS ganho=$G dB"
LIM="alimiter=limit=0.891:attack=3:release=60:level=false"
ffmpeg -loglevel error -y -i audio/mix_pre.wav -af "volume=${G}dB,$LIM" -ar 48000 -c:a pcm_s24le public/audio/mix_final.wav
ffmpeg -loglevel error -y -i audio/bed.wav -af "volume=${G}dB,$LIM" -ar 48000 -c:a pcm_s24le public/audio/bed_final.wav
ffmpeg -loglevel error -y -i audio/voice_placed.wav -af "volume=${G}dB,$LIM" -ar 48000 -c:a pcm_s24le public/audio/voice_final.wav
ffmpeg -hide_banner -nostats -i public/audio/mix_final.wav -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|Peak):" 
