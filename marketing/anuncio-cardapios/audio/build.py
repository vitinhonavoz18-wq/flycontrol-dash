"""Trilha, efeitos sonoros e mixagem — tudo sintetizado aqui (trilha original, sem licença de terceiros).
Saídas em public/audio e deliverables: voz tratada, trilha+efeitos, mix final."""
import json, subprocess, numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve
SR = 48000
T = json.load(open('src/timeline.json'))
M = T['markers']; DUR = T['duration']; N = int(DUR * SR)
rng = np.random.default_rng(7)  # semente fixa: render sempre igual
def t(sec): return np.arange(int(sec * SR)) / SR
def env(n, a=0.005, d=0.3):
    x = np.arange(n) / SR; e = np.minimum(1, x / max(a, 1e-4)) * np.exp(-np.maximum(0, x - a) / d); return e
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def note(m): return 440 * 2 ** ((m - 69) / 12)
class Bus:
    def __init__(s): s.L = np.zeros(N + SR * 4); s.R = np.zeros(N + SR * 4)
    def add(s, at, x, g=1.0, pan=0.0):
        i = int(at * SR); j = min(i + len(x), len(s.L))
        if i >= len(s.L) or j <= i: return
        s.L[i:j] += x[:j - i] * g * np.sqrt((1 - pan) / 2) * 1.414
        s.R[i:j] += x[:j - i] * g * np.sqrt((1 + pan) / 2) * 1.414
    def st(s): return np.stack([s.L[:N], s.R[:N]], 1)
IR = rng.standard_normal(int(SR * 2.2)) * np.exp(-np.arange(int(SR * 2.2)) / (SR * 0.45))
IR = lp(IR, 6000); IR /= np.sqrt((IR ** 2).sum())
def verb(x, mix=0.25):
    w = fftconvolve(x, IR)[:len(x) + SR] ; y = np.zeros(len(w)); y[:len(x)] = x; return y * (1 - mix) + w * mix

# ---------- instrumentos ----------
def kick(f0=150, f1=42, d=0.35):
    x = t(d + 0.2); f = f1 + (f0 - f1) * np.exp(-x / 0.045); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(len(x), 0.001, d * 0.6) + 0.2 * hp(rng.standard_normal(len(x)), 3000) * env(len(x), 0.0005, 0.006)
def clap(): x = rng.standard_normal(int(0.3 * SR)); return bp(x, 900, 5000) * (env(len(x), 0.001, 0.12) + 0.6 * env(len(x), 0.001, 0.012))
def hat(d=0.04): x = rng.standard_normal(int(0.2 * SR)); return hp(x, 7000, 4) * env(len(x), 0.0005, d)
def saw(f, d, det=(0, 7, -7)):
    x = t(d); return sum(2 * ((x * f * 2 ** (c / 1200)) % 1) - 1 for c in det) / len(det)
def pad(midis, d, cut=1800):
    x = sum(saw(note(m), d) for m in midis) / len(midis); e = np.minimum(1, t(d) / 0.6) * np.minimum(1, (d - t(d)) / 0.5)
    return lp(x, cut) * e
def pluck(m, d=0.35, cut=3500):
    x = saw(note(m), d, (0, 9)); return lp(x, cut) * env(len(x), 0.002, d * 0.35)
def bass(m, d): x = t(d); s = np.sin(2 * np.pi * note(m) * x) + 0.3 * lp(saw(note(m), d, (0,)), 400); return s * np.minimum(1, x / 0.01) * np.minimum(1, (d - x) / 0.03)
def boom(d=2.5):
    x = t(d); f = 28 + 70 * np.exp(-x / 0.12); s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(x), 0.002, 0.9)
    n = lp(rng.standard_normal(len(x)), 2500) * env(len(x), 0.001, 0.5) * 0.5
    return s + n
def whoosh(d=0.6, lo=300, hi=4000, up=True):
    x = t(d); n = rng.standard_normal(len(x)); out = np.zeros(len(x)); K = 24
    for k in range(K):
        a, b = k * len(x) // K, (k + 1) * len(x) // K; fr = k / (K - 1) if up else 1 - k / (K - 1)
        c = lo * (hi / lo) ** fr; out[a:b] = bp(n, c * 0.7, min(c * 1.4, SR / 2 - 100))[a:b]
    return out * np.sin(np.pi * x / d) ** 2
def riser(d):
    x = t(d); f = 200 * (2000 / 200) ** (x / d) ; tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    return (whoosh(d, 200, 9000) * 1.2 + tone) * (x / d) ** 2
def notif():  # "plim" genérico de mensagem
    a = np.sin(2 * np.pi * 1318 * t(0.18)) * env(int(0.18 * SR), 0.002, 0.05)
    b = np.sin(2 * np.pi * 1760 * t(0.3)) * env(int(0.3 * SR), 0.002, 0.08)
    y = np.zeros(int(0.4 * SR)); y[:len(a)] += a; y[int(0.07 * SR):int(0.07 * SR) + len(b)] += b; return y * 0.5
def tick(): x = rng.standard_normal(int(0.03 * SR)); return bp(x, 2000, 8000) * env(len(x), 0.0003, 0.006)
def uiclick():
    x = t(0.06); y = np.sin(2 * np.pi * 2400 * x) * env(len(x), 0.0005, 0.01); k = tick(); y[:len(k)] += 0.4 * k; return y
def shatter(d=0.9):
    y = np.zeros(int(d * SR))
    for k in range(40):
        at = int(rng.uniform(0, 0.6) * SR); f = rng.uniform(2500, 9000); g = t(rng.uniform(0.03, 0.15))
        s = np.sin(2 * np.pi * f * g) * env(len(g), 0.0005, 0.03) * rng.uniform(0.2, 0.6)
        y[at:at + len(s)] += s[:len(y) - at]
    n = hp(rng.standard_normal(len(y)), 2500) * env(len(y), 0.001, 0.25)
    return y + n * 0.5
def chime(m, d=1.6): x = t(d); return (np.sin(2 * np.pi * note(m) * x) + 0.3 * np.sin(2 * np.pi * note(m + 12) * x)) * env(len(x), 0.003, 0.5)
def zap(d=0.25):  # pulso eletrônico
    x = t(d); f = 900 * np.exp(-x / 0.05) + 80; return np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * env(len(x), 0.001, 0.06) * 0.3

mus, sfx = Bus(), Bus()
B = 0.5  # 120 bpm
# ---------- 1) tensão (0 – 12.3) ----------
FREEZE = 12.35
x = t(FREEZE); drone = lp(saw(note(28), FREEZE, (0, 5, -5)), 220) * np.minimum(1, x / 1.2) * 0.35
drone += np.sin(2 * np.pi * note(40) * x) * 0.08 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.25 * x))
mus.add(0, drone * np.minimum(1, (FREEZE - x) / 0.04))
for i, s in enumerate(np.arange(1.2, FREEZE - 0.05, B)):
    mus.add(s, kick(110, 40, 0.25), 0.55 if s > 5.8 else 0.35)
    if s > 5.8: mus.add(s + B / 2, bass(28, B / 2 - 0.02), 0.25)
for s in np.arange(1.2, FREEZE - 0.05, B / 2): mus.add(s + B / 4, hat(0.02), 0.08 + 0.1 * (s > 6), pan=0.3)
for s in np.arange(5.9, FREEZE - 0.05, B / 4): mus.add(s, hat(0.015), 0.05 * (s > 9.2), pan=-0.3)
mus.add(9.2, pad([52, 55, 58], FREEZE - 9.2, 900) * 0.25)  # acorde diminuto, desgaste
# ---------- 2) suspense (12.35 – 20.12) ----------
mus.add(13.6, pad([40, 47, 52, 55], 6.7, 600), 0.22)
mus.add(FREEZE, np.sin(2 * np.pi * note(64) * t(5)) * env(int(5 * SR), 0.5, 3) * 0.04, pan=0.4)
# ---------- 3) virada e groove claro (20.12 – 48.9) ----------
IMP = M['fly1']; END_G = 48.9
prog = [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]]  # Em C G D
roots = [40, 36, 43, 38]
nb = int((END_G - IMP) / B)
for i in range(nb):
    s = IMP + i * B; bar = i // 4; ch = prog[bar % 4]; r = roots[bar % 4]
    mus.add(s, kick(), 0.8)
    if i % 2 == 1: mus.add(s, clap(), 0.35)
    mus.add(s + B / 2, hat(), 0.18, pan=0.25); mus.add(s, hat(0.02), 0.08, pan=-0.25)
    mus.add(s + B / 2, bass(r, B / 2 - 0.02), 0.4); mus.add(s, bass(r, B / 2 - 0.02), 0.25)
    if i % 4 == 0: mus.add(s, verb(pad([c + 12 for c in ch], 4 * B, 2600), 0.3), 0.16)
    for k in range(2):  # arpejo
        m = ch[(i * 2 + k) % 3] + 24
        mus.add(s + k * B / 2, verb(pluck(m, 0.3), 0.3), 0.07, pan=(-0.4 if k else 0.4))
# respiro (sem bumbo) durante a demonstração de funções, para a voz ficar no centro
# ---------- 4) encerramento (48.9 – 59) ----------
mus.add(END_G, verb(pad([52, 59, 64, 67, 71], DUR - END_G, 2200), 0.45), 0.22)
for i in range(int((55.8 - END_G) / B)):
    s = END_G + i * B; mus.add(s, kick(120, 45, 0.3), 0.45); mus.add(s + B / 2, hat(), 0.1)
mus.add(END_G, bass(40, 55.8 - END_G), 0.18)

# ---------- efeitos ----------
sfx.add(0.15, whoosh(1.1, 120, 1200), 0.35)                       # celular surge
sfx.add(3.0, zap(0.2), 0.25)                                        # "VÁRIAS MENSAGENS"
sfx.add(M['q1End'] - 0.45, boom(1.2), 0.35); sfx.add(M['q1End'] - 0.45, whoosh(0.35, 800, 5000), 0.2)  # ASSIM?
msg_times = [5.9, 6.4, 7.05, 7.55, 8.0, 8.65, 9.2, 9.75, 10.25, 10.6, 10.9, 11.1, 11.3, 11.45, 11.6, 11.72, 11.84, 11.95, 12.05, 12.15, 12.24]
for k, s in enumerate(msg_times):
    sfx.add(s, notif(), 0.32 if k < 8 else 0.22, pan=rng.uniform(-0.5, 0.5))
    for j in range(5 if k < 9 else 0): sfx.add(s - 0.45 + j * 0.07, tick(), 0.12, pan=0.2)
sfx.add(M['preco'], whoosh(0.3, 1500, 6000), 0.25); sfx.add(M['preco'] + 0.05, zap(), 0.3)
sfx.add(M['audio'], zap(0.3), 0.35); sfx.add(M['audio'] + 0.1, uiclick(), 0.4)
sfx.add(M['mudaPedido'], whoosh(0.4, 400, 3000), 0.35)
sfx.add(FREEZE, boom(1.5), 0.45)                                    # congelamento
x = t(0.5); sfx.add(FREEZE - 0.02, np.sin(2 * np.pi * np.cumsum(400 * np.exp(-x / 0.15)) / SR) * env(len(x), 0.002, 0.2), 0.15)  # "tape stop"
sfx.add(M['mas'] - 0.8, whoosh(1.0, 100, 900, up=True)[::-1].copy(), 0.25)
sfx.add(15.2, whoosh(2.0, 150, 1500), 0.2)                           # câmera girando
sfx.add(M['outro'] - 0.05, boom(1.8), 0.6); sfx.add(M['outro'] - 0.08, whoosh(0.3, 500, 6000), 0.3)
# virada (tempos relativos ao impacto, como no roteiro: 0 / 0.3 / 0.8 / 1.5 / 2.0)
V0 = IMP - 2.0
sfx.add(V0 + 0.3, riser(1.7), 0.55)
sfx.add(V0 + 0.8, shatter(1.0), 0.45); sfx.add(V0 + 0.8, whoosh(0.8, 300, 5000), 0.3)
sfx.add(V0 + 1.5, whoosh(0.5, 1000, 9000), 0.4)
sfx.add(IMP, boom(3.0), 0.95); sfx.add(IMP, verb(chime(76, 2.0), 0.5), 0.22); sfx.add(IMP, shatter(0.6), 0.25)
for s in [28.0, 30.3, 36.71]: sfx.add(s - 0.2, whoosh(0.45, 400, 5000), 0.28)
for s, m in [(M['acai'], 71), (M['doce'], 74), (M['hamburguer'] + 0.14, 76), (M['pastel'], 79)]:
    sfx.add(s, verb(chime(m, 0.8), 0.3), 0.14); sfx.add(s - 0.1, whoosh(0.25, 1500, 7000), 0.2)
sfx.add(M['cada'] + 0.1, verb(chime(83, 2.5), 0.5), 0.1)
# demonstração: toques reais na tela
taps = [M['escolha'], M['personalize'], 42.62, 42.86, 43.06, 43.32, 44.38]
for s in taps: sfx.add(s, uiclick(), 0.45)
for s in [M['escolha'], M['personalize'], M['confira']]: sfx.add(s, zap(0.22), 0.25); sfx.add(s, kick(200, 60, 0.15), 0.3)
sfx.add(43.5, notif(), 0.3)                                          # carrinho atualizado
sfx.add(M['confira'], whoosh(0.5, 300, 4000), 0.3)
sfx.add(46.5, whoosh(0.4, 400, 3000, up=False), 0.2)
# fecho
sfx.add(END_G - 0.3, whoosh(0.9, 150, 3000), 0.3)
sfx.add(M['fly2'], boom(2.5), 0.6); sfx.add(M['fly2'], verb(chime(76, 2.0), 0.5), 0.18)
sfx.add(M['seuNegocio'] - 0.2, whoosh(0.4, 800, 5000), 0.15)
sfx.add(M['conheca'], boom(1.5), 0.4); sfx.add(M['conheca'], zap(0.25), 0.2)
LOGO = 55.8   # assinatura sonora
for k, m in enumerate([64, 71, 76, 83]): sfx.add(LOGO + k * 0.11, verb(chime(m, 2.4), 0.55), 0.2 - k * 0.02, pan=(-0.3 + 0.2 * k))
sfx.add(LOGO, boom(2.5), 0.5)

# ---------- voz ----------
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', 'public/audio/narration_raw.mp3', '-af',
  'highpass=f=75,equalizer=f=250:t=q:w=1.2:g=-2,equalizer=f=3200:t=q:w=1.5:g=2,equalizer=f=11000:t=q:w=1:g=1.5,'
  'deesser=i=0.35:m=0.5:f=0.5,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=2,'
  'alimiter=limit=0.89', '-ar', str(SR), '-ac', '1', 'audio/voice_proc.wav'], check=True)
vraw, _ = sf.read('audio/voice_proc.wav')
voice = np.zeros(N)
for a, b, d in T['segments']:
    seg = vraw[int(a * SR):int(b * SR)].copy(); f = int(0.012 * SR)
    seg[:f] *= np.linspace(0, 1, f); seg[-f:] *= np.linspace(1, 0, f)
    i = int(d * SR); voice[i:i + len(seg)] += seg[:N - i]
# ducking: a trilha abaixa sempre que a narradora fala
e = np.abs(voice); k = int(0.04 * SR); e = np.convolve(e, np.ones(k) / k, 'same')
e = np.convolve((e > 0.01).astype(float), np.ones(int(0.25 * SR)) / int(0.25 * SR), 'same')
duck = 1 - 0.55 * np.clip(e, 0, 1)                                  # ≈ -7 dB
m = mus.st() * duck[:, None]; s = sfx.st() * (1 - 0.25 * np.clip(e, 0, 1))[:, None]
fade = np.ones(N); fl = int(1.2 * SR); fade[-fl:] = np.linspace(1, 0, fl) ** 2
bed = (m * 0.32 + s * 0.5) * fade[:, None]
def peak_norm(x, p=0.89): return x * (p / max(1e-9, np.abs(x).max()))
V = np.stack([voice, voice], 1)
sf.write('audio/bed.wav', bed, SR, subtype='FLOAT'); sf.write('audio/voice_placed.wav', V, SR, subtype='FLOAT')
sf.write('audio/mix_pre.wav', bed + V * 1.0, SR, subtype='FLOAT')
print('ok', N / SR)
