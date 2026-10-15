#!/bin/bash
# junta quadros lado a lado: folha.sh saida.png a.png b.png ...
o=$1; shift; n=$#; args=(); for f in "$@"; do args+=(-i "$f"); done
ffmpeg -loglevel error -y "${args[@]}" -filter_complex "hstack=$n,scale=$((n*380)):-1" "$o"
