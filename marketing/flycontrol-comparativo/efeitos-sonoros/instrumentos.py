"""Instrumentos e efeitos sintetizados por código (originais, sem amostras de terceiros: livres para publicidade)."""
import json, subprocess, numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve
SR = 48000
N = 0
def set_duration(sec):
    global N
    N = int(sec * SR)
rng = np.random.default_rng(11)  # semente fixa: render sempre igual

def t(sec): return np.arange(int(sec * SR)) / SR
def env(n, a=0.005, d=0.3):
    x = np.arange(n) / SR; e = np.minimum(1, x / max(a, 1e-4)) * np.exp(-np.maximum(0, x - a) / d); return e
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def note(m): return 440 * 2 ** ((m - 69) / 12)
class Bus:
    def __init__(s): s.L = np.zeros(N + SR * 4); s.R = np.zeros(N + SR * 4); s.n = N
    def add(s, at, x, g=1.0, pan=0.0):
        i = int(at * SR); j = min(i + len(x), len(s.L))
        if i >= len(s.L) or j <= i: return
        s.L[i:j] += x[:j - i] * g * np.sqrt((1 - pan) / 2) * 1.414
        s.R[i:j] += x[:j - i] * g * np.sqrt((1 + pan) / 2) * 1.414
    def st(s): return np.stack([s.L[:s.n], s.R[:s.n]], 1)
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

