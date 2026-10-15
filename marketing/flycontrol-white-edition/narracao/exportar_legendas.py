"""Legendas .srt e timeline de marcadores (.csv) a partir das linhas do tempo da White Edition."""
import json, re, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def groups(W):
    G, cur = [], []
    for w in W:
        if cur and (len(cur) >= 5 or w['start'] - cur[-1]['end'] > 0.45): G.append(cur); cur = []
        cur.append(w)
        if re.search(r'[.!?]$', w['text']): G.append(cur); cur = []
    if cur: G.append(cur)
    out = []
    for g in G:
        if out and len(out[-1]) == 1 and len(out[-1][0]['text']) <= 2: out[-1] = out[-1] + g
        else: out.append(g)
    return out
def ts(s):
    ms = int(round(s * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); sec, ms = divmod(ms, 1000)
    return f'{h:02d}:{m:02d}:{sec:02d},{ms:03d}'
for nome, arq in [('v2', 'FlyControl_White_Edition_Legendas.srt'), ('25s', 'FlyControl_White_Edition_25s_Legendas.srt')]:
    T = json.load(open(f'{R}/composicoes/timeline-{nome}.json'))
    G = groups(T['words']); lines = []
    for i, g in enumerate(G):
        a, b = g[0]['start'], g[-1]['end'] + 0.3
        if i + 1 < len(G): b = min(b, G[i + 1][0]['start'] - 0.02)
        txt = ' '.join(w['text'] for w in g).replace('OUTRO', 'outro').replace('VÁRIAS', 'várias')
        lines.append(f'{i + 1}\n{ts(a)} --> {ts(b)}\n{txt}\n')
    open(f'{R}/renders/{arq}', 'w').write('\n'.join(lines))
    M = T['markers']
    rows = ['segundo;quadro (30 fps);marcador']
    for k, v in sorted(((k, v) for k, v in M.items() if v is not None), key=lambda kv: kv[1]): rows.append(f'{v:.3f};{round(v * 30)};{k}')
    open(f'{R}/renders/timeline-marcadores-{nome}.csv', 'w').write('\n'.join(rows) + '\n')
    print(nome, len(G), 'legendas')
