"""Monta as linhas do tempo da White Edition a partir da locução JÁ GRAVADA (voz Bianca, ElevenLabs),
cortada só nos silêncios naturais. Tempos de cada palavra: words.json (alinhamento da própria ElevenLabs)."""
import json, os
D = os.path.dirname(os.path.abspath(__file__))
W = json.load(open(f'{D}/words.json'))['words']
VERSOES = {
  # (início no áudio original, fim no original, onde começa no vídeo)
  'v2': {'dur': 36.2, 'segs': [
      (0.00, 11.25, 0.25),     # Seu cliente ainda precisa mandar VÁRIAS mensagens… só pra fazer um pedido? Pergunta o preço… manda áudio… muda o pedido… e depois muda tudo de novo!
      (14.105, 17.95, 12.15),  # e se o cliente fizesse o pedido… por OUTRO lugar?
      (18.135, 23.30, 16.60),  # Com o FlyControl, existe um jeito muito mais simples, moderno e profissional.
      (29.95, 37.11, 22.10),   # Seja um açaí, um doce, um hambúrguer… ou aquele pastel especial… cada negócio com o seu próprio cardápio.
      (45.765, 49.95, 29.45),  # Seu negócio merece uma experiência de pedidos muito mais profissional.
      (49.95, 51.07, 34.30)]}, # Conheça agora!
  '25s': {'dur': 24.8, 'segs': [
      (0.00, 5.10, 0.25), (14.105, 19.31, 5.40), (29.95, 37.11, 10.70), (45.765, 49.95, 18.00), (49.95, 51.07, 22.45)]},
}
def build(name, cfg):
    segs = cfg['segs']
    def place(t):
        for a, b, d in segs:
            if a - 1e-6 <= t < b: return t - a + d
    words = []
    for w in W:
        txt = w['text']
        if txt.startswith('['): continue
        if 'ˈflaj' in txt: txt = 'Fly'
        if 'kõnˈtɾɔw/' in txt: txt = 'Control' + txt.split('/')[-1]
        s = place(w['start'])
        if s is None: continue
        seg_end = [b for a, b, d in segs if a <= w['start'] < b][0]
        e = place(min(w['end'], seg_end) - 1e-3)
        words.append({'text': txt, 'start': round(s, 3), 'end': round(e if e is not None else s + 0.3, 3)})
    out = []
    for w in words:
        if out and out[-1]['text'] == 'Fly' and w['text'].startswith('Control'):
            out[-1] = {'text': 'FlyControl' + w['text'][7:], 'start': out[-1]['start'], 'end': w['end']}
        else: out.append(w)
    for w in out:
        if w['text'] == 'Seja' and name == '25s': w['text'] = 'seja'
    norm = lambda s: s.lower().strip('.,!?…')
    def at(word, n=1, after=0.0):
        k = 0
        for w in out:
            if w['start'] >= after and norm(w['text']) == word:
                k += 1
                if k == n: return w['start']
        return None
    def end(word, after=0.0):
        for w in out:
            if w['start'] >= after and norm(w['text']) == word: return w['end']
    q1 = [w for w in out if w['text'].startswith('pedido?')][0]['end']
    has_chaos = at('pergunta') is not None
    lugar = at('lugar')
    M = {
      'varias': at('várias'), 'so': at('só'), 'q1End': q1,
      'preco': at('pergunta'), 'audio': at('manda'), 'mudaPedido': at('muda'), 'mudaTudo': at('muda', 2),
      'chaosEnd': end('novo') if has_chaos else q1,
      'eSe': at('e', after=(end('novo') if has_chaos else q1) + 0.2), 'porOutro': at('por', after=q1), 'outro': at('outro'), 'lugar': lugar, 'lugarEnd': end('lugar'),
      'fly1': at('flycontrol'), 'simples': at('simples'), 'moderno': at('moderno'), 'profissional1': at('profissional') if at('simples') else None,
      'seja': at('seja'), 'acai': at('açaí'), 'doce': at('doce'), 'hamburguer': at('hambúrguer'), 'pastel': at('pastel'),
      'cada': at('cada'), 'proprio': at('próprio'), 'cardapio': at('cardápio', after=at('cada')), 'cardapioEnd': end('cardápio', after=at('cada')),
      'seuNegocio': at('negócio', after=at('cardápio', after=at('cada'))) - 0.24, 'pedidos': at('pedidos', after=at('cada')),
      'profissional2': at('profissional', after=at('cada')), 'profissional2End': end('profissional', after=at('cada')),
      'conheca': at('conheça'), 'end': out[-1]['end'],
    }
    M = {k: (round(v, 3) if v is not None else None) for k, v in M.items()}
    M['freeze'] = round(M['chaosEnd'] + 0.25, 3)
    tl = {'fps': 30, 'duration': cfg['dur'], 'segments': segs, 'markers': M, 'words': out, 'hasChaos': has_chaos}
    json.dump(tl, open(f'{D}/../composicoes/timeline-{name}.json', 'w'), ensure_ascii=False, indent=1)
    print(name, cfg['dur'], {k: v for k, v in M.items()})
    print('   ', ' '.join(w['text'] for w in out))
for n, c in VERSOES.items(): build(n, c)
