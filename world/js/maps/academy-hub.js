/*!
 * 地圖：身心智慧學院・全景（依「遊戲主畫面」與 3D 分鏡 1、2、6 重建）
 *
 * 配置（俯視，北方＝畫面上方＝ -Z）：
 *   南：觀景台 → 雲端步道 → 能量核心廣場（旋轉地球）→ 大階梯 → 中央聖殿（智慧殿堂）
 *   西：智慧村（玻璃圓頂、冥想光影）、西北：養生村（玻璃圓頂、蓮花池）
 *   東：共創村（紫色圓頂）、東北：導師村（金色殿堂）→ 世界樹、東南：圓滿村（櫻花金殿）
 * 單位：公尺（角色身高約 1）。所有座標集中在這個檔案，調整配置不用改程式。
 */
(function (w) {
  "use strict";
  var MW = w.MFWorld;

  MW.maps["academy-hub"] = {
    title: "身心智慧學院・3D 全景",
    spawn: { x: 0, z: 33.2, yaw: Math.PI },
    sky: { top: "#2a74d8", mid: "#86c4ff", horizon: "#eef7ff" },
    fog: { color: "#dcecfb", near: 90, far: 420 },
    sun: { dir: [-0.35, 0.8, 0.55], color: "#fff0d6", intensity: 1.75 },
    build: function (c) {
      var PI = Math.PI;
      c.environment({ seed: 77, seaY: -32 });

      /* ---------- 中央浮島（只是外觀，可走的範圍由廣場、階梯、平台決定） ---------- */
      c.island({ x: 0, z: -12, r: 18.4, h: -0.25, sz: 1.35, walk: false, rail: false, depth: 30, seed: 3,
        falls: [{ a: PI * 0.92, w: 5, len: 26 }, { a: PI * 0.08, w: 5, len: 26 }, { a: PI * 0.62, w: 3, len: 22 }, { a: PI * 0.38, w: 3, len: 22 }] });

      /* ---------- 觀景台 → 雲端步道 → 能量核心廣場 ---------- */
      var bal = c.island({ x: 0, z: 34, r: 5.6, h: 0, rim: 0.7, pave: 5.6, depth: 10, seed: 8, lamps: 0, falls: [{ a: PI / 2, w: 2.2, len: 16 }] });
      var road = c.bridge({ pts: [[0, 29.4, 0], [0, 11.6, 0]], w: 4.4, lampEvery: 6, tag: "road" });
      var plaza = c.phys.addCircle(0, 0, 11, 0, "plaza");
      c.cyl("stoneDark", 0, -0.35, 0, 11.4, 11.6, 0.7, 64, { cast: false });
      c.put(c.geo("disc48", function () { var g = new c.THREE.CircleGeometry(1, 48); g.rotateX(-PI / 2); return g; }), "pave", 0, 0.005, 0, 0, 11, 1, 11, { cast: false });
      c.railJobs.push(function () { c.railCircle(plaza, 0, 0, 11.1, 0, 10); });
      c.globeFountain({ x: 0, y: 0, z: 0 });
      // 步道中央的蓮花地紋
      var lotus = new c.THREE.Mesh(new c.THREE.PlaneGeometry(3.6, 3.6), new c.THREE.MeshBasicMaterial({ map: c.tex.lotus(), transparent: true, depthWrite: false }));
      lotus.rotation.x = -PI / 2; lotus.position.set(0, 0.02, 20); c.live.add(lotus);
      // 廣場四角的花台
      [PI * 0.25, PI * 0.75, PI * 1.25, PI * 1.75].forEach(function (a) {
        var x = Math.cos(a) * 8.3, z = Math.sin(a) * 8.3;
        c.cyl("stone", x, 0.3, z, 1.15, 1.25, 0.6, 20); c.flowerBed(x, 0.55, z, 1.0, a < PI ? "pink" : "flower");
        c.tree(x, 0.6, z, 0.75, a < PI ? "pink" : "round");
        c.phys.addCircleObstacle(x, z, 1.25, -0.5, 0.75);
      });

      /* ---------- 大階梯 → 聖殿平台 → 中央聖殿 ---------- */
      c.ramp({ x: 0, z: -14.5, w: 9, d: 7, h0: 2.4, h1: 0, tag: "stairs" });
      var terr = c.terrace({ x: 0, z: -26, w: 34, d: 16, h: 2.4, tag: "terrace" });
      var pal = c.palace({ x: 0, y: 2.4, z: -27.2 });
      c.label(0, 2.4 + 22, -30, "智慧殿堂", "中央聖殿", "#9fe9ff");
      c.portal({ id: "hallin", name: "智慧殿堂", sub: "整合心智、精神、策略與團隊智慧", x: pal.door[0], z: pal.door[1] + 0.4, r: 3 });
      [-14, -6.5, 6.5, 14].forEach(function (x) { c.tree(x, 2.4, -19.6, 0.8, "cypress", true); });

      /* ---------- 西：智慧村（水學院） ---------- */
      var wm = c.island({ x: -28, z: 6, r: 9.5, h: 0.4, pave: 6, depth: 16, seed: 11, lamps: 0,
        falls: [{ a: PI * 0.85, w: 4, len: 20 }, { a: PI * 1.05, w: 3, len: 18 }, { a: PI * 0.62, w: 3, len: 16 }] });
      c.bridge({ pts: [[-10, 1.6, 0], [-14.6, 3.6, 0.2], [-19.4, 5.3, 0.4]], w: 3.6, lampEvery: 6 });
      var mind = c.glassDome({ x: -30.5, y: 0.4, z: 6.5, r: 5.4, rot: PI / 2, inner: "#8fe8ff" });
      c.meditator({ x: -30.5, y: 0.4, z: 6.5 });
      c.label(-30.5, 0.4 + 12, 6.5, "智慧村・水學院", "認知覺醒", "#9fe9ff");
      c.portal({ id: "mind", name: "智慧村", sub: "認知覺醒・水學院", x: mind.door[0], z: mind.door[1], r: 3 });

      /* ---------- 西北：養生村（地學院） ---------- */
      var lf = c.island({ x: -34, z: -26, r: 9.5, h: 3.2, pave: 6.5, depth: 18, seed: 13,
        falls: [{ a: PI, w: 4, len: 24 }, { a: PI * 0.75, w: 3, len: 20 }, { a: PI * 1.3, w: 3.5, len: 22 }] });
      c.bridge({ pts: [[-16, -24, 2.4], [-20.6, -24.6, 2.8], [-25.6, -25, 3.2]], w: 3.6, lampEvery: 5 });
      var life = c.glassDome({ x: -38.6, y: 3.2, z: -27, r: 4.6, rot: PI / 2, inner: "#c9ffd6" });
      c.glassDome({ x: -35.6, y: 3.2, z: -20.2, r: 2.3, rot: PI * 0.75, drumH: 1.6 });
      c.lotusFountain({ x: -31.5, y: 3.2, z: -32, r: 2 });
      c.label(-38.6, 3.2 + 11, -27, "養生村・地學院", "覺察之門", "#c9ffb0");
      c.portal({ id: "gate", name: "養生村", sub: "覺察之門・地學院", x: life.door[0], z: life.door[1], r: 3 });

      /* ---------- 東：共創村（風學院，紫色圓頂） ---------- */
      var co = c.island({ x: 28, z: 4, r: 8.5, h: 0.4, pave: 6, depth: 15, seed: 17,
        falls: [{ a: 0, w: 4, len: 20 }, { a: PI * 0.3, w: 3, len: 16 }, { a: -PI * 0.25, w: 3, len: 17 }] });
      c.bridge({ pts: [[10, 1.6, 0], [15, 3, 0.2], [20.5, 3.8, 0.4]], w: 3.6, lampEvery: 6 });
      var chess = c.glassDome({ x: 30.5, y: 0.4, z: 4, r: 4.2, rot: -PI / 2, glass: "glassViolet", win: "winViolet", glow: "Violet", inner: "#d6b8ff" });
      c.pavilion(26, 0.4, 10.2, 1.3, "violetRoof"); c.pavilion(26, 0.4, -2.2, 1.3, "violetRoof");
      c.floatEmblem(30.5, 0.4 + 2.4 + 4.2 + 3.2, 4, "star", "#d9b8ff", 3.2);
      c.label(30.5, 0.4 + 14, 4, "共創村・風學院", "智慧棋局", "#d9b8ff");
      c.portal({ id: "chess", name: "共創村", sub: "智慧棋局・風學院", x: chess.door[0], z: chess.door[1], r: 3 });

      /* ---------- 東北：導師村（火學院，金色殿堂）→ 世界樹 ---------- */
      var mt = c.island({ x: 32, z: -20, r: 9, h: 2.4, pave: 6, depth: 16, seed: 19, falls: [{ a: 0, w: 4, len: 22 }] });
      c.bridge({ pts: [[16, -22, 2.4], [19.6, -21.5, 2.4], [24, -21, 2.4]], w: 3.6, lampEvery: 5 });
      var mentor = c.hall({ x: 35.2, y: 2.4, z: -20, w: 9, d: 7, h: 4.5, rot: -PI / 2, emblem: "flame", emblemColor: "#ffd58a" });
      c.label(35.2, 2.4 + 15, -20, "導師村・火學院", "心智突破", "#ffd58a");
      c.portal({ id: "mentor", name: "導師村", sub: "心智突破・火學院", x: mentor.door[0], z: mentor.door[1], r: 3 });

      var wt = c.island({ x: 32, z: -45, r: 9.5, h: 4, pave: 9.5, depth: 20, seed: 23, lamps: 8,
        falls: [{ a: -PI / 2, w: 5, len: 26 }, { a: -PI * 0.15, w: 3, len: 22 }, { a: -PI * 0.85, w: 3, len: 22 }] });
      c.bridge({ pts: [[26.5, -26.2, 2.4], [26.2, -31.5, 3.2], [27.6, -37.8, 4]], w: 3.4, lampEvery: 5 });
      var tree = c.worldTree({ x: 32, y: 4, z: -45, rot: Math.atan2(-4.4, 7.2), scale: 1 });
      c.label(32, 4 + 23, -45, "世界樹", "晁海十階成長路徑", "#ffe39a");
      c.portal({ id: null, name: "世界樹", sub: "內部場景即將開放", x: tree.door[0], z: tree.door[1], r: 3 });

      /* ---------- 東南：圓滿村（光學院，櫻花金殿） ---------- */
      var yv = c.island({ x: 22, z: 26, r: 8.5, h: 0, pave: 5.5, depth: 15, seed: 29,
        falls: [{ a: PI * 0.5, w: 4, len: 18 }, { a: PI * 0.15, w: 3, len: 16 }] });
      c.bridge({ pts: [[1.2, 22.4, 0], [7, 24, 0], [14.6, 25.6, 0]], w: 3.4, lampEvery: 6 });
      var lifeV = c.hall({ x: 25.4, y: 0, z: 26.6, w: 8, d: 6, h: 4, rot: -PI / 2, emblem: "sun", emblemColor: "#fff0b0" });
      c.label(25.4, 13.5, 26.6, "圓滿村・光學院", "生命價值", "#ffd0e4");
      c.portal({ id: "life", name: "圓滿村", sub: "生命價值・光學院", x: lifeV.door[0], z: lifeV.door[1], r: 3 });

      /* ---------- 花草樹木（村莊內的樹有碰撞；中央浮島外圍只是景觀） ---------- */
      var vil = [
        [wm, -28, 6, 9.5, 0.4, ["round", "round", "cypress", "bush", "flowers"], [[-19.4, 5.3, mind.door[0], mind.door[1]]], "flower"],
        [lf, -34, -26, 9.5, 3.2, ["round", "pink", "bush", "flowers"], [[-25.6, -25, life.door[0], life.door[1]]], "pink"],
        [co, 28, 4, 8.5, 0.4, ["round", "cypress", "bush", "flowers"], [[20.5, 3.8, chess.door[0], chess.door[1]]], "flower"],
        [mt, 32, -20, 9, 2.4, ["round", "gold", "bush"], [[24, -21, mentor.door[0], mentor.door[1]], [24, -21, 26.4, -28]], "pink"],
        [wt, 32, -45, 9.5, 4, ["bush", "flowers"], [[27.6, -37.8, tree.door[0], tree.door[1]]], "flower"],
        [yv, 22, 26, 8.5, 0, ["pink", "pink", "pink", "flowers", "bush"], [[14.6, 25.6, lifeV.door[0], lifeV.door[1]]], "pink"]
      ];
      vil.forEach(function (v, i) {
        c.scatter({ x: v[1], z: v[2], rMin: v[3] * 0.45, rMax: v[3] - 1.1, y: v[4], count: 9, kinds: v[5], keep: v[6].map(function (k) { return k.concat([2.8]); }), owner: v[0], avoidWalk: false, solid: true, pad: 1.1, flower: v[7], seed: 100 + i });
      });
      c.scatter({ x: 0, z: -12, rMin: 4, rMax: 19, sz: 1.35, y: -0.25, count: 70, kinds: ["round", "round", "pink", "cypress", "bush", "bush", "flowers"], avoidWalk: true, pad: 1.4, seed: 7 });
    }
  };
})(window);
