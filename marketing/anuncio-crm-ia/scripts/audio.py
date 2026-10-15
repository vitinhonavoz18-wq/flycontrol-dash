"""
Trilha original, efeitos sonoros e mixagem do anúncio — tudo sintetizado aqui,
sem amostras de terceiros (logo, sem problema de licença).

Saídas em public/audio/:
  trilha.wav    música sozinha (sem abaixar sob a voz)
  efeitos.wav   efeitos sonoros sozinhos
  narracao.wav  narração tratada e posicionada
  mix_final.wav mixagem final (antes da normalização de volume)
"""
import json, subprocess, os
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = json.load(open(os.path.join(RAIZ, "src/tempos.json")))
FPS = T["fps"]
DUR = T["total"] / FPS
N = int(DUR * SR)
rng = np.random.default_rng(7)

def fs(fr): return fr / FPS
def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def t_(d): return np.arange(int(d * SR)) / SR

def lp(x, f, o=2): return sosfilt(butter(o, f, "low", fs=SR, output="sos"), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, "high", fs=SR, output="sos"), x)
def bp(x, a, b, o=2): return sosfilt(butter(o, [a, b], "band", fs=SR, output="sos"), x)

def env(n, a=0.005, d=0.1, s=0.7, r=0.2, dur=None):
    a_, d_, r_ = int(a * SR), int(d * SR), int(r * SR)
    sus = max(0, n - a_ - d_ - r_)
    e = np.concatenate([np.linspace(0, 1, a_, False), np.linspace(1, s, d_, False), np.full(sus, s), np.linspace(s, 0, r_)])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))

def saw(f, d, harm=24, det=0.0):
    t = t_(d); y = np.zeros_like(t)
    for k in range(1, harm + 1):
        if f * k > 16000: break
        y += np.sin(2 * np.pi * f * k * (1 + det) * t + k) / k
    return y * 0.55

def put(buf, x, t0, g=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= buf.shape[1] or i + len(x) <= 0: return
    j0 = max(0, -i); i = max(0, i)
    x = x[j0:j0 + buf.shape[1] - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, i:i + len(x)] += x * g * l * 1.414
    buf[1, i:i + len(x)] += x * g * r * 1.414

def reverb(buf, seg=2.4, mix=0.25, cor=6000):
    n = int(seg * SR); t = np.arange(n) / SR
    out = np.zeros_like(buf)
    for c in range(2):
        ir = rng.standard_normal(n) * np.exp(-t * 3.2 / seg * 2.2)
        ir = lp(ir, cor); ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
        ir /= np.sqrt(np.sum(ir ** 2))
        out[c] = fftconvolve(buf[c], ir)[: buf.shape[1]]
    return buf * (1 - mix) + out * mix * 1.2

# ─── instrumentos ──────────────────────────────────────────────────────────
def pad(notas, d, corte=1800, g=0.18):
    y = np.zeros(int(d * SR))
    for m in notas:
        for det in (-0.004, 0.0, 0.0045):
            y += saw(hz(m), d, harm=18, det=det)
    y = lp(y, corte, 2) * env(len(y), a=0.35, d=0.2, s=0.9, r=0.6)
    return y * g / len(notas)

def piano(m, d=1.6, g=0.25):
    t = t_(d); f = hz(m); y = np.zeros_like(t)
    for k, a in enumerate([1, 0.45, 0.25, 0.12, 0.08, 0.04], 1):
        y += a * np.sin(2 * np.pi * f * k * (1 + 0.0004 * k * k) * t) * np.exp(-t * (2.2 + k * 0.9))
    y *= np.minimum(1, t / 0.004)
    return y * g

def pluck(m, d=0.35, g=0.2, brilho=1.0):
    t = t_(d); f = hz(m)
    y = (np.sin(2 * np.pi * f * t) + 0.35 * brilho * np.sin(2 * np.pi * 2 * f * t) + 0.15 * brilho * np.sin(2 * np.pi * 3 * f * t))
    y *= np.exp(-t * 11) * np.minimum(1, t / 0.002)
    return y * g

def baixo(m, d=0.25, g=0.35):
    t = t_(d); f = hz(m)
    y = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)
    return y * env(len(t), a=0.004, d=0.08, s=0.6, r=0.06) * g

def bumbo(g=0.9):
    t = t_(0.45)
    f = 45 + 85 * np.exp(-t * 28)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    y += 0.3 * hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 180)
    return y * g

def palma(g=0.4):
    t = t_(0.25); n = rng.standard_normal(len(t))
    e = np.exp(-t * 26) + 0.6 * np.exp(-np.maximum(0, t - 0.012) * 40) * (t > 0.012)
    return bp(n, 900, 5000) * e * g

def chimbal(g=0.08, d=0.05):
    t = t_(d); return hp(rng.standard_normal(len(t)), 7000) * np.exp(-t * (60 if d < 0.1 else 14)) * g

def tique(g=0.06):
    t = t_(0.03); return bp(rng.standard_normal(len(t)), 3000, 9000) * np.exp(-t * 220) * g

def subida(d, g=0.25, f0=300, f1=7000):
    """ruído subindo (riser)."""
    n = int(d * SR); x = rng.standard_normal(n); y = np.zeros(n); bloco = 1024
    for i in range(0, n, bloco):
        p = i / n; fc = f0 * (f1 / f0) ** p
        y[i:i + bloco] = bp(x[i:i + bloco + 2048], fc * 0.7, min(fc * 1.4, 20000))[: len(y[i:i + bloco])]
    return y * np.linspace(0, 1, n) ** 2 * g

def impacto(g=0.8):
    t = t_(2.2)
    y = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t * 10)) / SR) * np.exp(-t * 2.2)
    y += 0.5 * lp(rng.standard_normal(len(t)), 1800) * np.exp(-t * 6)
    return y * g

# ─── trilha ────────────────────────────────────────────────────────────────
M = np.zeros((2, N))
BPM = 120; B = 60 / BPM

# Cena 1–2: tensão (lá menor), sem bateria pesada
congela = fs(T["congela"])
for i, ch in enumerate([[45, 52, 57, 60], [45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [45, 52, 57, 60]]):
    t0 = i * 2.0
    if t0 >= congela: break
    put(M, pad(ch, min(2.3, congela - t0 + 0.4), corte=700 + i * 250, g=0.22), t0, pan=0)
for k in range(int(congela / (B / 2))):
    t0 = k * B / 2
    put(M, baixo(33 if (k // 8) % 4 != 2 else 29, 0.2, 0.32 + 0.1 * (t0 > 6.6)), t0)
    put(M, tique(0.05 if k % 2 else 0.08), t0, pan=0.3)
arpA = [69, 72, 76, 72, 69, 74, 77, 74]
k = 0; t0 = 1.0
while t0 < congela:
    passo = B / 2 if t0 < 6.6 else B / 4
    put(M, pluck(arpA[k % 8], 0.3, 0.07 + 0.03 * (t0 > 6.6)), t0, pan=0.35 * np.sin(k))
    t0 += passo; k += 1
for k in range(int((congela - 6.6) / (B / 4))):
    put(M, chimbal(0.05), 6.6 + k * B / 4, pan=-0.3)
put(M, subida(congela - 6.6, 0.12, 200, 3000), 6.6)

# Congelamento: tudo para; sobra um grave e um "respiro" invertido até a virada
dr = t_(11.6 - congela)
put(M, np.sin(2 * np.pi * 55 * dr) * np.exp(-dr * 1.5) * 0.25, congela)
swell = pad([48, 55, 60, 64, 67], 1.6, corte=4000, g=0.5)[::-1] * np.linspace(0, 1, int(1.6 * SR)) ** 3
put(M, swell[-int((11.6 - (fs(T["feixe"]) - 0.25)) * SR):], fs(T["feixe"]) - 0.25)
put(M, subida(11.6 - fs(T["feixe"]), 0.18, 800, 12000), fs(T["feixe"]))

# Cena 3 em diante: positivo (dó maior)
PROG = [[48, 55, 60, 64], [43, 50, 55, 59], [45, 52, 57, 60], [41, 48, 53, 57]]  # C G Am F
RAIZES = [36, 31, 33, 29]
ARP = [[72, 76, 79, 76], [71, 74, 79, 74], [69, 72, 76, 72], [69, 72, 77, 72]]

def secao(ini, fim, intens):
    """intens: 0 calmo, 1 groove, 2 clímax"""
    nbar = int(np.ceil((fim - ini) / (4 * B)))
    for b in range(nbar):
        tb = ini + b * 4 * B
        if tb >= fim: break
        c = b % 4; d = min(4 * B, fim - tb)
        put(M, pad(PROG[c], d + 0.3, corte=1400 if intens < 2 else 3200, g=0.16 if intens < 2 else 0.2), tb)
        if intens == 2:
            put(M, pad([n + 12 for n in PROG[c]], d + 0.3, corte=5000, g=0.07), tb, pan=0.2)
        for n in PROG[c][1:]:
            put(M, piano(n + 12, 1.8, 0.11 if intens else 0.14), tb, pan=-0.15)
        for k in range(8 if intens else 4):
            tk = tb + k * (B / 2 if intens else B)
            if tk >= fim: break
            put(M, pluck(ARP[c][k % 4] + (12 if intens == 2 and k % 2 else 0), 0.3, 0.07 if intens else 0.05), tk, pan=0.4 * np.sin(k * 1.3))
        if intens >= 1:
            for k in range(4):
                tk = tb + k * B
                if tk >= fim: break
                put(M, bumbo(0.75 if intens == 2 else 0.5), tk)
                put(M, baixo(RAIZES[c], B * 0.45, 0.3), tk + B / 2)
                if k % 2 == 1: put(M, palma(0.32 if intens == 2 else 0.22), tk, pan=0.05)
                put(M, chimbal(0.06 if intens == 2 else 0.045, 0.05), tk + B / 2, pan=-0.25)
                if intens == 2:
                    put(M, chimbal(0.035, 0.18), tk + B / 2, pan=0.25)
                    put(M, chimbal(0.03), tk + B / 4, pan=0.3); put(M, chimbal(0.03), tk + 3 * B / 4, pan=0.3)
        else:
            put(M, baixo(RAIZES[c], d * 0.9, 0.18), tb)

put(M, impacto(0.7), 11.6)
secao(11.6, fs(T["cenas"]["c5"][0]), 1)
c5i, c5f = fs(T["cenas"]["c5"][0]), fs(T["cenas"]["c5"][1])
put(M, subida(1.2, 0.2, 400, 10000), c5i - 1.2)
for k in range(8):  # rufada de palmas para a virada
    put(M, palma(0.06 + 0.03 * k), c5i - 1.0 + k * B / 4)
put(M, impacto(0.85), c5i)
secao(c5i, c5f, 2)
c6i = fs(T["cenas"]["c6"][0])
desce = subida(1.5, 0.14, 6000, 300)
put(M, desce, c6i - 0.1)
c7i = fs(T["cenas"]["c7"][0])
secao(c6i, c7i, 0)

# Encerramento: acorde sustentado + assinatura sonora
logo = fs(T["c7"]["logo"]); fim = fs(T["c7"]["final"])
put(M, impacto(0.45), logo)
put(M, pad([48, 55, 60, 64, 67], DUR - c7i + 0.2, corte=2200, g=0.16), c7i)
for k, n in enumerate([72, 76, 79, 84]):
    put(M, piano(n, 1.6, 0.08), logo + 0.6 + k * B, pan=0.2 * (k - 1.5))
for k, n in enumerate([79, 84, 88]):
    t = t_(1.6); f = hz(n)
    sino = (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t)) * np.exp(-t * 3.5)
    put(M, sino * 0.16, fim + k * 0.09, pan=(k - 1) * 0.4)
put(M, piano(48, 1.2, 0.2), fim + 0.2); put(M, piano(60, 1.2, 0.14), fim + 0.2)

M = reverb(M, 2.6, 0.22)
# fade final
fade = int(0.3 * SR); M[:, -fade:] *= np.linspace(1, 0, fade) ** 2

# ─── efeitos ───────────────────────────────────────────────────────────────
S = np.zeros((2, N))

def ding(g=0.3, f1=1318.5, f2=1760.0):
    t = t_(0.5)
    a = np.sin(2 * np.pi * f1 * t) * np.exp(-t * 14) * (t < 0.5)
    t2 = np.maximum(0, t - 0.07)
    b = np.sin(2 * np.pi * f2 * t2) * np.exp(-t2 * 9) * (t >= 0.07)
    return (a * 0.7 + b) * np.minimum(1, t / 0.002) * g

def popzinho(g=0.2, f=600):
    t = t_(0.12); fr = f * (1 + 1.5 * np.exp(-t * 60))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 35) * g

def swoosh(d=0.5, g=0.2, f0=500, f1=5000):
    y = subida(d, 1.0, f0, f1)
    e = np.sin(np.linspace(0, np.pi, len(y))) ** 1.5
    return y / (np.max(np.abs(y)) + 1e-9) * e * g

def clique(g=0.25):
    t = t_(0.04); return (bp(rng.standard_normal(len(t)), 1500, 6000) * np.exp(-t * 300) + np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 200)) * g

def blip(f=2400, g=0.07):
    t = t_(0.06); return np.sin(2 * np.pi * f * t) * np.exp(-t * 70) * g

# cena 1: notificações (cada vez mais seguidas, um pouco mais baixas)
for i, fr in enumerate(T["c1_mensagens"]):
    g = 0.34 if i < 6 else 0.2
    put(S, ding(g, 1318.5 * (1 + 0.03 * (i % 3)), 1760 * (1 + 0.03 * (i % 3))), fs(fr), pan=((i * 0.37) % 1.4) - 0.7)
# cena 2: cartões estourando em volta
for i, fr in enumerate(T["c2_cartoes"]):
    put(S, popzinho(0.14, 500 + (i * 83) % 500), fs(fr), pan=((i * 0.61) % 1.6) - 0.8)
    if i % 3 == 0: put(S, ding(0.12, 1568, 2093), fs(fr) + 0.02, pan=((i * 0.43) % 1.6) - 0.8)
# congelamento
t = t_(1.4)
congelar = np.sin(2 * np.pi * np.cumsum(900 * np.exp(-t * 2.5) + 60) / SR) * np.exp(-t * 2.2) * 0.18
congelar += hp(rng.standard_normal(len(t)), 6000) * np.exp(-t * 9) * 0.12
put(S, congelar, congela)
put(S, bumbo(0.5), congela)
# feixe e ativação tecnológica
put(S, swoosh(0.9, 0.3, 300, 9000), fs(T["feixe"]))
t = t_(1.2)
ativa = sum(np.sin(2 * np.pi * f * t) for f in (1046.5, 1568, 2093)) * np.exp(-t * 3.5) * 0.06
put(S, ativa, 11.6)
put(S, swoosh(0.5, 0.12), fs(T["c3"]["painel"]))
put(S, ding(0.22, 1046.5, 1568), fs(T["c3"]["conectado"]))
# cena 4
c4 = T["c4"]
for fr in c4["passos"]: put(S, clique(0.18), fs(fr))
put(S, popzinho(0.2, 700), fs(c4["cliente1"]))
for a, b in (c4["digita1"], c4["digita2"]):
    for k in range(int((b - a) / 4)): put(S, tique(0.025), fs(a + k * 4), pan=0.3)
put(S, ding(0.2, 1567.98, 2093), fs(c4["ia1"]), pan=0.2)
put(S, swoosh(0.45, 0.14, 400, 4000), fs(c4["cardapio"]))
put(S, clique(0.35), fs(c4["toque"]))
for k in range(4): put(S, blip(1800 + 400 * k, 0.06), fs(c4["toque"] + 4 + k * 4))
put(S, popzinho(0.2, 700), fs(c4["cliente2"]))
put(S, ding(0.2, 1567.98, 2093), fs(c4["ia2"]), pan=0.2)
# cena 5
c5 = T["c5"]
for fr in c5["textos"]: put(S, swoosh(0.35, 0.1, 800, 6000), fs(fr) - 0.1)
for a, b in c5["trechos"]:
    for k in range(int((b - a) / 3)): put(S, blip(2000 + 120 * k, 0.04), fs(a + k * 3), pan=-0.5 + k / 8)
    put(S, ding(0.14, 1318.5, 1975.5), fs(b))
put(S, ding(0.26, 1568, 2349), fs(c5["pedido"]))
put(S, ding(0.18, 2093, 2637), fs(c5["pedido"]) + 0.15)
# transições
for fr in (T["cenas"]["c4"][0], T["cenas"]["c5"][0] - 4, T["cenas"]["c6"][0], T["cenas"]["c7"][0]):
    put(S, swoosh(0.55, 0.16, 300, 6000), fs(fr) - 0.3)
put(S, popzinho(0.16, 650), fs(T["cenas"]["c6"][0] + 52))
put(S, popzinho(0.18, 520), fs(T["c7"]["logo"] + 40))
S = reverb(S, 1.2, 0.15, 8000)

# ─── narração ──────────────────────────────────────────────────────────────
V = np.zeros((2, N))
for i, ini in enumerate(T["narracao_inicio_s"]):
    src = os.path.join(RAIZ, f"public/audio/vo/vo{i+1}.mp3")
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", src, "-af",
         "highpass=f=70,equalizer=f=200:t=q:w=1:g=-1.5,equalizer=f=3200:t=q:w=1.2:g=2,equalizer=f=9000:t=h:w=0.7:g=1.5,"
         "acompressor=threshold=-22dB:ratio=3:attack=4:release=90:makeup=2",
         "-ar", str(SR), "-ac", "1", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    put(V, x, ini, 1.0, 0.0)
V *= 0.5 / (np.max(np.abs(V)) + 1e-9)

# ─── mixagem com "abaixar a música sob a voz" ─────────────────────────────
voz = np.abs(V[0])
jan = int(0.03 * SR)
rms = np.sqrt(np.convolve(voz ** 2, np.ones(jan) / jan, "same"))
alvo = np.where(rms > 0.01, 1.0, 0.0)
# ataque 60 ms, soltura 450 ms
g = np.zeros_like(alvo); a, r = np.exp(-1 / (0.06 * SR)), np.exp(-1 / (0.45 * SR))
acc = 0.0
for i in range(0, len(alvo), 64):
    v = alvo[i]
    for _ in range(1):
        acc = (a if v > acc else r) ** 64 * acc + (1 - (a if v > acc else r) ** 64) * v
    g[i:i + 64] = acc
duck = 1 - 0.72 * g  # ~ -11 dB sob a voz

def nivel(x): return np.sqrt(np.mean(x ** 2) + 1e-12)
M *= 0.06 / nivel(M)
S *= 0.5
mix = V * 1.0 + M * duck + S * (1 - 0.45 * g)

def grava(nome, x):
    x = np.clip(x, -1, 1).astype(np.float32).T.copy()
    p = os.path.join(RAIZ, "public/audio", nome)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-c:a", "pcm_s24le", p],
                   input=x.tobytes(), check=True)
    print("gravado", nome, f"pico={np.max(np.abs(x)):.2f}")

pico = np.max(np.abs(mix)); mix *= 0.89 / pico
# trilhas separadas, cada uma com folga própria (para reeditar a mixagem)
for nome, x in (("trilha.wav", M), ("efeitos.wav", S), ("narracao.wav", V)):
    grava(nome, x * min(0.89 / pico, 0.89 / (np.max(np.abs(x)) + 1e-9)))
grava("mix_bruto.wav", mix)
