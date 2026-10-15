"""Posiciona as frases da locução nas cenas de cada versão e trata o som (velocidade, graves, compressão, presença).
Uso: python3 narracao/montar_voz.py   →   narracao/voz_<versão>.wav + narracao/tempos_<versão>.json"""
import os, json, subprocess, numpy as np, soundfile as sf
R = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.dirname(R)
RT = json.load(open(f'{RAIZ}/composicoes/roteiro.json')); ESC = json.load(open(f'{R}/escolhas.json'))
SR = 48000; TEMPO = {'53s': 1.1, '30s': 1.1}; GAP = 0.12
FX = 'highpass=f=85,equalizer=f=220:t=q:w=1:g=-2,equalizer=f=3200:t=q:w=1.2:g=3,acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=3'
def tratar(src, tempo):
    o = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', src, '-af', f'atempo={tempo},{FX},aresample={SR}', '-ac', '1', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(o, dtype=np.float32).copy()
    nz = np.where(np.abs(x) > 0.01)[0]  # corta silêncio do começo/fim
    return x[max(0, nz[0] - 400): nz[-1] + 2400] if len(nz) else x
for versao, linhas in ESC.items():
    V = RT['versoes'][versao]; cen = V['cenas']; nom = RT['nominal']
    voz = np.zeros(int(V['duracao'] * SR)); tempos = []; fim_ant = 0.0
    for i, l in enumerate(linhas):
        a, b = cen[l['cena']][:2]; n = cen[l['cena']][2] if len(cen[l['cena']]) > 2 else nom[l['cena']]
        quer = a + l['em'] / (n / (b - a))
        x = tratar(f'{R}/frases/{versao}/{i:02d}.wav', TEMPO[versao])
        ini = max(quer, fim_ant + GAP); fim = ini + len(x) / SR
        j = int(ini * SR); voz[j:j + len(x)] += x[:len(voz) - j]
        tempos.append({'cena': l['cena'], 'inicio': round(ini, 3), 'fim': round(fim, 3), 'atraso': round(ini - quer, 2), 'fim_da_cena': b, 'escrito': l['escrito']})
        print(versao, l['cena'], f'{ini:6.2f}–{fim:6.2f}', f'atraso {ini - quer:+.2f}', f'passa da cena {fim - b:+.2f}' if fim > b else '')
        fim_ant = fim
    pico = np.abs(voz).max(); voz *= 0.89 / pico
    sf.write(f'{R}/voz_{versao}.wav', voz, SR, subtype='PCM_24')
    json.dump(tempos, open(f'{R}/tempos_{versao}.json', 'w'), ensure_ascii=False, indent=1)
