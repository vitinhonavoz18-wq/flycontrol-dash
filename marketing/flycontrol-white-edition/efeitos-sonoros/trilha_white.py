"""Trilha + efeitos + mix da WHITE EDITION (identidade sonora nova: tech corporate, Lá maior, 116 bpm).
Uso: python3 efeitos-sonoros/trilha_white.py v2|25s"""
import sys, os, json, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, soundfile as sf
import instrumentos as I
from instrumentos import t, env, bp, lp, hp, note, verb, kick, clap, hat, saw, pad, pluck, bass, boom, whoosh, riser, notif, tick, uiclick, shatter, chime, zap, SR, rng
NOME = sys.argv[1] if len(sys.argv) > 1 else 'v2'
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TL = json.load(open(f'{RAIZ}/composicoes/timeline-{NOME}.json'))
M = TL['markers']; DUR = TL['duration']; CHAOS = TL['hasChaos']
I.set_duration(DUR); N = I.N
mus, sfx = I.Bus(), I.Bus()
B = 60 / 116
FREEZE = M['freeze']; IMP = M['fly1']

def marimba(m, d=0.5):  # pluck "de madeira": curiosidade
    x = t(d); f = note(m)
    return (np.sin(2 * np.pi * f * x) + 0.35 * np.sin(2 * np.pi * 4 * f * x) * np.exp(-x / 0.03)) * env(len(x), 0.002, 0.12)
def bloop(f0=900):  # bolha de mensagem surgindo
    x = t(0.16); f = f0 * (1 + 0.6 * np.exp(-x / 0.02))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(x), 0.002, 0.05)
def buzz(d=0.35):  # vibração do celular
    x = t(d); return np.sign(np.sin(2 * np.pi * 155 * x)) * lp(np.ones(len(x)), 300) * env(len(x), 0.005, d * 0.6) * 0.5
def stab(ch, d=0.45, cut=5000):
    return verb(lp(sum(saw(note(m), d, (0, 9, -9, 15)) for m in ch) / len(ch), cut) * env(int(d * SR), 0.004, d * 0.4), 0.25)
def flip():  # cartão virando
    w = whoosh(0.18, 2500, 9000) * 0.8; k = tick(); i0 = int(0.12 * SR); w[i0:i0 + len(k)] += 2 * k[: len(w) - i0]; return w

# ---------- 1) curiosidade (0 → início da conversa) ----------
ARP = [69, 73, 76, 81, 76, 73]  # Lá maior
s = 0.3
i = 0
while s < FREEZE - 0.05:
    dens = 1 if s < (M['preco'] or 99) - 0.3 else 2
    mus.add(s, marimba(ARP[i % 6] + (12 if dens == 2 and i % 4 == 3 else 0)), 0.16, pan=(-0.3 if i % 2 else 0.3))
    i += 1; s += B / 2 / (1 if s < 2.0 else dens)
for s in np.arange(2.0, FREEZE - 0.05, B): mus.add(s, kick(90, 42, 0.22), 0.4)
for s in np.arange(2.0 + B / 2, FREEZE - 0.05, B): mus.add(s, hat(0.03), 0.12, pan=0.2)
if CHAOS:
    for s in np.arange(M['preco'], FREEZE - 0.05, B):
        k = int((s - M['preco']) / B)
        if k % 2 == 1: mus.add(s, clap(), 0.28)
        mus.add(s + B / 2, bass(45, B / 2 - 0.03), 0.3)
    for s in np.arange(M['mudaTudo'], FREEZE - 0.05, B / 4): mus.add(s, hat(0.015), 0.09, pan=-0.3)
    mus.add(M['mudaTudo'] - 0.3, riser(FREEZE - M['mudaTudo'] + 0.3) * 0.5, 0.3)
else:
    for s in np.arange(2.6, FREEZE - 0.05, B / 4): mus.add(s, hat(0.015), 0.08, pan=-0.3)
x = t(FREEZE); mus.add(0, lp(saw(note(45), FREEZE, (0, 6, -6)), 300) * np.minimum(1, x / 1.5) * np.minimum(1, (FREEZE - x) / 0.03) * 0.18)

# ---------- 2) suspense: a música some, só um relógio ----------
mus.add(FREEZE, pad([57, 61, 64, 68], IMP - FREEZE, 700), 0.2)
for s in np.arange(FREEZE + 0.2, IMP - 0.25, B): mus.add(s, tick(), 0.25)
for s in np.arange(FREEZE + 0.2, IMP - 0.25, 2 * B): mus.add(s, kick(70, 38, 0.3), 0.22)

# ---------- 3) impacto e groove principal ----------
PROG = [[57, 61, 64], [52, 56, 59], [54, 57, 61], [50, 54, 57]]  # A E F#m D
ROOT = [45, 40, 42, 38]
END_G = M['profissional2End'] + 0.1
n = int((END_G - IMP) / B)
for k in range(n):
    s = IMP + k * B; bar = k // 4; ch = PROG[bar % 4]; r = ROOT[bar % 4]
    mus.add(s, kick(160, 45, 0.3), 0.85)
    if k % 2 == 1: mus.add(s, clap(), 0.4)
    mus.add(s + B / 2, hat(0.05), 0.2, pan=0.25); mus.add(s + B / 4, hat(0.015), 0.07, pan=-0.3); mus.add(s + 3 * B / 4, hat(0.015), 0.07, pan=-0.3)
    mus.add(s + B / 2, bass(r, B / 2 - 0.03), 0.42); mus.add(s, bass(r, B / 4), 0.2)
    if k % 2 == 0: mus.add(s + B / 2, stab([c + 12 for c in ch], 0.3), 0.07)
    for q in range(2): mus.add(s + q * B / 2, verb(pluck(ch[(k * 2 + q) % 3] + 24, 0.28, 4500), 0.3), 0.06, pan=(-0.45 if q else 0.45))
mus.add(IMP, stab([c + 12 for c in PROG[0]] + [69 + 12], 1.4, 7000), 0.22)

# ---------- 4) encerramento ----------
mus.add(END_G, verb(pad([57, 64, 69, 73, 76], DUR - END_G, 2600), 0.5), 0.22)
mus.add(END_G, bass(45, DUR - END_G - 0.2), 0.2)
for s in np.arange(END_G, DUR - 0.8, B): mus.add(s, kick(130, 45, 0.3), 0.5); mus.add(s + B / 2, hat(0.04), 0.12)

# ---------- efeitos ----------
for k, s in enumerate(np.arange(0.35, min(4.6, FREEZE - 0.3), 0.36)): sfx.add(s, bloop(700 + 90 * (k % 5)), 0.22, pan=rng.uniform(-0.6, 0.6))
sfx.add(2.1, whoosh(0.8, 150, 2000), 0.32)                          # celular entra
sfx.add(M['varias'], zap(0.18), 0.22); sfx.add(M['so'], zap(0.18), 0.18)
if CHAOS:
    msgs = [M['preco'], M['preco'] + 0.6, M['audio'], M['audio'] + 0.55, M['mudaPedido'], M['mudaPedido'] + 0.45, M['mudaPedido'] + 1.05,
            M['mudaTudo'], M['mudaTudo'] + 0.22, M['mudaTudo'] + 0.42, M['mudaTudo'] + 0.6, M['mudaTudo'] + 0.76, M['mudaTudo'] + 0.9, M['mudaTudo'] + 1.02, M['mudaTudo'] + 1.13]
    for k, s in enumerate(msgs): sfx.add(s, notif(), 0.26 if k < 7 else 0.17, pan=rng.uniform(-0.5, 0.5))
    for s in [M['preco'], M['audio'], M['mudaPedido'], M['mudaTudo']]: sfx.add(s, whoosh(0.28, 1200, 6000), 0.22); sfx.add(s + 0.02, zap(0.2), 0.25)
    sfx.add(M['audio'] + 0.1, uiclick(), 0.4)
    for s in np.arange(M['mudaTudo'], FREEZE - 0.1, 0.4): sfx.add(s, buzz(0.28), 0.25)
else:
    for k, s in enumerate(np.arange(2.9, FREEZE - 0.2, 0.24)): sfx.add(s, notif(), 0.18, pan=rng.uniform(-0.5, 0.5))
    for s in np.arange(4.0, FREEZE - 0.1, 0.4): sfx.add(s, buzz(0.28), 0.22)
xx = t(0.5); sfx.add(FREEZE - 0.02, np.sin(2 * np.pi * np.cumsum(420 * np.exp(-xx / 0.15)) / SR) * env(len(xx), 0.002, 0.2), 0.16)
sfx.add(FREEZE, boom(1.4), 0.4)
sfx.add(FREEZE + 0.3, whoosh(2.2, 120, 1200), 0.18)                 # câmera se afastando
sfx.add(M['outro'] - 0.05, boom(1.6), 0.55); sfx.add(M['outro'] - 0.08, whoosh(0.35, 500, 7000), 0.3)
# transformação (cartões se soltam → viram componentes → celular gira → encaixe no impacto)
MORPH0 = max(FREEZE + 0.4, M['lugarEnd'] - 2.2)
for k in range(8): sfx.add(MORPH0 + k * 0.09, whoosh(0.22, 1500, 7000), 0.1, pan=(-0.6 + 0.17 * k))
FLIP0 = IMP - 1.55
for k in range(8): sfx.add(FLIP0 + k * 0.07, flip(), 0.16, pan=(0.6 - 0.17 * k))
sfx.add(IMP - 1.8, riser(1.68), 0.55)
sfx.add(IMP - 1.1, whoosh(1.0, 200, 6000), 0.3)                      # celular gira 180°
sfx.add(IMP - 0.45, whoosh(0.45, 900, 10000), 0.35)                  # corrente de luz
sfx.add(IMP, boom(3.0), 0.95); sfx.add(IMP, verb(chime(81, 2.2), 0.55), 0.2); sfx.add(IMP, shatter(0.8), 0.18)
sfx.add(IMP + 0.05, whoosh(0.9, 300, 4000, up=False), 0.25)          # anel laranja se expandindo
for key, m in [('simples', 76), ('moderno', 78), ('profissional1', 81)]:
    if M.get(key): sfx.add(M[key], verb(chime(m, 0.9), 0.3), 0.12); sfx.add(M[key] - 0.05, kick(200, 70, 0.12), 0.25)
G0 = M['seja'] - 0.4
for key, lo in [('acai', 400), ('doce', 200), ('hamburguer', 600), ('pastel', 400)]:
    sfx.add(M[key] - 0.15, whoosh(0.45, lo, 6000), 0.3); sfx.add(M[key], verb(chime(76 + 2 * ['acai', 'doce', 'hamburguer', 'pastel'].index(key), 0.7), 0.3), 0.1)
sfx.add(M['hamburguer'] + 0.45, whoosh(0.5, 300, 5000), 0.25)          # câmera chega ao Brasa do João
sfx.add(M['cada'] - 0.2, whoosh(0.9, 150, 3000, up=False), 0.3); sfx.add(M['cada'] + 0.3, verb(chime(88, 2.0), 0.5), 0.09)
P0 = M['seuNegocio'] - 0.25
sfx.add(P0 - 0.2, whoosh(0.7, 200, 4000), 0.3)                        # tablet aparece
for k in range(3): sfx.add(P0 + 0.55 + k * 0.42, tick(), 0.4); sfx.add(P0 + 0.55 + k * 0.42, zap(0.12), 0.12)
PD = M['profissional2End'] - P0
for r in [0.42, 0.62]: sfx.add(P0 + r * PD, uiclick(), 0.45)
sfx.add(P0 + 0.66 * PD, notif(), 0.22); sfx.add(P0 + 0.82 * PD, bloop(1200), 0.3)
sfx.add(M['profissional2End'] - 0.3, whoosh(1.0, 150, 3000), 0.3)    # faixa de luz do encerramento
sfx.add(M['conheca'], boom(1.8), 0.5); sfx.add(M['conheca'], zap(0.22), 0.2)
LOGO = M['conheca'] + 0.55
for k, m in enumerate([69, 73, 76, 81]): sfx.add(LOGO + k * 0.12, verb(chime(m, 2.2), 0.6), 0.19 - k * 0.02, pan=(-0.3 + 0.2 * k))
sfx.add(LOGO, whoosh(0.6, 2000, 12000), 0.15)

# ---------- voz (locução existente, mesmo tratamento: EQ, de-esser, compressão) ----------
vraw, _ = sf.read(f'{RAIZ}/narracao/voice_proc.wav')
voice = np.zeros(N)
for a, b2, d in TL['segments']:
    seg = vraw[int(a * SR):int(b2 * SR)].copy(); fz = int(0.012 * SR)
    seg[:fz] *= np.linspace(0, 1, fz); seg[-fz:] *= np.linspace(1, 0, fz)
    i0 = int(d * SR); voice[i0:i0 + len(seg)] += seg[:N - i0]
e = np.abs(voice); kk = int(0.04 * SR); e = np.convolve(e, np.ones(kk) / kk, 'same')
e = np.convolve((e > 0.01).astype(float), np.ones(int(0.25 * SR)) / int(0.25 * SR), 'same')
duck = 1 - 0.55 * np.clip(e, 0, 1)
fade = np.ones(N); fl = int(0.6 * SR); fade[-fl:] = np.linspace(1, 0, fl) ** 2
bed = (mus.st() * duck[:, None] * 0.25 + sfx.st() * (1 - 0.3 * np.clip(e, 0, 1))[:, None] * 0.42) * fade[:, None]
bed_nod = (mus.st() * 0.3 + sfx.st() * 0.45) * fade[:, None]
V = np.stack([voice, voice], 1)
TMP = f'{RAIZ}/efeitos-sonoros/tmp'; os.makedirs(TMP, exist_ok=True)
sf.write(f'{TMP}/bed.wav', bed, SR, subtype='FLOAT'); sf.write(f'{TMP}/bed_nod.wav', bed_nod, SR, subtype='FLOAT')
sf.write(f'{TMP}/voz.wav', V, SR, subtype='FLOAT'); sf.write(f'{TMP}/mix.wav', bed + V, SR, subtype='FLOAT')
def lufs(f):
    o = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    L = [l for l in o.splitlines() if l.strip().startswith(('I:', 'Peak:'))]
    return float(L[-2].split()[1]), float(L[-1].split()[1])
def out(src, dst, gain):
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-af', f'volume={gain}dB,alimiter=limit=0.891:attack=3:release=60:level=false', '-ar', '48000', '-c:a', 'pcm_s24le', dst], check=True)
g = -14 - lufs(f'{TMP}/mix.wav')[0]
A = f'{RAIZ}/assets/audio'; os.makedirs(A, exist_ok=True)
out(f'{TMP}/mix.wav', f'{A}/{NOME}_mix.wav', g)
out(f'{TMP}/voz.wav', f'{RAIZ}/narracao/{NOME}_narracao_tratada.wav', g)
out(f'{TMP}/bed.wav', f'{TMP}/bed_sob_voz.wav', g)
out(f'{TMP}/bed_nod.wav', f'{A}/{NOME}_trilha_sem_voz.wav', -14 - lufs(f'{TMP}/bed_nod.wav')[0])
print(NOME, 'mix', lufs(f'{A}/{NOME}_mix.wav'), '| voz', lufs(f'{RAIZ}/narracao/{NOME}_narracao_tratada.wav')[0],
      '| trilha sob a voz', lufs(f'{TMP}/bed_sob_voz.wav')[0], '| sem voz', lufs(f'{A}/{NOME}_trilha_sem_voz.wav'))
