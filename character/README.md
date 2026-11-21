# SWT MindFlow 角色動畫與跨裝置互動控制系統 v1.0

左手控制方向，右手執行技能，系統自動管理角色狀態與動畫。所有 SWT MindFlow 遊戲共用同一套操作方式。

- 測試場：`character/lab.html`（主平台 → 角色檔案 → 🧪 測試工具 →「🎮 角色控制測試場」）
- 自動化測試台：`character/test.html`（不需要 3D，用來驗證輸入、狀態機與物品邏輯）

## 在新遊戲中使用

```html
<link rel="stylesheet" href="https://jackyhuang666.github.io/222/character/css/controls.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://jackyhuang666.github.io/222/character/mindflow-character.js"></script>
<script>
  var input = new MFChar.InputManager({ root: document.getElementById("stage") });
  var inter = new MFChar.InteractionManager();          // 加入物品：inter.addItem({ id, name, icon, radius, height, weight, obj, pos })
  var player = MFChar.createPlayer({ THREE: THREE, scene: scene, input: input, interaction: inter, character: "boy" });
  // 每幀：
  player.update(dt, cameraYaw);
</script>
```

新增技能按鈕：`input.actions.addButton({ id: "dash", label: "閃避", icon: "💨", mode: "tap", slot: 4 })`，
按下後會出現在 `player.update` 讀到的 actions 裡，再到 `CharacterStateMachine.request()` 加上規則即可。

## 模組

| 檔案 | 負責 |
|---|---|
| `core.js` | 命名空間、事件、數學工具、裝置判斷、瀏覽器手勢防護 |
| `MultiTouchManager.js` | 核心一：每根手指（pointerId）獨立認領，互不干擾；cancel／失焦／轉向時安全解除 |
| `VirtualJoystick.js` | 左手浮動搖桿：360 度、死區、類比力道、放開立即停止＋彈簧回彈 |
| `MobileActionController.js` | 右手技能鈕（衝刺／跳躍／抓取放下）、預留欄位 |
| `InputManager.js` | 跨裝置輸入整合：鍵盤滑鼠與觸控輸出同一份輸入狀態 |
| `CharacterController.js` | 角色移動狀態：加減速、轉向、重力、跳躍階段、碰撞（全部用 deltaTime） |
| `InteractionManager.js` | 物品持有狀態＋核心二：抓取／放下自動切換、面向優先、放置不穿透 |
| `CharacterStateMachine.js` | 核心三：IDLE WALK RUN JUMP GRAB CARRY RELEASE CELEBRATE、優先權與衝突處理 |
| `ClayCharacterFactory.js` | 程式建模的黏土角色（男／女、換裝），Mixamo 命名骨架 |
| `AnimationLibrary.js` | 七種動作的 AnimationClip（＋持物上半身層、眨眼層） |
| `CharacterAnimationManager.js` | AnimationMixer / AnimationAction / crossFadeTo、上下半身分層 |
| `CharacterSystem.js` | 把以上組成一個玩家角色；物品與手部的座標轉換 |

## 角色素材：目前做法與正式素材需求

目前專案只有四視角設定圖，沒有 3D 模型。測試場的角色是依設定圖用程式組出來的黏土公仔，
有真正的骨架與 AnimationClip，但外觀只是「接近」設定圖。四視角圖沒有被當成動畫影格使用。

要達到和設定圖一模一樣的外觀，需要：

1. **每個角色一個綁骨的 `.glb` 模型**（建議 3,000–15,000 面，PBR 材質；黏土質感用 roughness 0.8–0.9 的貼圖）。
2. **人形骨架，骨頭名稱用 Mixamo 標準**：`mixamorigHips, Spine, Spine1, Neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand, RightShoulder…, LeftUpLeg, LeftLeg, LeftFoot, RightUpLeg…`。
   這樣本系統的動畫可以直接套用；站姿請用 A-pose（手臂往下約 70°）。
3. **眼睛分成獨立物件，命名 `EyeL`、`EyeR`**（眨眼動畫用）。
4. **換裝**：衣服、背包、髮型分成獨立網格（同一副骨架），切換時只換網格。
5. 若想用專業動畫取代程式動畫：從 Mixamo 或動畫師取得 idle、walk、run、jump（起跳／滯空／落地三段）、pick up、put down、cheer，
   放進同一個 `.glb` 或另外的動畫檔，名稱對應 `AnimationLibrary` 的 clip 名稱即可。

取得 `.glb` 後，替換 `ClayCharacterFactory.create()` 的結果即可（回傳同樣的 `rig` 結構：root、bones、rest），控制與狀態系統不用改。
