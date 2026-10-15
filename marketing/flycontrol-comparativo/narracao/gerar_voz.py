"""Locução masculina local (Piper, voz pt_BR "cadu", licença CC0), frase a frase.
Grava 3 tomadas de cada frase e fica com a que o reconhecedor de fala (Whisper) entende melhor.
Uso: python3 narracao/gerar_voz.py   →   narracao/frases/<versão>/NN.wav + escolhas.json"""
import os, json, wave, re, difflib, unicodedata, numpy as np, soundfile as sf
from scipy.signal import resample_poly
from piper import PiperVoice, SynthesisConfig
from faster_whisper import WhisperModel
R = os.path.dirname(os.path.abspath(__file__))
voz = PiperVoice.load(f'{R}/vozes/pt_BR-cadu-medium.onnx')
asr = WhisperModel('small', device='cpu', compute_type='int8')
def norm(s):
    s = unicodedata.normalize('NFKD', s.lower()); s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.replace('r$', '').replace('%', '').replace(' ', ' ')
    return re.sub(r'[^a-z0-9]+', ' ', s).strip().replace('fly control', 'flycontrol').replace('e food', 'ifood').replace('efood', 'ifood')
escolhas = {}
for versao, frases in json.load(open(f'{R}/frases.json')).items():
    os.makedirs(f'{R}/frases/{versao}', exist_ok=True)
    escolhas[versao] = []
    for i, (cena, at, txt, esperado, escrito) in enumerate(frases):
        melhor = None
        for take, ls in enumerate([0.95, 0.92, 0.98]):
            tmp = f'{R}/frases/{versao}/{i:02d}_t{take}.wav'
            with wave.open(tmp, 'wb') as w:
                voz.synthesize_wav(txt, w, syn_config=SynthesisConfig(length_scale=ls * (0.9 if versao == '30s' else 1), noise_scale=0.5, noise_w_scale=0.7))
            x, sr = sf.read(tmp)
            segs, _ = asr.transcribe(resample_poly(x, 16000, sr).astype(np.float32), language='pt', beam_size=5)
            ouvido = ' '.join(s.text.strip() for s in segs)
            nota = difflib.SequenceMatcher(None, norm(ouvido), norm(esperado)).ratio()
            if melhor is None or nota > melhor[0]: melhor = (nota, tmp, ouvido)
        for take in range(3):
            f = f'{R}/frases/{versao}/{i:02d}_t{take}.wav'
            if f == melhor[1]: os.replace(f, f'{R}/frases/{versao}/{i:02d}.wav')
            else: os.remove(f)
        dur = sf.info(f'{R}/frases/{versao}/{i:02d}.wav').duration
        escolhas[versao].append({"cena": cena, "em": at, "texto": txt, "escrito": escrito, 'ouvido': melhor[2], 'nota': round(melhor[0], 3), 'duracao': round(dur, 2)})
        print(versao, i, cena, f'{melhor[0]:.2f}', f'{dur:.2f}s', melhor[2])
json.dump(escolhas, open(f'{R}/escolhas.json', 'w'), ensure_ascii=False, indent=1)
