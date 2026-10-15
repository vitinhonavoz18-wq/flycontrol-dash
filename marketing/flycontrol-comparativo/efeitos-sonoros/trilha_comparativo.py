"""Trilha + efeitos + mix do comparativo "Quanto custa vender?" (com e sem narração).
Tech corporate, 120 bpm: Mi menor (custos) → Sol maior (virada FlyControl).
Os tempos vêm de composicoes/roteiro.json: cada evento é (cena, tempo nominal) e é convertido para a versão.
Uso: python3 efeitos-sonoros/trilha_comparativo.py 53s|30s"""
import sys, os, json, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, soundfile as sf
import instrumentos as I
from instrumentos import t, env, bp, lp, hp, note, verb, kick, clap, hat, saw, pad, pluck, bass, boom, whoosh, riser, tick, uiclick, shatter, chime, zap, SR, rng

NOME = sys.argv[1] if len(sys.argv) > 1 else '53s'
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = json.load(open(f'{RAIZ}/composicoes/roteiro.json'))
V = R['versoes'][NOME]; DUR = V['duracao']; CEN = V['cenas']; NOM = R['nominal']
I.set_duration(DUR); N = I.N
_add = I.Bus.add
def _add_seguro(self, at, x, g=1.0, pan=0.0):  # evento antes do 0 s: corta o início em vez de falhar
    if at < 0: x = x[int(-at * SR):]; at = 0
    _add(self, at, x, g, pan)
I.Bus.add = _add_seguro
mus, sfx = I.Bus(), I.Bus()
B = 60 / 120

def nomv(cena):  # duração nominal usada nesta versão (o 3º número corta a cena)
    return CEN[cena][2] if len(CEN[cena]) > 2 else NOM[cena]
def vt(cena, x):  # tempo nominal da cena → segundos no vídeo desta versão
    a, b = CEN[cena][:2]; return a + x / (nomv(cena) / (b - a))
def tem(c): return c in CEN

# ---------- timbres próprios ----------
def marimba(m, d=0.5):
    x = t(d); fr = note(m)
    return (np.sin(2 * np.pi * fr * x) + 0.35 * np.sin(2 * np.pi * 4 * fr * x) * np.exp(-x / 0.03)) * env(len(x), 0.002, 0.12)
def bloop(f0=900):
    x = t(0.16); fr = f0 * (1 + 0.6 * np.exp(-x / 0.02))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * env(len(x), 0.002, 0.05)
def stab(ch, d=0.45, cut=5000):
    return verb(lp(sum(saw(note(m), d, (0, 9, -9, 15)) for m in ch) / len(ch), cut) * env(int(d * SR), 0.004, d * 0.4), 0.25)
def clink(f0=2400):  # moeda caindo: parciais metálicas inarmônicas
    x = t(0.45); y = np.zeros(len(x))
    for r, g, d in [(1, 1, 0.12), (1.52, 0.7, 0.09), (2.31, 0.5, 0.07), (3.17, 0.35, 0.05)]:
        y += g * np.sin(2 * np.pi * f0 * r * x) * np.exp(-x / d)
    k = hp(rng.standard_normal(len(x)), 5000) * env(len(x), 0.0003, 0.004)
    return (y * env(len(x), 0.0005, 0.2) + 0.5 * k) * 0.5
def freeze():  # "congela": nota que cai como fita parando
    x = t(0.6); fr = 520 * np.exp(-x / 0.18) + 40
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * env(len(x), 0.002, 0.25)

# ---------- estrutura ----------
S2 = vt('s2', 0); FIM3 = vt('s3', nomv('s3'))
IMP = vt('s5', 0.5)
S8 = vt('s8', 0)
BREAK = vt('s4', 0) if tem('s4') else FIM3 - 0.05

# 1) curiosidade (cena 1): marimba em Mi menor, pulso que cresce
ARP = [64, 67, 71, 76, 71, 67]
i = 0; s = 0.15
while s < S2 - 0.05:
    mus.add(s, marimba(ARP[i % 6] + (12 if i % 8 == 7 else 0)), 0.17, pan=(-0.3 if i % 2 else 0.3)); i += 1; s += B / 2
M1 = vt('s1', 1.7)
for s in np.arange(M1, S2 - 0.05, B): mus.add(s, kick(90, 42, 0.22), 0.4)
for s in np.arange(M1 + B / 2, S2 - 0.05, B): mus.add(s, hat(0.03), 0.12, pan=0.2)
x = t(S2); mus.add(0, lp(saw(note(40), S2, (0, 6, -6)), 280) * np.minimum(1, x / 1.2) * np.minimum(1, (S2 - x) / 0.03) * 0.16)

# 2) groove de tensão (cenas 2–3): Em – C – Am – B, baixo seco
PROG_T = [[64, 67, 71], [60, 64, 67], [57, 60, 64], [59, 63, 66]]
ROOT_T = [40, 36, 45, 47]
n = int((BREAK - S2) / B)
for k in range(n):
    s = S2 + k * B; bar = k // 4; ch = PROG_T[bar % 4]; r = ROOT_T[bar % 4]
    mus.add(s, kick(150, 45, 0.28), 0.7)
    if k % 2 == 1: mus.add(s, clap(), 0.3)
    mus.add(s + B / 2, hat(0.04), 0.16, pan=0.25); mus.add(s + B / 4, hat(0.012), 0.06, pan=-0.3)
    mus.add(s + B / 2, bass(r, B / 2 - 0.03), 0.38)
    if k % 4 == 0: mus.add(s, verb(pad([c + 12 for c in ch], B * 4, 1400), 0.3), 0.08)
    mus.add(s + B / 2 * (k % 2), verb(pluck(ch[k % 3] + 24, 0.25, 3800), 0.3), 0.05, pan=(-0.4 if k % 2 else 0.4))
# respiro na troca iFood → 99Food
mus.add(vt('s3', 0) - 0.3, whoosh(0.6, 300, 5000), 0.15)

# 3) quebra (cena 4, se existir): a música some, pad grave e relógio; riser até o impacto
if IMP - BREAK > 0.8:
    mus.add(BREAK, pad([52, 59, 64, 67], IMP - BREAK, 650), 0.22)
    for s in np.arange(BREAK + 0.25, IMP - 0.3, B): mus.add(s, tick(), 0.28)
    for s in np.arange(BREAK + 0.25, IMP - 0.3, 2 * B): mus.add(s, kick(70, 38, 0.3), 0.22)
RL = min(2.2, IMP - BREAK + 0.6)
sfx.add(IMP - RL, riser(RL - 0.02), 0.55)
sfx.add(IMP - 0.5, whoosh(0.5, 900, 10000), 0.3)

# 4) groove principal (cenas 5–7): Sol maior G – D – Em – C, mais brilhante
PROG = [[67, 71, 74], [62, 66, 69], [64, 67, 71], [60, 64, 67]]
ROOT = [43, 38, 40, 36]
LIFT = vt('s6', 5.6) if tem('s6') else None
n = int((S8 - IMP) / B)
for k in range(n):
    s = IMP + k * B; bar = k // 4; ch = PROG[bar % 4]; r = ROOT[bar % 4]
    lift = LIFT is not None and s >= LIFT - 0.01
    mus.add(s, kick(160, 45, 0.3), 0.85)
    if k % 2 == 1: mus.add(s, clap(), 0.4)
    mus.add(s + B / 2, hat(0.05), 0.2, pan=0.25); mus.add(s + B / 4, hat(0.015), 0.07, pan=-0.3); mus.add(s + 3 * B / 4, hat(0.015), 0.07, pan=-0.3)
    mus.add(s + B / 2, bass(r, B / 2 - 0.03), 0.42); mus.add(s, bass(r, B / 4), 0.2)
    if k % 2 == 0: mus.add(s + B / 2, stab([c + 12 for c in ch], 0.3), 0.07 if not lift else 0.1)
    for q in range(2): mus.add(s + q * B / 2, verb(pluck(ch[(k * 2 + q) % 3] + 24, 0.28, 4500), 0.3), 0.06, pan=(-0.45 if q else 0.45))
    if lift and k % 4 == 0: mus.add(s, verb(pad([c + 12 for c in ch], B * 4, 2600), 0.4), 0.09)
mus.add(IMP, stab([c + 12 for c in PROG[0]] + [79], 1.4, 7000), 0.22)
if LIFT: mus.add(LIFT, stab([79, 83, 86, 91], 1.2, 8000), 0.16)

# 5) encerramento (cena 8): pad aberto, pulso suave, assinatura sonora
mus.add(S8, verb(pad([55, 62, 67, 71, 74], DUR - S8, 2600), 0.5), 0.22)
mus.add(S8, bass(43, DUR - S8 - 0.2), 0.2)
for s in np.arange(S8, DUR - 0.8, B): mus.add(s, kick(130, 45, 0.3), 0.45); mus.add(s + B / 2, hat(0.04), 0.1)

# ---------- efeitos sincronizados (roteiro.json) ----------
for cena, x, tipo in R['eventos']:
    if not tem(cena) or x > nomv(cena) - 0.3: continue
    at = vt(cena, x)
    if tipo == 'whoosh': sfx.add(at - 0.1, whoosh(0.5, 300, 5000), 0.26)
    elif tipo == 'texto': sfx.add(at - 0.04, whoosh(0.22, 1500, 8000), 0.12); sfx.add(at, tick(), 0.25)
    elif tipo == 'multiplica':
        sfx.add(at, whoosh(0.6, 400, 6000), 0.25)
        for q in range(3): sfx.add(at + 0.12 * q, verb(chime(76 + 3 * q, 0.6), 0.3), 0.08, pan=(-0.5 + 0.5 * q))
    elif tipo == 'pop': sfx.add(at, bloop(950), 0.3); sfx.add(at, tick(), 0.15)
    elif tipo == 'hit': sfx.add(at, kick(200, 60, 0.15), 0.4); sfx.add(at, zap(0.18), 0.16); sfx.add(at, clap(), 0.12)
    elif tipo == 'big': sfx.add(at, boom(1.2), 0.45); sfx.add(at - 0.05, whoosh(0.3, 600, 9000), 0.2)
    elif tipo == 'contador':
        d = {'s2': 1.25, 's3': 1.25, 's5': 1.0, 's6': 1.6}.get(cena, 1.0)
        dd = d / (nomv(cena) / (CEN[cena][1] - CEN[cena][0]))
        for q, s in enumerate(np.arange(at, at + dd, 0.055)): sfx.add(s, tick(), 0.22 * (1 - 0.4 * q * 0.055 / dd), pan=0.2)
        sfx.add(at + dd, uiclick(), 0.35)
    elif tipo == 'moedas':
        nm = 9 if cena == 's2' else 5
        for q in range(nm): sfx.add(vt(cena, 4.2 + (q / nm) * 1.1 * 0.7 + 0.55), clink(2200 + 180 * (q % 4)), 0.32, pan=0.35)
        sfx.add(vt(cena, 3.85), whoosh(0.4, 800, 7000), 0.18)  # a nota se divide
    elif tipo == 'congela': sfx.add(at - 0.02, freeze(), 0.2); sfx.add(at, boom(1.4), 0.42)
    elif tipo == 'fragmenta': sfx.add(at, shatter(0.9), 0.3); sfx.add(at + 0.05, whoosh(0.9, 200, 6000), 0.2)
    elif tipo == 'impacto':
        sfx.add(at, boom(3.0), 0.95); sfx.add(at, verb(chime(79, 2.2), 0.55), 0.2); sfx.add(at, shatter(0.8), 0.14)
        sfx.add(at + 0.05, whoosh(0.9, 300, 4000, up=False), 0.25)
    elif tipo == 'moeda1': sfx.add(at, whoosh(0.3, 1200, 8000), 0.14); sfx.add(vt(cena, 4.05), clink(2600), 0.42, pan=0.4)
    elif tipo == 'pedidos':
        for q in range(19): sfx.add(vt(cena, 0.2 + q * 0.06 + 0.05), marimba(67 + [0, 2, 4, 7, 9][q % 5] + 12 * (q // 10), 0.25), 0.1, pan=(-0.5 + q / 18))
    elif tipo == 'toque': sfx.add(at, uiclick(), 0.45)
    elif tipo == 'carrinho': sfx.add(at, bloop(1200), 0.32); sfx.add(at + 0.05, verb(chime(83, 0.8), 0.3), 0.12)
    elif tipo == 'cta': sfx.add(at, boom(1.8), 0.5); sfx.add(at, zap(0.22), 0.2)
    elif tipo == 'assinatura':
        for q, m in enumerate([67, 71, 74, 79]): sfx.add(at + q * 0.12, verb(chime(m, 2.2), 0.6), 0.19 - q * 0.02, pan=(-0.3 + 0.2 * q))
        sfx.add(at, whoosh(0.6, 2000, 12000), 0.15)

# ---------- mix: -14 LUFS, pico real perto de -1 dBTP ----------
fade = np.ones(N); fl = int(0.6 * SR); fade[-fl:] = np.linspace(1, 0, fl) ** 2
M_ = mus.st() * 0.3 * fade[:, None]; S_ = sfx.st() * 0.45 * fade[:, None]
TMP = f'{RAIZ}/efeitos-sonoros/tmp'; os.makedirs(TMP, exist_ok=True)
sf.write(f'{TMP}/mix_{NOME}.wav', M_ + S_, SR, subtype='FLOAT')
sf.write(f'{TMP}/musica_{NOME}.wav', M_, SR, subtype='FLOAT'); sf.write(f'{TMP}/efeitos_{NOME}.wav', S_, SR, subtype='FLOAT')
def lufs(f):
    o = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    L = [l for l in o.splitlines() if l.strip().startswith(('I:', 'Peak:'))]
    return float(L[-2].split()[1]), float(L[-1].split()[1])
def out(src, dst, gain):
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-af', f'volume={gain}dB,alimiter=limit=0.83:attack=3:release=60:level=false', '-ar', '48000', '-c:a', 'pcm_s24le', dst], check=True)
g = -14 - lufs(f'{TMP}/mix_{NOME}.wav')[0]
A = f'{RAIZ}/assets/audio'; os.makedirs(A, exist_ok=True)
out(f'{TMP}/mix_{NOME}.wav', f'{A}/comparativo_{NOME}.wav', g)
# trilhas separadas (mesmo ganho do mix) para quem for acrescentar a locução depois
ST = f'{RAIZ}/efeitos-sonoros/stems'; os.makedirs(ST, exist_ok=True)
out(f'{TMP}/musica_{NOME}.wav', f'{ST}/musica_{NOME}.wav', g); out(f'{TMP}/efeitos_{NOME}.wav', f'{ST}/efeitos_{NOME}.wav', g)
print(NOME, 'mix (LUFS, pico dBTP):', lufs(f'{A}/comparativo_{NOME}.wav'))

# ---------- versão com locução (narracao/voz_<versão>.wav, gerada por narracao/montar_voz.py) ----------
VOZ = f'{RAIZ}/narracao/voz_{NOME}.wav'
if os.path.exists(VOZ):
    v, _ = sf.read(VOZ); voice = np.zeros(N); voice[:min(N, len(v))] = v[:N]
    e = np.abs(voice); kk = int(0.04 * SR); e = np.convolve(e, np.ones(kk) / kk, 'same')
    e = np.convolve((e > 0.01).astype(float), np.ones(int(0.25 * SR)) / int(0.25 * SR), 'same'); e = np.clip(e, 0, 1)
    # a música abaixa ~8 dB enquanto o locutor fala; os efeitos, ~3 dB
    bed = M_ * (1 - 0.6 * e)[:, None] + S_ * (1 - 0.3 * e)[:, None]
    Vst = np.stack([voice, voice], 1) * 0.55
    sf.write(f'{TMP}/mixvoz_{NOME}.wav', bed + Vst, SR, subtype='FLOAT')
    gv = -14 - lufs(f'{TMP}/mixvoz_{NOME}.wav')[0]
    out(f'{TMP}/mixvoz_{NOME}.wav', f'{A}/comparativo_{NOME}_voz.wav', gv)
    print(NOME, 'mix com voz (LUFS, pico dBTP):', lufs(f'{A}/comparativo_{NOME}_voz.wav'))
