# SWT MindFlow 3D 地圖系統（world/）

依「遊戲主畫面」與 3D 分鏡圖重建的 3D 學院全景，玩家可以用原本的背包客角色自由走動。
全部景物都由程式產生（three.js r128），不需要下載模型檔，也沒有新增任何外部套件。

- 入口：角色檔案 →「角色」分頁 → 練習場卡片 →「🏛️ 3D 學院全景（自由探索）」
- 直接開啟：`world/index.html?char=boy-ai`（`girl-ai` 是女生背包客；`&q=low|mid|high|ultra` 指定畫質）
- 從學院開啟時（`?embed=1`），走到村莊大門按「🚪 進入」會關閉全景、回到主畫面並進入該村莊（原本的 2.5D 村莊與關卡）

## 檔案

| 檔案 | 負責 |
|---|---|
| `index.html` | 頁面、HUD（返回、角色切換、鏡頭遠近、說明、小地圖、進入提示） |
| `css/world.css` | 樣式（觸控按鈕沿用 `../character/css/controls.css`） |
| `js/world-kit.js` | **共用積木**：可走區域與碰撞（Physics）、靜態網格合併（Batcher）、程式貼圖、浮島、橋、平台、階梯、欄杆、樹、玻璃圓頂、殿堂、涼亭、瀑布、天空與雲海 |
| `js/world-props.js` | **共用大型景物**：中央聖殿、能量地球噴泉、世界樹、蓮花池、冥想光影、漂浮徽章、自動種樹 |
| `js/maps/academy-hub.js` | 這張地圖的配置（所有座標都在這裡） |
| `js/world.js` | 執行：載入地圖、放入角色、第三人稱鏡頭、入口、小地圖、主迴圈 |

## 新增一張地圖

1. 複製 `js/maps/academy-hub.js` 成 `js/maps/<名稱>.js`，改 `MFWorld.maps["<名稱>"]`。
2. 在 `build(c)` 裡用積木排出場景，例如：
   ```js
   var isl = c.island({ x: 0, z: 0, r: 10, h: 0, pave: 6 });            // 可走的浮島（自動加欄杆）
   c.bridge({ pts: [[10, 0, 0], [20, 2, 0.5]], w: 3.6 });                 // 橋（自動平滑、兩側欄杆與燈）
   var d = c.glassDome({ x: 0, y: 0, z: -4, r: 4, rot: 0 });             // 建築（自動加碰撞）
   c.portal({ id: "mind", name: "智慧村", x: d.door[0], z: d.door[1] });  // 入口
   ```
3. 在 `index.html` 多載入這個檔案，網址加 `?map=<名稱>`。

## 角色與物理

- 沿用 `character/` 的角色模型、動畫、狀態機與跨裝置操作，沒有另外寫一套。
- `CharacterController` 新增選用的 `groundAt(x, z, y)`：有設定時腳會貼著地面（樓梯、坡道、不同高度的浮島）；
  沒設定時地面固定在 y = 0，迷宮尋寶與練習場的行為完全不變（240 幀數值比對新舊版相同）。
- 可走範圍＝浮島、橋、平台、階梯的聯集；走到邊緣會被擋住，不會掉下去。建築用圓柱或方塊障礙物擋住。
- 鏡頭沿著角色到鏡頭的方向逐段檢查，碰到建築、浮島或地面就拉近，不會穿牆。

## 效能

- 靜態網格依材質合併（約 50 個網格、11 萬個三角形），同一種材質、幾何、貼圖只建立一次。
- 畫質跟學院「畫質與色彩」設定：低（不開陰影、雲與光點減少）、中（手機與平板預設，陰影 1024）、高與超高（陰影 2048）。
- 手機解析度上限 1.5 倍；離開頁面時立刻釋放 3D 繪圖（`gl-guard.js`）。

## 使用的工具與授權

| 名稱 | 用途 | 官方來源 | 授權 | 商業使用 |
|---|---|---|---|---|
| three.js r128 | 3D 引擎（專案原本就在用，由 cdnjs 載入） | https://github.com/mrdoob/three.js | MIT | 可以 |
| GLTFLoader（three.js examples） | 讀取背包客模型（原本就在用） | 同上 | MIT | 可以 |
| 程式生成的場景、貼圖 | 本專案自行撰寫 | — | 本專案所有 | 可以 |

沒有使用 Blender、Poly Haven、Kenney 的檔案。之後如果要換成更精緻的模型，優先從 Poly Haven（CC0）或 Kenney（CC0）取得，
放在 `world/assets/` 並在這個表格補上來源與授權。

背包客模型（`character/models/`）是 Tripo 免費方案產生，免費方案的模型不可商用；平台若開始收費，需要升級 Tripo 或改用可商用的方式重新產生（與 3D 場景無關）。

three.js 授權聲明：Copyright © 2010-2021 three.js authors，以 MIT 授權釋出（https://github.com/mrdoob/three.js/blob/r128/LICENSE）。
