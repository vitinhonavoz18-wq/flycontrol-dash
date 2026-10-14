"""Linha do tempo da versão curta (~24 s): trechos da locução já gravada, cortados nos silêncios naturais."""
import json
W = json.load(open('public/audio/words.json'))['words']
# (início no áudio original, fim no original, onde começa no vídeo curto)
SEGS = [(0.00, 5.10, 0.25),      # Seu cliente ainda precisa mandar várias mensagens… só pra fazer um pedido?
        (14.105, 19.31, 5.40),   # e se o cliente fizesse o pedido… por outro lugar? Com o FlyControl,
        (29.95, 37.11, 10.70),   # seja um açaí, um doce, um hambúrguer… ou aquele pastel especial… cada negócio com o seu próprio cardápio.
        (45.765, 49.95, 18.00),  # Seu negócio merece uma experiência de pedidos muito mais profissional.
        (49.95, 51.07, 22.30)]   # Conheça agora!
DURATION = 24.6
def place(t):
    for a, b, d in SEGS:
        if a - 1e-6 <= t < b: return t - a + d
    return None
words = []
for w in W:
    txt = w['text']
    if txt.startswith('['): continue
    if 'ˈflaj' in txt: txt = 'Fly'
    if 'kõnˈtɾɔw/' in txt: txt = 'Control' + txt.split('/')[-1]
    s = place(w['start'])
    if s is None: continue
    e = place(min(w['end'], [b for a, b, d in SEGS if a <= w['start'] < b][0]) - 1e-3)
    words.append({'text': txt, 'start': round(s, 3), 'end': round(e if e is not None else s + 0.3, 3)})
out = []
for w in words:
    if out and out[-1]['text'] == 'Fly' and w['text'].startswith('Control'):
        out[-1] = {'text': 'FlyControl' + w['text'][7:], 'start': out[-1]['start'], 'end': w['end']}
    else: out.append(w)
# "seja" começa frase nova na versão curta
for w in out:
    if w['text'] == 'Seja': w['text'] = 'seja'
def at(word, n=1):
    k = 0
    for w in out:
        if w['text'].lower().strip('.,!?…') == word.lower():
            k += 1
            if k == n: return w['start']
    raise KeyError(word)
M = {'varias': at('VÁRIAS'), 'q1End': [w for w in out if w['text'].startswith('pedido?')][0]['end'],
     'eSe': at('e'), 'porOutro': at('por'), 'outro': at('outro'), 'lugar': at('lugar'), 'fly1': at('FlyControl'),
     'acai': at('açaí'), 'doce': at('doce'), 'hamburguer': at('hambúrguer'), 'pastel': at('pastel'), 'cada': at('cada'),
     'seuNegocio': at('seu', 3), 'pedidos': at('pedidos'), 'profissional': at('profissional'), 'conheca': at('conheça'), 'end': out[-1]['end']}
json.dump({'fps': 30, 'duration': DURATION, 'segments': SEGS, 'markers': M, 'words': out}, open('src/timeline-short.json', 'w'), ensure_ascii=False, indent=1)
for k, v in M.items(): print(f'{k:12s} {v:6.2f}')
print(' '.join(w['text'] for w in out))
