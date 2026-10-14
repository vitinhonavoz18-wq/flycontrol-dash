"""Trilha, efeitos e mix da VERSÃO CURTA (~24 s). Reaproveita os instrumentos de build.py
(sintetizados aqui, sem música de terceiros) com os tempos de src/timeline-short.json."""
import subprocess
src = open('audio/build.py').read().split('mus, sfx = Bus(), Bus()')[0].replace("src/timeline.json", "src/timeline-short.json")
exec(src)
mus, sfx = Bus(), Bus()
B = 0.5
FREEZE = M['q1End'] + 0.42
IMP = M['fly1']
G_END = M['conheca'] - 0.2
# ---------- 1) tensão: pulso acelerado enquanto as mensagens chovem ----------
x = t(FREEZE); drone = lp(saw(note(28), FREEZE, (0, 5, -5)), 220) * np.minimum(1, x / 0.6) * 0.35
mus.add(0, drone * np.minimum(1, (FREEZE - x) / 0.04))
for s in np.arange(0.3, FREEZE - 0.05, B / 2): mus.add(s, kick(110, 40, 0.2), 0.5); mus.add(s + B / 4, hat(0.02), 0.14, pan=0.3)
for s in np.arange(2.5, FREEZE - 0.05, B / 4): mus.add(s, hat(0.015), 0.07, pan=-0.3)
mus.add(2.6, pad([52, 55, 58], FREEZE - 2.6, 900) * 0.25)
# ---------- 2) suspense ----------
mus.add(FREEZE, pad([40, 47, 52, 55], IMP - FREEZE, 600), 0.22)
# ---------- 3) groove claro a partir do impacto ----------
prog = [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]]; roots = [40, 36, 43, 38]
for i in range(int((G_END - IMP) / B)):
    s = IMP + i * B; bar = i // 4; ch = prog[bar % 4]; r = roots[bar % 4]
    mus.add(s, kick(), 0.8)
    if i % 2 == 1: mus.add(s, clap(), 0.35)
    mus.add(s + B / 2, hat(), 0.18, pan=0.25); mus.add(s, hat(0.02), 0.08, pan=-0.25)
    mus.add(s + B / 2, bass(r, B / 2 - 0.02), 0.4); mus.add(s, bass(r, B / 2 - 0.02), 0.25)
    if i % 4 == 0: mus.add(s, verb(pad([c + 12 for c in ch], 4 * B, 2600), 0.3), 0.16)
    for k in range(2): mus.add(s + k * B / 2, verb(pluck(ch[(i * 2 + k) % 3] + 24, 0.3), 0.3), 0.07, pan=(-0.4 if k else 0.4))
# ---------- 4) fecho ----------
mus.add(G_END, verb(pad([52, 59, 64, 67, 71], DUR - G_END, 2200), 0.45), 0.22)
mus.add(G_END, bass(40, DUR - G_END - 0.3), 0.18)
# ---------- efeitos ----------
sfx.add(0.05, whoosh(0.7, 120, 1200), 0.35)
msgs = [5.9, 6.4, 7.05, 7.55, 8.0, 8.65, 9.2, 9.75, 10.25, 10.6, 10.9, 11.1, 11.3, 11.45, 11.6, 11.72, 11.84, 11.95, 12.05, 12.15, 12.24]
cm = lambda c: 0.7 + (c - 5.9) / (12.3 - 5.9) * (FREEZE - 0.3 - 0.7)
for k, c in enumerate(msgs): sfx.add(cm(c), notif(), 0.3 if k < 8 else 0.2, pan=rng.uniform(-0.5, 0.5))
for c in [6.46, 8.0, 9.2, 11.04]: sfx.add(cm(c), zap(0.2), 0.3); sfx.add(cm(c), whoosh(0.25, 1500, 6000), 0.2)
sfx.add(M['varias'], zap(0.2), 0.25)
sfx.add(M['q1End'] - 0.4, boom(1.0), 0.35)
sfx.add(FREEZE, boom(1.3), 0.45)
xx = t(0.5); sfx.add(FREEZE - 0.02, np.sin(2 * np.pi * np.cumsum(400 * np.exp(-xx / 0.15)) / SR) * env(len(xx), 0.002, 0.2), 0.15)
sfx.add(M['outro'] - 0.05, boom(1.6), 0.6); sfx.add(M['outro'] - 0.08, whoosh(0.3, 500, 6000), 0.3)
BREAK = IMP - 0.75
sfx.add(IMP - 1.7, riser(1.7), 0.55)
sfx.add(BREAK, shatter(1.0), 0.45); sfx.add(BREAK, whoosh(0.7, 300, 5000), 0.3)
sfx.add(IMP - 0.5, whoosh(0.5, 1000, 9000), 0.4)
sfx.add(IMP, boom(3.0), 0.95); sfx.add(IMP, verb(chime(76, 2.0), 0.5), 0.22); sfx.add(IMP, shatter(0.6), 0.25)
for s, m in [(M['acai'], 71), (M['doce'], 74), (M['hamburguer'] + 0.14, 76), (M['pastel'] - 0.14, 79)]:
    sfx.add(s, verb(chime(m, 0.8), 0.3), 0.14); sfx.add(s - 0.1, whoosh(0.25, 1500, 7000), 0.2)
sfx.add(M['cada'] - 0.2, whoosh(0.45, 400, 5000), 0.28); sfx.add(M['cada'] + 0.1, verb(chime(83, 2.0), 0.5), 0.1)
G0 = M['seuNegocio'] - 0.15; D = G_END - G0
sfx.add(G0 - 0.2, whoosh(0.5, 300, 4000), 0.3)
for r in [0.17, 0.34, 0.65]: sfx.add(G0 + r * D, uiclick(), 0.45)
for r in [0.2, 0.37, 0.58, 0.68, 0.83]: sfx.add(G0 + r * D - 0.05, whoosh(0.2, 1500, 6000), 0.12)
sfx.add(G0 + 0.37 * D, notif(), 0.25)
for r in [0.0, 0.34, 0.58]: sfx.add(G0 + r * D, zap(0.22), 0.22); sfx.add(G0 + r * D, kick(200, 60, 0.15), 0.3)
sfx.add(G_END - 0.2, whoosh(0.7, 150, 3000), 0.3)
sfx.add(M['conheca'], boom(2.0), 0.55); sfx.add(M['conheca'], zap(0.25), 0.2)
LOGO = M['conheca'] + 0.45
for k, m in enumerate([64, 71, 76, 83]): sfx.add(LOGO + k * 0.11, verb(chime(m, 2.0), 0.55), 0.2 - k * 0.02, pan=(-0.3 + 0.2 * k))
# ---------- voz (mesmo tratamento da versão longa) ----------
vraw, _ = sf.read('audio/voice_proc.wav')
voice = np.zeros(N)
for a, b, d in T['segments']:
    seg = vraw[int(a * SR):int(b * SR)].copy(); fz = int(0.012 * SR)
    seg[:fz] *= np.linspace(0, 1, fz); seg[-fz:] *= np.linspace(1, 0, fz)
    i = int(d * SR); voice[i:i + len(seg)] += seg[:N - i]
e = np.abs(voice); k = int(0.04 * SR); e = np.convolve(e, np.ones(k) / k, 'same')
e = np.convolve((e > 0.01).astype(float), np.ones(int(0.25 * SR)) / int(0.25 * SR), 'same')
duck = 1 - 0.55 * np.clip(e, 0, 1)
fade = np.ones(N); fl = int(0.5 * SR); fade[-fl:] = np.linspace(1, 0, fl) ** 2
bed = (mus.st() * duck[:, None] * 0.25 + sfx.st() * (1 - 0.3 * np.clip(e, 0, 1))[:, None] * 0.42) * fade[:, None]
bed_nod = (mus.st() * 0.32 + sfx.st() * 0.5) * fade[:, None]
V = np.stack([voice, voice], 1)
sf.write('audio/short_bed.wav', bed, SR, subtype='FLOAT'); sf.write('audio/short_bed_noduck.wav', bed_nod, SR, subtype='FLOAT')
sf.write('audio/short_voice.wav', V, SR, subtype='FLOAT'); sf.write('audio/short_mix_pre.wav', bed + V, SR, subtype='FLOAT')
def lufs(f):
    o = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', f, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float([l for l in o.splitlines() if l.strip().startswith('I:')][-1].split()[1])
def out(src, dst, gain):
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-af', f'volume={gain}dB,alimiter=limit=0.891:attack=3:release=60:level=false', '-ar', '48000', '-c:a', 'pcm_s24le', dst], check=True)
g = -14 - lufs('audio/short_mix_pre.wav')
out('audio/short_mix_pre.wav', 'public/audio/short_mix_final.wav', g)
out('audio/short_voice.wav', 'public/audio/short_voice_final.wav', g)
out('audio/short_bed.wav', 'public/audio/short_bed_ducked_final.wav', g)
out('audio/short_bed_noduck.wav', 'public/audio/short_bed_final.wav', -14 - lufs('audio/short_bed_noduck.wav'))
print('mix', lufs('public/audio/short_mix_final.wav'), 'voz', lufs('public/audio/short_voice_final.wav'), 'trilha-sob-voz', lufs('public/audio/short_bed_ducked_final.wav'), 'sem narração', lufs('public/audio/short_bed_final.wav'))
