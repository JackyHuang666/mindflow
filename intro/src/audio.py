"""SWT MindFlow 開場序章 15 秒配樂與音效（全部程式合成，無外部素材）
D 小調 → D 大調；時間點與畫面同步：
 0–3  神秘星雲、五色黏土、合一鐘聲、生命凝聚、心跳、閃光
 3–6  天裂隆隆、雷擊、五道光帶呼嘯、五次撞擊、補天爆發（轉大調）
 6–11 史詩段落 120bpm：弦樂頑固音型、太鼓、銅管、合唱、匯聚爆發、學院生成晶鈴
 11–15 D 大調全奏、鑼、三聲標題鐘聲、餘韻
"""
import numpy as np, scipy.signal as ss, scipy.io.wavfile as wf, sys

SR = 48000; DUR = 15.0; N = int(SR * DUR)
rng = np.random.default_rng(1128)
L = np.zeros(N); R = np.zeros(N)
RL = np.zeros(N); RR = np.zeros(N)   # reverb send

def add(sig, start, pan=0.0, gain=1.0, rev=0.3):
    i = int(round(start * SR))
    if i < 0: sig = sig[-i:]; i = 0
    n = min(len(sig), N - i)
    if n <= 0: return
    a = (pan + 1) * np.pi / 4; l, r = np.cos(a) * 1.414, np.sin(a) * 1.414
    s = sig[:n] * gain
    L[i:i+n] += s * l; R[i:i+n] += s * r
    RL[i:i+n] += s * l * rev; RR[i:i+n] += s * r * rev

def tt(d): return np.arange(int(d * SR)) / SR
def lp(x, fc, o=2): b, a = ss.butter(o, min(fc, SR*0.45) / (SR / 2)); return ss.lfilter(b, a, x)
def hp(x, fc, o=2): b, a = ss.butter(o, fc / (SR / 2), "high"); return ss.lfilter(b, a, x)
def bp(x, f1, f2, o=2): b, a = ss.butter(o, [f1 / (SR / 2), min(f2, SR*0.45) / (SR / 2)], "band"); return ss.lfilter(b, a, x)
def env(n, a, r, curve=1.0):
    e = np.ones(n); na = min(n, max(1, int(a * SR))); nr = min(n, max(1, int(r * SR)))
    e[:na] = np.linspace(0, 1, na) ** curve
    if nr < n: e[-nr:] *= np.linspace(1, 0, nr) ** 1.5
    return e
def note(name):
    m = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
    p, o = name[:-1], int(name[-1]); return 440.0 * 2 ** ((m[p] + (o + 1) * 12 - 69) / 12)

def additive(f, d, nh=16, roll=1.0, detune=(0,), vib=0.0, form=None, bright_decay=0.0):
    t = tt(d); out = np.zeros(len(t))
    for dc in detune:
        ff = f * 2 ** (dc / 1200)
        ph = 2 * np.pi * ff * t + (vib * np.sin(2 * np.pi * 5.2 * t + rng.random() * 6) if vib else 0)
        for k in range(1, nh + 1):
            if ff * k > SR * 0.42: break
            amp = 1.0 / k ** roll
            if form is not None: amp *= form(ff * k)
            hk = amp * np.sin(k * ph + rng.random() * 6.28)
            if bright_decay: hk *= np.exp(-t * bright_decay * (k - 1) / nh)
            out += hk
    return out / len(detune)

def strings(notes, start, d, gain, nh=14, a=0.6, r=0.8, pan_spread=0.6, rev=0.45, trem=0.0):
    for i, nm in enumerate(notes):
        f = note(nm) if isinstance(nm, str) else nm
        s = additive(f, d, nh=nh, roll=1.1, detune=(-9, -3, 4, 10), vib=0.0025 * f / f)
        s *= env(len(s), a, r)
        if trem: s *= 0.6 + 0.4 * np.abs(np.sin(np.pi * trem * tt(d)))
        pan = (i / max(1, len(notes) - 1) - 0.5) * 2 * pan_spread
        add(s, start, pan, gain / np.sqrt(len(notes)), rev)

def formant_a(fr):
    return (np.exp(-((fr - 750) / 130) ** 2) + 0.6 * np.exp(-((fr - 1150) / 150) ** 2) + 0.25 * np.exp(-((fr - 2800) / 250) ** 2) + 0.05)

def choir(notes, start, d, gain, a=0.8, r=1.0):
    for i, nm in enumerate(notes):
        f = note(nm)
        s = additive(f, d, nh=40, roll=0.6, detune=(-7, 0, 6), vib=0.004 * 2 * np.pi * 0 + 0.012, form=formant_a)
        s = s * env(len(s), a, r)
        add(s, start, (i / max(1, len(notes) - 1) - 0.5) * 1.2, gain / np.sqrt(len(notes)), 0.7)

def brass(notes, start, d, gain):
    for i, nm in enumerate(notes):
        f = note(nm); s = additive(f, d, nh=24, roll=0.8, detune=(-5, 5), bright_decay=6.0)
        e = env(len(s), 0.03, 0.5) * (0.55 + 0.45 * np.exp(-tt(d) * 3))
        add(s * e, start, (i - len(notes) / 2) * 0.15, gain / np.sqrt(len(notes)), 0.4)

def pluck(f, d=0.22):
    t = tt(d); s = additive(f, d, nh=12, roll=1.0, detune=(-6, 6), bright_decay=14) * np.exp(-t * 9)
    return s * env(len(s), 0.004, 0.05)

def bell(f, d=2.5, idx=3.0):
    t = tt(d); mod = np.sin(2 * np.pi * f * 1.4 * t) * idx * np.exp(-t * 2.5)
    s = np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 1.6) + 0.3 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 4)
    return s * env(len(s), 0.002, 0.2)

def ping(f, d=0.5):
    t = tt(d); return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 3.01 * t)) * np.exp(-t * 9) * env(len(t), 0.002, 0.05)

def taiko(f0=110, f1=46, d=1.4, noise=0.4):
    t = tt(d); f = f1 + (f0 - f1) * np.exp(-t * 16)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.8)
    n = lp(rng.standard_normal(len(t)) * np.exp(-t * 35), 1600)
    return np.tanh((body + noise * n) * 1.4)

def boom(d=3.5, f0=80, f1=28):
    t = tt(d); f = f1 + (f0 - f1) * np.exp(-t * 6)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.3)
    rum = lp(rng.standard_normal(len(t)), 260) * np.exp(-t * 1.8) * 2.5
    crack = hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 14) * 0.5
    return np.tanh((sub * 1.2 + rum * 0.5 + crack) * 1.2)

def sweep_noise(d, f_from, f_to, q=0.35, shape=None):
    """時變帶通濾波雜訊（呼嘯、上升音）— 狀態變數濾波器"""
    n = int(d * SR); x = rng.standard_normal(n); y = np.zeros(n)
    fc = f_from * (f_to / f_from) ** (np.linspace(0, 1, n) ** 1.0)
    low = band = 0.0
    for i in range(n):
        f = 2 * np.sin(np.pi * fc[i] / SR)
        low += f * band; high = x[i] - low - q * band; band += f * high
        y[i] = band
    e = shape(np.linspace(0, 1, n)) if shape else np.sin(np.linspace(0, np.pi, n))
    return y * e / (np.abs(y).max() + 1e-9)

def riser(d, f_from=300, f_to=6000):
    s = sweep_noise(d, f_from, f_to, 0.5, lambda u: u ** 2.2)
    t = tt(d); tone = np.sin(2 * np.pi * np.cumsum(np.linspace(f_from / 3, f_to / 8, len(t))) / SR) * (np.linspace(0, 1, len(t)) ** 3) * 0.25
    return s[:len(t)] + tone

def revcymbal(d):
    t = tt(d); c = hp(rng.standard_normal(len(t)), 4000) * np.exp(-t * 3.0); return c[::-1] * 0.7

def sparkles(start, d, density, gain, scale=("D6", "E6", "F6", "A6", "C7", "D7", "A5", "F5"), rev=0.6):
    n = int(d * density)
    for k in range(n):
        st = start + rng.random() * d; f = note(scale[rng.integers(len(scale))]) * 2 ** (rng.normal(0, 0.003))
        add(ping(f, 0.4) * (0.4 + 0.6 * rng.random()), st, rng.uniform(-0.9, 0.9), gain, rev)

# ======================= 0–3：女媧造人 =======================
strings(["D2", "A2", "D3", "F3", "E4"], 0.0, 3.4, 0.20, nh=8, a=1.2, r=0.6)
add(lp(rng.standard_normal(int(3.2 * SR)), 900) * env(int(3.2 * SR), 1.0, 0.4) * 0.18, 0.0, 0, 1, 0.8)   # 宇宙氣息
sparkles(0.1, 2.8, 9, 0.10)
for i, st in enumerate([0.08, 0.15, 0.22, 0.29, 0.36]):     # 五色黏土出現
    add(bell(note(["D5", "F5", "A5", "C6", "E6"][i]), 1.6, 1.5), st + 0.05, (i - 2) * 0.35, 0.10, 0.6)
add(sweep_noise(1.3, 400, 2400, 0.6) * 0.25, 0.0, -0.3, 1, 0.5)   # 旋轉
add(bell(note("D5"), 3.0, 2.0) * 0.5 + bell(note("A5"), 3.0, 1.2) * 0.35, 1.32, 0, 0.35, 0.7)   # 合一鐘聲
add(riser(0.95, 200, 3500) * 0.35, 2.02, 0, 1, 0.5)   # 生命能量凝聚
for hb in (2.42, 2.72):   # 心跳
    add(taiko(70, 40, 0.5, 0.05) * 0.5, hb, 0, 1, 0.15)
add(revcymbal(0.9), 2.12, 0, 0.35, 0.3)
# 閃光
for i, f in enumerate(["D6", "A6", "F#6", "D7"]):
    add(bell(note(f), 2.2, 2.5), 2.97 + i * 0.012, (i - 1.5) * 0.4, 0.09, 0.8)
add(boom(2.0, 60, 30) * 0.35, 2.98, 0, 1, 0.3)

# ======================= 3–6：五色補天 =======================
strings(["D1", "D2"], 3.0, 2.5, 0.32, nh=18, a=0.15, r=0.5, trem=12)      # 低音弦震音
strings(["Bb1", "F2", "Bb2", "D3"], 3.0, 1.5, 0.22, nh=12, a=0.2, r=0.4)
strings(["A1", "E2", "A2", "D3", "E3"], 4.4, 1.0, 0.25, nh=14, a=0.2, r=0.2)
rumble = lp(np.cumsum(rng.standard_normal(int(2.4 * SR))), 120); rumble = rumble / np.abs(rumble).max()
add(rumble * env(len(rumble), 0.2, 0.5) * 0.55, 3.0, 0, 1, 0.3)
for st in (3.08, 3.45, 3.9):     # 雷擊／裂縫劈啪
    n = int(1.0 * SR); cr = np.zeros(n); idx = rng.integers(0, int(0.5 * SR), 120); cr[idx] = rng.standard_normal(120)
    cr = hp(cr, 1200) * np.exp(-tt(1.0) * 4) * 2 + boom(1.0, 90, 40) * 0.4
    add(cr, st, rng.uniform(-0.5, 0.5), 0.45, 0.5)
for k in range(5):               # 五道光帶升空
    add(sweep_noise(1.25, 300, 5000, 0.4, lambda u: np.sin(np.pi * u) ** 1.5), 3.6 + k * 0.05, (k - 2) * 0.4, 0.28, 0.5)
add(riser(0.8, 400, 7000) * 0.4, 4.56, 0, 1, 0.4)
for k in range(5):               # 擊中裂縫
    add(taiko(150, 60, 0.8, 0.6) * 0.45 + bell(note(["D5", "E5", "F5", "A5", "C6"][k]), 0.8, 4) * 0.1, 4.92 + k * 0.06, (k - 2) * 0.45, 1, 0.4)
add(revcymbal(1.2), 4.18, 0, 0.5, 0.3)
add(boom(3.5) * 0.9, 5.34, 0, 1, 0.4)                         # 補天爆發
choir(["D3", "A3", "D4", "F#4", "A4"], 5.34, 1.1, 0.22, a=0.05, r=0.6)
strings(["D2", "A2", "D3", "F#3", "A3", "D4"], 5.34, 0.9, 0.3, nh=16, a=0.05, r=0.5)
sparkles(5.36, 0.8, 30, 0.08, ("D6", "F#6", "A6", "D7", "E7"))

# ======================= 6–11：學院誕生（120 BPM）=======================
B = 0.5
chords = [(6.0, ["D2", "A2", "D3", "F3", "A3"], ["D", "F", "A"]),
          (7.0, ["Bb1", "F2", "Bb2", "D3", "F3"], ["Bb", "D", "F"]),
          (8.0, ["F1", "C2", "F2", "A2", "C3"], ["F", "A", "C"]),
          (9.0, ["C2", "G2", "C3", "E3", "G3"], ["C", "E", "G"]),
          (10.0, ["Bb1", "F2", "Bb2", "D3", "F3"], ["Bb", "D", "F"]),
          (10.5, ["A1", "E2", "A2", "C#3", "E3"], ["A", "C#", "E"])]
for i, (st, ns, arp) in enumerate(chords):
    d = (chords[i + 1][0] if i + 1 < len(chords) else 11.0) - st
    strings(ns, st, d + 0.15, 0.34, nh=16, a=0.08, r=0.15)
    brass([n for n in ns[2:]], st, min(d, 0.9), 0.20 if st != 8.0 else 0.28)
    # 16 分音符頑固音型
    octs = [4, 4, 5, 4, 5, 5, 4, 5]
    for j in range(int(round(d / 0.125))):
        nm = arp[[0, 1, 2, 1, 2, 0, 1, 2][j % 8]] + str(octs[j % 8])
        add(pluck(note(nm)) * (1.0 if j % 4 == 0 else 0.7), st + j * 0.125, -0.35 if j % 2 else 0.35, 0.09 * (1 + 0.6 * (st - 6) / 5), 0.25)
for b in np.arange(6.0, 11.0, B):                       # 太鼓
    strong = abs((b - 6.0) % 1.0) < 1e-6
    add(taiko(115 if strong else 140, 48 if strong else 60, 1.0, 0.45) * (0.55 if strong else 0.32), b, 0, 1, 0.25)
for b in np.arange(10.5, 11.0, 0.0625):                  # 鼓滾
    add(taiko(160, 70, 0.4, 0.5) * (0.18 + 0.4 * (b - 10.5) / 0.5), b, rng.uniform(-0.4, 0.4), 1, 0.2)
add(riser(0.65, 300, 8000) * 0.5, 7.4, 0, 1, 0.4)        # 五元素匯聚
add(revcymbal(1.0), 7.05, 0, 0.5, 0.3)
add(boom(3.0) * 1.0, 8.03, 0, 1, 0.4)                    # 匯聚爆發
add(sweep_noise(1.2, 3000, 200, 0.5, lambda u: (1 - u) ** 2) * 0.35, 8.05, 0, 1, 0.5)   # 衝擊波
choir(["F3", "A3", "C4", "F4"], 8.0, 1.0, 0.16)
choir(["C3", "G3", "C4", "E4"], 9.0, 1.0, 0.17)
choir(["Bb2", "F3", "Bb3", "D4"], 10.0, 0.5, 0.18)
choir(["A2", "E3", "A3", "C#4"], 10.5, 0.55, 0.2)
scale = ["D6", "E6", "F#6", "A6", "B6", "D7", "E7", "F#7"]   # 學院生成晶鈴（上行）
for k in range(18):
    add(ping(note(scale[k % 8]) * (2 if k >= 8 and k % 8 < 2 else 1), 0.5), 8.25 + k * 0.125, (k % 5 - 2) * 0.35, 0.10, 0.6)
sparkles(8.2, 2.6, 14, 0.06, ("D6", "F#6", "A6", "B6", "D7"))
add(revcymbal(1.5), 9.52, 0, 0.6, 0.3)

# ======================= 11–15：品牌與邀請 =======================
fin = ["D2", "A2", "D3", "F#3", "A3", "D4", "F#4", "A4"]
strings(fin, 11.0, 4.0, 0.42, nh=16, a=0.04, r=2.3)
choir(["D3", "A3", "D4", "F#4", "A4", "D5"], 11.0, 4.0, 0.26, a=0.3, r=2.3)
brass(["D3", "A3", "D4", "F#4"], 11.0, 1.8, 0.3)
add(boom(4.0) * 1.0, 11.0, 0, 1, 0.45)
add(taiko(100, 42, 1.8, 0.5) * 0.6, 11.0, 0, 1, 0.4)
gong = additive(note("D2") * 1.0, 4.0, nh=30, roll=0.7, detune=(-14, 0, 17)) * np.exp(-tt(4.0) * 1.0)
add(lp(gong, 3500) * 0.25, 11.0, 0, 1, 0.6)
add(bell(note("A5"), 3.0, 2) * 0.45 + bell(note("D6"), 3.0, 1) * 0.25, 11.28, -0.2, 0.30, 0.7)
add(bell(note("D6"), 3.0, 2) * 0.45 + bell(note("F#6"), 3.0, 1) * 0.25, 11.82, 0.2, 0.28, 0.7)
add(bell(note("F#6"), 3.0, 2) * 0.35 + bell(note("A6"), 3.0, 1) * 0.3 + bell(note("D7"), 3.0, 1) * 0.15, 12.42, 0, 0.26, 0.7)
sparkles(11.0, 3.6, 10, 0.05, ("D6", "F#6", "A6", "D7"))

# ======================= 混音：殘響、母帶 =======================
ir_n = int(2.6 * SR); it = np.arange(ir_n) / SR
irL = rng.standard_normal(ir_n) * np.exp(-it / 0.55); irR = rng.standard_normal(ir_n) * np.exp(-it / 0.55)
irL = lp(irL, 7000); irR = lp(irR, 7000); irL[:int(0.012 * SR)] = 0; irR[:int(0.017 * SR)] = 0
irL /= np.sqrt((irL ** 2).sum()); irR /= np.sqrt((irR ** 2).sum())
wl = ss.fftconvolve(RL, irL)[:N]; wr = ss.fftconvolve(RR, irR)[:N]
outL = L + wl * 0.9; outR = R + wr * 0.9
# 低頻清理、柔和壓縮
outL = hp(outL, 28); outR = hp(outR, 28)
def comp(x, thr=0.35, ratio=3.0):
    envl = np.abs(ss.lfilter([0.002], [1, -0.998], np.abs(x)))
    g = np.where(envl > thr, (thr + (envl - thr) / ratio) / (envl + 1e-9), 1.0)
    return x * g
m = np.maximum(np.abs(outL), np.abs(outR)); outL = comp(outL / (m.max() + 1e-9)); outR = comp(outR / (m.max() + 1e-9))
outL = np.tanh(outL * 1.4) / np.tanh(1.4); outR = np.tanh(outR * 1.4) / np.tanh(1.4)
fade = np.ones(N); fs = int(13.2 * SR); fade[fs:] = np.linspace(1, 0.12, N - fs) ** 1.4; fade[-int(0.25 * SR):] *= np.linspace(1, 0, int(0.25 * SR))
fi = int(0.05 * SR); fade[:fi] *= np.linspace(0, 1, fi)
outL *= fade; outR *= fade
peak = max(np.abs(outL).max(), np.abs(outR).max()); outL *= 0.89 / peak; outR *= 0.89 / peak
wf.write(sys.argv[1] if len(sys.argv) > 1 else "intro.wav", SR, (np.stack([outL, outR], 1) * 32767).astype(np.int16))
print("ok", peak)
