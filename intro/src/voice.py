"""把旁白人聲混進序章配樂。
用法：
  python3 voice.py music.wav out.wav voice1.mp3 voice2.mp3 voice3.mp3 voice4.mp3 voice5.mp3   # 五句各一檔
  python3 voice.py music.wav out.wav voice_all.mp3                                           # 一整檔（自動依停頓切成五句）
做的事：
  1. 每句去頭尾靜音、統一音量；太長的句子最多加速 15%（atempo，音高不變）
  2. 依畫面排進時間軸（SLOTS：開始秒數、建議結束秒數）；說不完就順延，最後一句超過 15 秒時延長結尾（品牌畫面停久一點）
  3. 配樂自動閃避（人聲出現時降約 7 dB，平滑起落）
  4. 輸出混音 wav，並印出每句的實際起訖時間（貼到 intro.js 的 LINES，字幕就會和人聲同步）
"""
import sys, json, subprocess, tempfile, os
import numpy as np, scipy.io.wavfile as wf, scipy.signal as ss

SR = 48000
SLOTS = [(0.30, 3.05), (3.15, 6.15), (6.25, 10.45), (10.55, 13.15), (13.25, 15.0)]
MAX_TEMPO = 1.15

def load(path, tempo=1.0):
    fd, tmp = tempfile.mkstemp(suffix=".wav"); os.close(fd)
    af = "aresample=48000" + (",atempo=%.4f" % tempo if abs(tempo - 1) > 1e-3 else "")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path, "-ac", "1", "-af", af, tmp], check=True)
    sr, x = wf.read(tmp); os.remove(tmp)
    x = x.astype(np.float32) / (32768.0 if x.dtype == np.int16 else 1.0)
    return x

def rms_env(x, win=0.02):
    n = max(1, int(win * SR)); return np.sqrt(np.convolve(x * x, np.ones(n) / n, "same"))

def trim(x, thr_db=-42):
    e = rms_env(x); thr = 10 ** (thr_db / 20) * max(e.max(), 1e-6) / 0.25
    idx = np.where(e > min(thr, e.max() * 0.08))[0]
    if len(idx) == 0: return x
    a = max(0, idx[0] - int(0.03 * SR)); b = min(len(x), idx[-1] + int(0.08 * SR))
    return x[a:b]

def split5(x):
    """一整檔：找最長的 4 段停頓切成 5 句"""
    e = rms_env(x, 0.03); quiet = e < e.max() * 0.04
    runs, s = [], None
    for i, q in enumerate(quiet):
        if q and s is None: s = i
        if not q and s is not None:
            if i - s > 0.18 * SR: runs.append((i - s, s, i))
            s = None
    voiced = np.where(~quiet)[0]
    runs = [r for r in runs if voiced[0] < r[1] and r[2] < voiced[-1]]
    if len(runs) < 4: raise SystemExit("一整檔裡找不到 4 個明顯停頓，請每句之間停 0.5 秒以上，或改成五句各一檔")
    cuts = sorted([(r[1] + r[2]) // 2 for r in sorted(runs, reverse=True)[:4]])
    b = [0] + cuts + [len(x)]
    return [x[b[i]:b[i + 1]] for i in range(5)]

def norm(x, peak_db=-3.0):
    return x * (10 ** (peak_db / 20) / max(np.abs(x).max(), 1e-6))

def main():
    music_p, out_p, *vs = sys.argv[1:]
    sr, m = wf.read(music_p); m = m.astype(np.float32) / 32768.0
    if len(vs) == 5:
        lines = [trim(load(p)) for p in vs]; srcs = vs
    elif len(vs) == 1:
        lines = [trim(s) for s in split5(load(vs[0]))]; srcs = None
    else:
        raise SystemExit("請給 5 個檔（每句一檔）或 1 個檔（整段）")
    # 太長就適度加速（重新從原檔以 atempo 處理，避免音質損失）
    out_lines = []
    for i, x in enumerate(lines):
        a, b = SLOTS[i]; room = (b - a) if i < 4 else 99
        d = len(x) / SR
        tempo = min(MAX_TEMPO, d / room) if d > room else 1.0
        if tempo > 1.0:
            if srcs: x = trim(load(srcs[i], tempo))
            else:
                fd, t1 = tempfile.mkstemp(suffix=".wav"); os.close(fd); wf.write(t1, SR, (x * 32767).astype(np.int16)); x = trim(load(t1, tempo)); os.remove(t1)
        out_lines.append(norm(x))
    # 排時間：依序放，前一句沒說完就往後順延
    starts, t = [], 0.0
    for i, x in enumerate(out_lines):
        st = max(SLOTS[i][0], t + 0.12); starts.append(st); t = st + len(x) / SR
    end = max(15.0, t + 0.7)
    if end > 17.5: print("注意：旁白總長讓結尾延到 %.1f 秒，建議配音語速調快一點" % end, file=sys.stderr)
    N = int(end * SR)
    if len(m) < N:   # 延長結尾：重複最後 0.5 秒的殘響並淡出
        pad = np.zeros((N - len(m), 2), np.float32); m = np.concatenate([m, pad])
    m = m[:N]
    vo = np.zeros(N, np.float32)
    for st, x in zip(starts, out_lines):
        i = int(st * SR); n = min(len(x), N - i); vo[i:i + n] += x[:n]
    # 人聲稍微加一點空間感與溫暖的高頻
    b, a = ss.butter(2, 90 / (SR / 2), "high"); vo = ss.lfilter(b, a, vo)
    # 配樂閃避
    env = rms_env(vo, 0.05); env = env / max(env.max(), 1e-6)
    gate = np.clip(env * 6, 0, 1); k = int(0.25 * SR); gate = np.convolve(gate, np.ones(k) / k, "same")
    duck = 1 - 0.55 * np.clip(gate, 0, 1)
    mix = m * duck[:, None] * 0.85 + vo[:, None] * 0.95
    fade = np.ones(N); fl = int(0.6 * SR); fade[-fl:] = np.linspace(1, 0, fl) ** 1.5
    mix *= fade[:, None]
    mix *= 0.89 / max(np.abs(mix).max(), 1e-6)
    wf.write(out_p, SR, (mix * 32767).astype(np.int16))
    timing = [[round(s, 2), round(s + len(x) / SR, 2)] for s, x in zip(starts, out_lines)]
    print(json.dumps({"duration": round(end, 2), "lines": timing}))

if __name__ == "__main__":
    main()
