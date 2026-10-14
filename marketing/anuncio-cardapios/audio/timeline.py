"""Monta a linha do tempo do anúncio a partir dos tempos REAIS da locução (words.json).
A locução é cortada só nos silêncios naturais e reposicionada com respiros extras."""
import json
W = json.load(open('public/audio/words.json'))['words']
# (início no áudio original, fim no original, onde começa no vídeo)
SEGS = [(0.00, 11.25, 1.20), (12.40, 17.95, 13.60), (17.95, 23.30, 19.55),
        (23.30, 36.97, 25.40), (36.97, 44.56, 41.00), (44.56, 51.07, 49.10)]
DURATION = 59.0
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
    s = place(w['start']); e = place(w['end'] - 1e-3)
    if s is None: continue
    words.append({'text': txt, 'start': round(s, 3), 'end': round(e if e is not None else s + 0.3, 3)})
# junta "Fly"+"Control" numa palavra só
out = []
for w in words:
    if out and out[-1]['text'] == 'Fly' and w['text'].startswith('Control'):
        out[-1] = {'text': 'FlyControl' + w['text'][7:], 'start': out[-1]['start'], 'end': w['end']}
    else: out.append(w)
def at(word, n=1):
    k = 0
    for w in out:
        if w['text'].lower().strip('.,!?…') == word.lower():
            k += 1
            if k == n: return w['start']
    raise KeyError(word)
M = {
  'q1End': [w for w in out if w['text'].startswith('pedido?')][0]['end'],
  'preco': at('Pergunta'), 'audio': at('manda'), 'mudaPedido': at('muda'), 'mudaTudo': at('muda', 2),
  'mas': at('Mas'), 'porOutro': at('por'), 'outro': at('outro'), 'lugar': at('lugar'),
  'fly1': at('FlyControl'), 'imagine': at('Imagine'), 'acai': at('açaí'), 'doce': at('doce'),
  'hamburguer': at('hambúrguer'), 'pastel': at('pastel'), 'cada': at('cada'),
  'escolha': at('Escolha'), 'personalize': at('Personalize'), 'adicione': at('Adicione'),
  'carrinho': at('carrinho'), 'confira': at('confira'), 'tudo': at('Tudo', 2),
  'fly2': at('FlyControl', 2), 'seuNegocio': at('negócio', 2), 'conheca': at('Conheça'),
  'end': out[-1]['end'],
}
json.dump({'fps': 30, 'duration': DURATION, 'segments': SEGS, 'markers': M, 'words': out},
          open('src/timeline.json', 'w') if __import__('os').path.isdir('src') else open('timeline.json', 'w'), ensure_ascii=False, indent=1)
for k, v in M.items(): print(f'{k:12s} {v:6.2f}')
