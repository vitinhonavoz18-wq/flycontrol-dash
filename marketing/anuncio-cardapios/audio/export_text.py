"""Gera legendas (.srt), timeline com marcadores (.csv) a partir de src/timeline.json."""
import json, re
T = json.load(open('src/timeline.json'))
W = T['words']
groups, cur = [], []
for w in W:
    if cur and (len(cur) >= 5 or w['start'] - cur[-1]['end'] > 0.45):
        groups.append(cur); cur = []
    cur.append(w)
    if re.search(r'[.!?]$', w['text']): groups.append(cur); cur = []
if cur: groups.append(cur)
def ts(s):
    ms = int(round(s * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); sec, ms = divmod(ms, 1000)
    return f'{h:02d}:{m:02d}:{sec:02d},{ms:03d}'
def srt(groups, shift=0.0, keep=None):
    out, n = [], 0
    for gi, g in enumerate(groups):
        a, b = g[0]['start'], g[-1]['end'] + 0.3
        if gi + 1 < len(groups): b = min(b, groups[gi + 1][0]['start'] - 0.02)
        if keep:
            seg = next(((f, to, at) for f, to, at in keep if f <= a < to), None)
            if not seg: continue
            a, b = a - seg[0] + seg[2], min(b, seg[1]) - seg[0] + seg[2]
        n += 1
        txt = ' '.join(w['text'] for w in g).replace('OUTRO', 'outro').replace('VÁRIAS', 'várias')
        out.append(f'{n}\n{ts(a)} --> {ts(b)}\n{txt}\n')
    return '\n'.join(out)
open('entregas/FlyControl-anuncio-completo.srt', 'w').write(srt(groups))
# versão resumida: mesmos trechos do Root.tsx
SHORT = [(13.4, 25.4), (36.6, 41.0), (48.9, 59.0)]
keep, at = [], 0
for f, to in SHORT: keep.append((f, to, at)); at += to - f
open('entregas/FlyControl-anuncio-resumido.srt', 'w').write(srt(groups, keep=keep))
M = T['markers']
desc = {
 'q1End': 'fim da 1ª pergunta → 1ª notificação + "ASSIM?"', 'preco': '"Pergunta o preço" → destaque da mensagem + PREÇO?',
 'audio': '"manda áudio" → forma de onda animada + ÁUDIO!', 'mudaPedido': '"muda o pedido" → mensagem desliza/riscada + TROCA O PEDIDO!',
 'mudaTudo': '"muda tudo de novo" → notificações aceleram + DE NOVO!', 'mas': '"Mas…" → pausa dramática, conversa congelada',
 'porOutro': '"por"', 'outro': '"OUTRO" → maior impacto tipográfico', 'lugar': '"lugar?"',
 'fly1': '"FlyControl" → IMPACTO: flash, reconstrução do cardápio real (Açaí e Love)', 'imagine': '"Imagine" → nome do estabelecimento',
 'acai': '"açaí" → produto real Açaí Deus Proverá', 'doce': '"doce" → produto real D\'lua Doces', 'hamburguer': '"hambúrguer" → produto real Açaí Deus Proverá',
 'pastel': '"pastel" → produto real Alpha Pastelaria', 'cada': '"cada negócio…" → 5 vídeos de capa lado a lado',
 'escolha': '"Escolha" → toque no produto + ESCOLHA.', 'personalize': '"Personalize" → adicionais reais + PERSONALIZE.',
 'adicione': '"Adicione"', 'carrinho': '"carrinho" → botão do carrinho aparece', 'confira': '"confira" → carrinho real abre + FINALIZE.',
 'tudo': '"Tudo em uma experiência…"', 'fly2': '"FlyControl" → logo oficial surge', 'seuNegocio': '"negócio" → TRANSFORME SEUS PEDIDOS.',
 'conheca': '"Conheça agora!" → botão CONHEÇA O FLYCONTROL', 'end': 'fim da narração',
}
rows = ['segundo;quadro (30fps);marcador;o que acontece']
for k, v in sorted(M.items(), key=lambda kv: kv[1]):
    rows.append(f'{v:.2f};{round(v*30)};{k};{desc.get(k, "")}')
extra = [(12.35, 'congelamento', 'música corta, conversa congela'), (18.42, 'virada+0.3', 'riser começa'), (18.92, 'virada+0.8', 'fragmentação da conversa'),
         (19.62, 'virada+1.5', 'partículas aceleram'), (55.8, 'assinatura', 'assinatura sonora + brilho no logo'), (59.0, 'fim', 'fim do vídeo')]
for v, k, d in extra: rows.append(f'{v:.2f};{round(v*30)};{k};{d}')
rows = [rows[0]] + sorted(rows[1:], key=lambda r: float(r.split(';')[0]))
open('entregas/FlyControl-timeline-marcadores.csv', 'w').write('\n'.join(rows) + '\n')
print(open('entregas/FlyControl-anuncio-completo.srt').read()[:600])
