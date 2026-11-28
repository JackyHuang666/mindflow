# 開場序章：原始檔（重新渲染用）

網站只用到上一層的 `intro.js`、`intro.css`、`intro-1080.mp4`、`intro-720.mp4`、`poster.jpg`。這個資料夾是產生影片的原始程式，網站不會載入。

## 工具（全部免費）
- **Three.js r128**：3D 場景、材質、後製（Bloom、體積光、ACES 色調、顆粒、暗角）
- **Google Chrome（headless）＋ Puppeteer**：逐格渲染 1920×1080、30fps、450 格
- **Python（NumPy / SciPy）**：配樂與音效全部程式合成（D 小調 → D 大調）
- **FFmpeg（x264 / AAC）**：編碼 MP4（faststart，網頁可邊下載邊播）

## 檔案
- `film.html`、`film.js`：整段 15 秒動畫。`window.renderAt(秒)` 畫出任一格。四個場景：女媧造人（0–3）、五色補天（3–6）、學院誕生（6–11）、品牌與邀請（11–15）。
- `shoot.js`：逐格輸出 PNG。`node shoot.js 1920 1080 frames 0 15 30`；只看幾張預覽：`node shoot.js 960 540 prev 0 0 30 1.6 4.3 9.8`
- `audio.py`：`python3 audio.py intro.wav`
- `sheet.py`：把預覽圖排成一張對照表

`film.html` 需要同層 `lib/`：從 three.js r128 複製 `build/three.min.js`、`examples/js/postprocessing/{EffectComposer,RenderPass,ShaderPass,UnrealBloomPass}.js`、`examples/js/shaders/{CopyShader,LuminosityHighPassShader}.js`。

## 編碼
```
ffmpeg -framerate 30 -i frames/f_%04d.png -i intro.wav -map 0:v -map 1:a -c:v libx264 -profile:v high -preset slow -crf 21 -maxrate 5M -bufsize 10M -pix_fmt yuv420p -tune grain -g 60 -c:a aac -b:a 160k -af volume=-2dB -movflags +faststart -shortest intro-1080.mp4
ffmpeg -framerate 30 -i frames/f_%04d.png -i intro.wav -map 0:v -map 1:a -vf scale=1280:720:flags=lanczos -c:v libx264 -profile:v main -preset slow -crf 23 -maxrate 3.2M -bufsize 6.4M -pix_fmt yuv420p -g 60 -c:a aac -b:a 128k -af volume=-2dB -movflags +faststart -shortest intro-720.mp4
```
改了影片後，把 `intro.js` 裡的 `VER` 加 1，避免手機用到舊快取。

## 旁白
影片本身沒有人聲。旁白由 `intro.js` 依時間顯示字幕，並用裝置內建的中文語音唸出（Web Speech API）。之後若錄好真人旁白，可直接混進 `intro.wav` 再重新編碼。
