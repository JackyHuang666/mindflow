# 開場序章：原始檔（重新渲染用）

網站只用到上一層的 `intro.js`、`intro.css`、`intro-1080.mp4`、`intro-720.mp4`、`poster.jpg`。這個資料夾是產生影片的原始程式，網站不會載入。

## v2（2.5D 插畫動畫，畫面質感對齊主畫面背景圖）
- 0–3 秒：`img/src1.jpg`（女媧造人）。鏡頭推近、分層視差、畫面微流動、銀河旋轉；五色光點匯入黏土、黏土發光、能量注入小人、閃光轉場。
- 3–6 秒：`img/src2.jpg`（五色補天）。裂縫震動閃爍；光帶從手往上「點燃」到裂縫；裂縫轉成金白色癒合；金光擴散。
- 6–11 秒：主畫面 `scenes/main.jpg`。一開始學院藏在雲霧裡（模糊版＋流動霧氣，只看得到天空和前景平台上的背包客），五元素光球降下、匯聚、爆發，學院從中央往外以能量邊緣浮現；五顆光球飛到五座分館。
- 11–15 秒：停在主畫面構圖，五元素光球環繞學院，品牌文字淡入。

## 工具（全部免費）
- **Three.js r128**：合成與後製（分層視差、流動、遮罩、粒子、光暈、體積光、Bloom）
- **Google Chrome（headless）＋ Puppeteer**：逐格渲染 1920×1080、30fps、450 格
- **Python（NumPy / SciPy / Pillow）**：圖片前處理、配樂與音效合成
- **FFmpeg（x264 / AAC）**：編碼 MP4

## 步驟
1. `python3 prep.py`：從 `img/src1.jpg`、`img/src2.jpg`、`../../scenes/main.jpg` 產生 `img/p*.jpg` 與遮罩（`p3_keep.png` 前景平台遮罩是手繪的，已附）。
2. `sh build.sh`：把 `noise.glsl` 填進 `film2.src.js`，產生 `film2.js`。
3. 準備 `lib/`：從 three.js r128 複製 `build/three.min.js`、`examples/js/postprocessing/{EffectComposer,RenderPass,ShaderPass,UnrealBloomPass}.js`、`examples/js/shaders/{CopyShader,LuminosityHighPassShader}.js`。
4. 預覽：`node shoot.js 960 540 prev 0 0 30 1.4 4.2 7.6 9.4 13.5`，再 `python3 sheet.py prev`。
5. 全片：`node shoot.js 1920 1080 frames 0 15 30`。
6. 配樂：`python3 audio.py intro.wav`。
7. 編碼：
```
ffmpeg -framerate 30 -i frames/f_%04d.png -i intro.wav -map 0:v -map 1:a -c:v libx264 -profile:v high -preset slow -crf 21 -maxrate 5M -bufsize 10M -pix_fmt yuv420p -g 60 -c:a aac -b:a 160k -af volume=-2dB -movflags +faststart -shortest intro-1080.mp4
ffmpeg -framerate 30 -i frames/f_%04d.png -i intro.wav -map 0:v -map 1:a -vf scale=1280:720:flags=lanczos -c:v libx264 -profile:v main -preset slow -crf 23 -maxrate 3.2M -bufsize 6.4M -pix_fmt yuv420p -g 60 -c:a aac -b:a 128k -af volume=-2dB -movflags +faststart -shortest intro-720.mp4
```
改了影片後，把 `intro.js` 裡的 `VER` 加 1，避免手機用到舊快取。

## 換圖
- 女媧兩張圖若有更高解析度版本（建議 3840×2160 以上），直接取代 `img/src1.jpg`、`img/src2.jpg` 重跑即可，畫面會更銳利。構圖若改變，需調整 `film2.src.js` 裡的位置常數（`CLAY`、`KID`、`GAL`、`HANDS`、`CRACK`）與 `prep.py` 的光帶範圍。
- 主畫面換圖時，同步更新 `p3_keep.png`（前景平台與人物）和 `film2.src.js` 的 `HALL`、`BLD`（五座分館位置）。

## 旁白
影片本身沒有人聲。旁白由 `intro.js` 依時間顯示字幕，並用裝置內建的中文語音唸出（Web Speech API）。
