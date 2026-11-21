/*!
 * 角色控制測試場：示範如何在遊戲中使用 MFChar，並提供逐項驗收清單。
 * 任務：把 3 件物品搬進發光圓圈（放進去會自動慶祝）。木樁上方也可以放東西。
 */
(function (w) {
  "use strict";
  var NS = w.MFChar, M = NS.math, d = w.document;
  var $ = function (s) { return d.querySelector(s); };
  var boot = $("#boot");
  // 嵌入在主平台「角色檔案 → 角色」時：顯示返回鈕，關閉時通知主畫面
  var QS = {}; try { QS = Object.fromEntries(new URLSearchParams(w.location.search)); } catch (e) {}
  var EMBED = QS.embed === "1" && w.parent !== w;
  function closeEmbed() { try { w.parent.postMessage({ type: "mfc-lab-close" }, "*"); } catch (e) {} }
  if (EMBED) {
    d.documentElement.classList.add("embed");
    d.addEventListener("click", function (e) { if (e.target.closest && e.target.closest('[data-cmd="close"]')) closeEmbed(); });
    w.addEventListener("keydown", function (e) { if (e.key === "Escape") closeEmbed(); });
  }
  // 在「裝置預覽」裡：模擬瀏海與底部橫條的安全區域
  var PREVIEW = QS.preview === "1";
  if (PREVIEW) {
    d.documentElement.classList.add("in-preview");
    if (QS.safe) { var sa = QS.safe.split(",").map(function (v) { return (+v || 0) + "px"; }); ["t", "r", "b", "l"].forEach(function (k, i) { d.documentElement.style.setProperty("--sa-" + k, sa[i] || "0px"); }); }
  }
  if (!w.THREE) { boot.innerHTML = "3D 引擎載入失敗，請確認網路連線後重新整理。" + (EMBED ? '<br><br><button data-cmd="close" style="font:inherit;padding:10px 18px;border-radius:12px;border:0;background:#24343a;color:#fff">返回角色檔案</button>' : ""); return; }
  var THREE = w.THREE;
  var stage = $("#stage"), canvas = $("#cv");
  NS.lockBrowserGestures(stage);

  /* ================= 輸入 ================= */
  var input = new NS.InputManager({ root: stage, uiParent: stage, actionKeys: { KeyC: "celebrate" } });
  input.actions.addButton({ id: "celebrate", label: "慶祝", icon: "🎉", mode: "tap", slot: 3 });   // 示範：新增技能只要一行

  /* ================= 場景 ================= */
  var device = input.device;
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(w.devicePixelRatio || 1, device.kind === "phone" ? 2 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfe6d6);
  scene.fog = new THREE.Fog(0xcfe6d6, 9, 24);
  var camera = new THREE.PerspectiveCamera(40, 1, 0.05, 80);

  scene.add(new THREE.HemisphereLight(0xfff6e6, 0x7d9a76, 0.7));
  var sun = new THREE.DirectionalLight(0xfff0d8, 1.25);
  sun.position.set(3, 6, 4); sun.castShadow = true;
  sun.shadow.mapSize.set(device.kind === "phone" ? 1024 : 2048, device.kind === "phone" ? 1024 : 2048);
  var sc = sun.shadow.camera; sc.left = sc.bottom = -4; sc.right = sc.top = 4; sc.near = 0.5; sc.far = 16; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);
  var fill = new THREE.DirectionalLight(0xdbe9ff, 0.35); fill.position.set(-4, 3, -3); scene.add(fill);

  // 顏色以 sRGB 指定，轉成線性空間，畫面才會和設計稿的顏色一致（不會泛白）
  function lin(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function clay(hex, o) { return new THREE.MeshStandardMaterial(Object.assign({ color: lin(hex), roughness: 0.9, metalness: 0 }, o || {})); }
  function add(geo, m, x, y, z, s) { var o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (s) o.scale.set(s[0], s[1], s[2]); o.castShadow = o.receiveShadow = true; scene.add(o); return o; }

  // 地面：黏土草地（頂點色做出深淺）
  var gGeo = new THREE.CircleGeometry(15, 64); gGeo.rotateX(-Math.PI / 2);
  var col = [], pa = gGeo.attributes.position, c = new THREE.Color();
  for (var i = 0; i < pa.count; i++) { var x = pa.getX(i), z = pa.getZ(i), n = Math.sin(x * 1.3) * Math.cos(z * 1.1) * 0.5 + Math.sin(x * 0.4 + z * 0.7) * 0.5; c.setHSL(0.27 + n * 0.02, 0.32, 0.6 + n * 0.04).convertSRGBToLinear(); col.push(c.r, c.g, c.b); }
  gGeo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  var ground = new THREE.Mesh(gGeo, clay(0xffffff, { vertexColors: true })); ground.receiveShadow = true; scene.add(ground);
  var path = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.9, 64), clay(0xe6d3a8)); path.rotation.x = -Math.PI / 2; path.position.y = 0.004; path.receiveShadow = true; scene.add(path);

  var inter = new NS.InteractionManager();
  inter.bounds = 13.5;

  // 障礙物：樹、石頭、木樁（木樁上方可以放東西）
  function tree(x, z, s) {
    add(new THREE.CylinderGeometry(0.09 * s, 0.12 * s, 0.6 * s, 10), clay(0x9a6a45), x, 0.3 * s, z);
    add(new THREE.SphereGeometry(0.5 * s, 18, 14), clay(0x7fae6e), x, 0.9 * s, z, [1, 0.9, 1]);
    add(new THREE.SphereGeometry(0.34 * s, 16, 12), clay(0x8dbb78), x + 0.2 * s, 1.25 * s, z + 0.1 * s);
    inter.obstacles.push({ x: x, z: z, r: 0.16 * s + 0.04 });
  }
  function rock(x, z, s) { add(new THREE.DodecahedronGeometry(0.3 * s, 1), clay(0xb9b3a6), x, 0.16 * s, z, [1.2, 0.7, 1]); inter.obstacles.push({ x: x, z: z, r: 0.33 * s, h: 0.24 * s }); }
  [[-3.4, -2.6, 1.2], [4.2, -3.6, 1.4], [-5.5, 3.2, 1.3], [5.6, 2.8, 1.1], [0.5, -6, 1.5], [-2, 6.5, 1.2], [7.5, -0.5, 1.3], [-7.6, -1.2, 1.4]].forEach(function (t) { tree(t[0], t[1], t[2]); });
  [[2.2, -1.6, 1], [-1.8, 2.6, 0.8], [3.6, 3.8, 1.1]].forEach(function (t) { rock(t[0], t[1], t[2]); });
  var stump = { id: "stump", x: -2.6, z: -0.6, r: 0.34, h: 0.24, kind: "stump" };
  add(new THREE.CylinderGeometry(0.34, 0.38, 0.24, 20), clay(0xa8774f), stump.x, 0.12, stump.z);
  add(new THREE.CylinderGeometry(0.3, 0.3, 0.01, 20), clay(0xd9b383), stump.x, 0.245, stump.z);
  inter.surfaces.push(stump);
  inter.obstacles.push({ x: stump.x, z: stump.z, r: stump.r, h: stump.h, surfaceId: "stump" });

  // 目標：發光圓圈
  var goal = { id: "goal", x: 1.8, z: 1.6, r: 0.75, h: 0, kind: "goal" };
  var ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.75, 48), new THREE.MeshBasicMaterial({ color: lin(0xffe08a), transparent: true, opacity: 0.85 }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(goal.x, 0.006, goal.z); scene.add(ring);
  var disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), new THREE.MeshBasicMaterial({ color: lin(0xfff3c4), transparent: true, opacity: 0.35 }));
  disc.rotation.x = -Math.PI / 2; disc.position.set(goal.x, 0.005, goal.z); scene.add(disc);
  inter.surfaces.push(goal);

  // 互動物品（不同大小、形狀、重量）
  function makeItem(def) {
    var g = new THREE.Group();
    def.build(g);
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(def.x, 0, def.z); g.rotation.y = def.ry || 0;
    scene.add(g);
    return inter.addItem({ id: def.id, name: def.name, icon: def.icon, radius: def.radius, height: def.height, weight: def.weight, obj: g, pos: { x: def.x, y: 0, z: def.z } });
  }
  var ITEMS = [
    { id: "crate", name: "木箱", icon: "📦", radius: 0.15, height: 0.24, weight: 2, x: -1.2, z: -1.4, build: function (g) {
      var m = clay(0xc8955f), m2 = clay(0x9c6a3e);
      var b = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), m); b.position.y = 0.12; g.add(b);
      [-1, 1].forEach(function (k) { var s = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.04, 0.25), m2); s.position.y = 0.12 + k * 0.08; g.add(s); });
    } },
    { id: "pot", name: "陶罐", icon: "🏺", radius: 0.13, height: 0.26, weight: 1.5, x: 0.9, z: -2.6, build: function (g) {
      var pts = [[0.01, 0], [0.09, 0.01], [0.13, 0.08], [0.12, 0.17], [0.07, 0.23], [0.08, 0.26], [0.06, 0.26]].map(function (p) { return new THREE.Vector2(p[0], p[1]); });
      g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 24), clay(0xd98e62)));
      var band = new THREE.Mesh(new THREE.TorusGeometry(0.124, 0.012, 8, 28), clay(0xf2d3a2)); band.rotation.x = Math.PI / 2; band.position.y = 0.13; g.add(band);
    } },
    { id: "compass", name: "羅盤", icon: "🧭", radius: 0.1, height: 0.07, weight: 1, x: -0.4, z: 1.2, build: function (g) {
      var gold = new THREE.MeshStandardMaterial({ color: lin(0xd9b24a), metalness: 0.55, roughness: 0.35 });
      var b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 28), gold); b.position.y = 0.02; g.add(b);
      var face = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.005, 28), clay(0xfff4dc)); face.position.y = 0.042; g.add(face);
      var nd = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.12, 4), clay(0xc0392b)); nd.rotation.x = Math.PI / 2; nd.position.y = 0.05; g.add(nd);
      var lid = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 28), gold); lid.position.set(0, 0.1, -0.09); lid.rotation.x = -1.2; g.add(lid);
    } },
    { id: "ball", name: "毛線球", icon: "🧶", radius: 0.12, height: 0.24, weight: 1, x: 3.2, z: 0.2, build: function (g) {
      var s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 18), clay(0xe7a6b8)); s.position.y = 0.12; g.add(s);
      for (var k = 0; k < 3; k++) { var t = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.008, 6, 30), clay(0xd28aa0)); t.position.y = 0.12; t.rotation.set(k * 1.05, k * 0.6, 0); g.add(t); }
    } }
  ];
  ITEMS.forEach(makeItem);

  // 目標高亮：腳下光圈
  var hi = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.25, 32), new THREE.MeshBasicMaterial({ color: lin(0x7ee0c3), transparent: true, opacity: 0.9, depthWrite: false }));
  hi.rotation.x = -Math.PI / 2; hi.visible = false; scene.add(hi);

  /* ================= 玩家 ================= */
  // 角色清單：程式建模角色＋AI 生成的 .glb 模型（放在 character/models/）
  // 有 AI 模型時只列 AI 模型；沒有模型檔時才退回程式建模角色
  var AI = (w.MFCHAR_MODELS || []).map(function (m) { return { id: m.id, label: m.label, glb: m }; });
  var CHARS = AI.length ? AI : [{ id: "boy", label: "👦 男生" }, { id: "girl", label: "👧 女生" }];
  var charIdx = Math.max(0, CHARS.findIndex(function (c) { return c.id === QS.char; }));
  var OUTFIT_KEYS = Object.keys(NS.ClayCharacterFactory.OUTFITS), outfitIdx = 0, glbCache = {};
  function charSpec() { var c = CHARS[charIdx]; if (c.glb) return { id: c.id }; return Object.assign({}, NS.ClayCharacterFactory.PRESETS[c.id], NS.ClayCharacterFactory.OUTFITS[OUTFIT_KEYS[outfitIdx]]); }
  function applyChar(done) {
    var c = CHARS[charIdx], btn = d.querySelector('[data-cmd="char"]');
    if (btn) btn.textContent = c.label;
    if (!c.glb) { player.setCharacter(charSpec()); if (done) done(); return; }
    if (glbCache[c.id]) { player.setCharacter({ rig: glbCache[c.id] }); if (done) done(); return; }
    toast("載入 3D 模型中…");
    NS.GLBCharacterLoader.load(THREE, c.glb.url, Object.assign({ height: 1 }, c.glb, { name: c.label })).then(function (rig) {
      rig.keep = true; glbCache[c.id] = rig;
      if (CHARS[charIdx] === c) player.setCharacter({ rig: rig });
      toast(c.label + " 已載入"); if (done) done();
    }, function (err) { console.error(err); toast("模型載入失敗：" + (err && err.message || err)); });
  }
  var player = NS.createPlayer({ THREE: THREE, scene: scene, input: input, interaction: inter, character: CHARS[charIdx].glb ? "boy" : charSpec() });
  if (CHARS[charIdx].glb) { player.object.visible = false; applyChar(function () { player.object.visible = true; }); }
  if (AI.length) { var ob = d.querySelector('[data-cmd="outfit"]'); if (ob) ob.hidden = true; }   // AI 模型的換裝＝換一套模型，用「角色」鈕切換
  player.controller.pos.z = 1.5; player.controller.yaw = player.controller.targetYaw = 0;

  /* ================= 鏡頭 ================= */
  var cam = { yaw: 0, dist: 4.4, height: 2.35, look: new THREE.Vector3(), pos: new THREE.Vector3() };
  function updateCamera(dt, snap) {
    var P = player.controller.pos, portrait = w.innerHeight > w.innerWidth;
    var dist = cam.dist * (portrait ? 1.3 : 1), h = cam.height * (portrait ? 1.22 : 1);
    var tx = P.x + Math.sin(cam.yaw) * dist, tz = P.z + Math.cos(cam.yaw) * dist, ty = h + P.y * 0.35;
    var k = snap ? 1 : 1 - Math.exp(-6 * dt);
    cam.pos.x += (tx - cam.pos.x) * k; cam.pos.y += (ty - cam.pos.y) * k; cam.pos.z += (tz - cam.pos.z) * k;
    cam.look.x += (P.x - cam.look.x) * k; cam.look.y += (0.5 + P.y * 0.4 - cam.look.y) * k; cam.look.z += (P.z - cam.look.z) * k;
    camera.position.copy(cam.pos); camera.lookAt(cam.look);
    sun.position.set(P.x + 3, 6, P.z + 4); sun.target.position.set(P.x, 0, P.z);
  }
  function resize() {
    var W = w.innerWidth, H = w.innerHeight;
    renderer.setSize(W, H, false); camera.aspect = W / H;
    camera.fov = W < H ? 52 : 40; camera.updateProjectionMatrix();
  }
  w.addEventListener("resize", resize); resize();
  updateCamera(0, true);

  /* ================= HUD ================= */
  var toastT = 0;
  function toast(msg) { var t = $("#toast"); t.textContent = msg; t.classList.add("on"); toastT = 1.8; }
  var placed = {};
  function goalCount() { return Object.keys(placed).filter(function (k) { return placed[k]; }).length; }
  function setGoalChip() { $("#st-goal").textContent = "目標 " + goalCount() + "/3"; }

  player.on("action", function (e) {
    var r = e.result;
    if (!r.ok && r.message) toast(r.message);
    if (!r.ok && r.reason === "busy") { CK.tick("lockBusy"); }
    if (!r.ok && r.reason === "airborne") { CK.tick("noDouble"); }
    if (r.ok) {
      var t = e.type === "action" ? (inter.busy === "grab" ? "grab" : "release") : e.type;
      if (e.meta && e.meta.moving) CK.tick("move_" + t);
      if (e.meta && e.meta.source === "touch" && e.meta.moving) CK.tick("mt_" + t);
      if (e.meta && e.meta.source === "touch") CK.tick("mtButton");
    }
  });
  input.on("blocked", function (id) { if (id === "action") CK.tick("lockBusy"); });
  input.on("press", function (id) { if (id === "sprint" && input.joystick.value.active) CK.tick("mt_sprint"); });
  input.on("touchcancel", function () { CK.flag.cancelled = true; });

  inter.on("grabDone", function (it) { CK.tick("grab"); CK.flag.heldSince = performance.now(); toast("抓到了：" + it.icon + " " + it.name); });
  inter.on("placed", function (e) {
    CK.tick("release"); CK.tick("placeOk");
    if (e.place.kind === "goal") { placed[e.item.id] = true; toast(e.item.icon + " 放進目標了！"); }
    else { placed[e.item.id] = false; if (e.place.kind === "stump") toast("放在木樁上了"); }
    setGoalChip();
  });
  inter.on("grabStart", function (it) { placed[it.id] = false; setGoalChip(); });
  player.on("state", function (e) {
    $("#st-state").textContent = e.to;
    if (e.to === "WALK") CK.tick("walk");
    if (e.to === "RUN") CK.tick("run");
    if (e.to === "JUMP") CK.tick("jump");
    if (e.to === "CELEBRATE") CK.tick("celebrate");
    if (e.to === "CARRY") CK.tick("carryState");
    if (e.from === "CELEBRATE" || e.from === "RELEASE" || e.from === "GRAB") CK.tick("backNormal");
    if (e.from === "JUMP" && (e.to === "IDLE" || e.to === "WALK" || e.to === "RUN" || e.to === "CARRY")) CK.tick("jumpBack");
  });

  // 工具列
  var openPop = null;
  function toggle(id) { var el = $("#" + id), on = el.hidden; ["views", "debug", "check"].forEach(function (k) { $("#" + k).hidden = true; }); el.hidden = !on; openPop = on ? id : null; if (id === "check" && on) CK.render(); }
  stage.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var cmd = b.dataset.cmd;
    if (cmd === "preview") { w.location.href = "../device-preview.html?page=lab&from=lab&char=" + encodeURIComponent(CHARS[charIdx].id) + (EMBED ? "&embed=1" : ""); return; }
    if (cmd === "char") { charIdx = (charIdx + 1) % CHARS.length; applyChar(); CK.tick("swapChar"); }
    else if (cmd === "outfit") {
      if (CHARS[charIdx].glb) { toast("AI 模型的換裝＝換成另一套模型"); return; }
      outfitIdx = (outfitIdx + 1) % OUTFIT_KEYS.length; player.setCharacter(charSpec()); toast("換裝：" + ["森林綠", "天空藍", "夕陽橘"][outfitIdx]); CK.tick("swapChar");
    }
    else if (cmd === "views") toggle("views");
    else if (cmd === "debug") toggle("debug");
    else if (cmd === "check") toggle("check");
    else if (cmd === "check-reset") { CK.reset(); }
    else if (cmd === "celebrate") input.push("celebrate", "keyboard");
    if (b.dataset.view) {
      var off = { front: 0, left: -Math.PI / 2, back: Math.PI, right: Math.PI / 2 }[b.dataset.view];
      player.controller.faceTo(cam.yaw + off);
      CK.view[b.dataset.view] = true; if (Object.keys(CK.view).length >= 4) CK.tick("turn4");
    }
    if (b.dataset.fps != null) { fpsCap = +b.dataset.fps; d.querySelectorAll("[data-fps]").forEach(function (x) { x.classList.toggle("on", x === b); }); if (fpsCap) CK.tick("fps" + fpsCap); }
    if (b.dataset.ui) { input.setTouchUI(b.dataset.ui === "touch"); }
  });
  var spin = $("#spin");
  d.querySelector('[data-cmd="char"]').textContent = CHARS[charIdx].label;

  // 調整參數
  function tune(id, key, fmt) {
    var el = $("#tune-" + id), v = $("#tune-" + id + "-v");
    el.value = player.controller.p[key]; v.textContent = fmt(el.value);
    el.addEventListener("input", function () { player.controller.p[key] = +el.value; v.textContent = fmt(el.value); });
  }
  tune("run", "runSpeed", function (x) { return (+x).toFixed(1) + " m/s"; });
  tune("jump", "jumpHeight", function (x) { return (+x).toFixed(2) + " m"; });

  /* ================= 驗收清單 ================= */
  var CK = {
    key: "mfc-lab-check-" + (device.touch ? device.kind : "desktop"),
    done: {}, flag: {}, view: {},
    groups: [
      ["角色動畫", [["idle", "待機：呼吸、眨眼、偶爾轉頭"], ["walk", "走路"], ["run", "衝刺（跑步）"], ["jump", "跳躍：下蹲 → 起跳 → 滯空 → 落地"], ["turn4", "轉身：正面、左側、背面、右側（連續旋轉）", "按 🔄 轉身 逐一點四個方向"], ["grab", "抓取動畫"], ["release", "放下動畫"], ["celebrate", "慶祝"], ["swapChar", "切換角色或換裝，動畫照常"]]],
      ["多點觸控", [["mtJoy", "左手搖桿可控制上下左右", "推動搖桿走一段"], ["mtDiag", "斜向移動"], ["mtButton", "右手可獨立執行技能"], ["mt2", "左右手同時操作（偵測到 2 指以上）"], ["mt_sprint", "移動＋衝刺"], ["mt_jump", "移動＋跳躍"], ["mt_grab", "移動＋抓取"], ["mt_release", "移動＋放下"], ["mt_celebrate", "移動＋其他技能（慶祝）"], ["mtRecover", "觸控中斷後恢復正常", "例如滑出畫面、切到別的 App 再回來，然後再推搖桿"]]],
      ["物品互動", [["grab", "抓取附近物品"], ["autoRelease", "抓取後按鈕自動變成「放下」"], ["autoGrab", "放下後按鈕自動恢復「抓取」"], ["follow", "物品跟著手部移動（拿著走 2 秒）"], ["lockBusy", "抓取／放下進行中，重複按會被鎖定"], ["placeOk", "放下時落在地面或平台上，不穿透"]]],
      ["角色狀態", [["airCtl", "跳躍中仍能控制方向"], ["noDouble", "空中不能再跳（不會無限連跳）"], ["carryState", "持有物品時使用抱持移動"], ["jumpBack", "跳躍結束回到移動或待機"], ["backNormal", "抓取／放下／慶祝結束後回到正常狀態"]]],
      ["效能", [["fps30", "30 FPS 下速度一致", "⚙️ 中選 30"], ["fps60", "60 FPS", "⚙️ 中選 60"]]]
    ],
    load: function () { try { this.done = JSON.parse(localStorage.getItem(this.key) || "{}"); } catch (e) { this.done = {}; } },
    save: function () { try { localStorage.setItem(this.key, JSON.stringify(this.done)); } catch (e) {} },
    tick: function (k) { if (this.done[k]) return; this.done[k] = Date.now(); this.save(); if (!$("#check").hidden) this.render(); },
    reset: function () { this.done = {}; this.view = {}; this.save(); this.render(); },
    render: function () {
      var self = this, total = 0, ok = 0, h = "";
      this.groups.forEach(function (g) {
        h += "<h4>" + g[0] + "</h4><ul>";
        g[1].forEach(function (it) { total++; var on = !!self.done[it[0]]; if (on) ok++; h += '<li class="' + (on ? "ok" : "") + '"><i></i><div>' + it[1] + (it[2] ? "<small>" + it[2] + "</small>" : "") + "</div></li>"; });
        h += "</ul>";
      });
      h += '<div class="sum">已通過 ' + ok + " / " + total + " 項（自動偵測，存在這台裝置）。</div>";
      $("#check-list").innerHTML = h;
      $("#check-dev").textContent = { phone: "手機", tablet: "平板", desktop: "電腦" }[device.touch ? device.kind : "desktop"] + (device.iOS ? "・iOS" : device.android ? "・Android" : "");
    }
  };
  CK.load();

  /* ================= 主迴圈 ================= */
  var fpsCap = 0, last = performance.now(), acc = 0, frames = 0, fpsShown = 0, fpsT = 0, prevUI = null, dbgT = 0;
  function frame(now) {
    w.requestAnimationFrame(frame);
    var dt = (now - last) / 1000;
    if (fpsCap && dt < 1 / fpsCap - 0.002) return;                 // 30 / 60 FPS 測試
    last = now; dt = Math.min(dt, 0.05);
    frames++; fpsT += dt; if (fpsT >= 0.5) { fpsShown = Math.round(frames / fpsT); frames = 0; fpsT = 0; }

    if (spin.checked && player.sm.state === "IDLE") player.controller.faceTo(player.controller.yaw + 0.9);
    var s = input.sample(dt);
    cam.yaw -= s.cameraDelta * 0.006;
    var C = player.controller, wasAir = !C.grounded;
    player.update(dt, cam.yaw, s);

    // 自動驗收偵測
    if (s.joystickActive && s.mag > 0.3) { CK.tick("mtJoy"); if (Math.abs(s.moveX) > 0.35 && Math.abs(s.moveY) > 0.35) CK.tick("mtDiag"); if (CK.flag.cancelled) CK.tick("mtRecover"); }
    if (s.pointers >= 2) CK.tick("mt2");
    if (wasAir && s.mag > 0.3 && C.speed() > 0.4) CK.tick("airCtl");
    var ui = inter.uiState().mode;
    if (prevUI === "busy" && ui === "release") CK.tick("autoRelease");
    if (prevUI === "busy" && ui === "grab") CK.tick("autoGrab");
    prevUI = ui;
    if (inter.held && C.speed() > 0.3 && CK.flag.heldSince && now - CK.flag.heldSince > 2000) CK.tick("follow");
    if (fpsCap === 30 && C.speed() > 0.5) CK.tick("fps30");
    if (fpsCap === 60 && C.speed() > 0.5) CK.tick("fps60");

    // 目標高亮與持有顯示
    var tg = inter.target;
    hi.visible = !!tg;
    if (tg) { hi.position.set(tg.pos.x, tg.pos.y + 0.01, tg.pos.z); var sc2 = (tg.radius + 0.08) / 0.25 * (1 + Math.sin(now / 180) * 0.06); hi.scale.set(sc2, sc2, 1); }
    var heldChip = $("#st-held");
    if (inter.held) { heldChip.hidden = false; heldChip.textContent = "持有 " + inter.held.icon + " " + inter.held.name; } else heldChip.hidden = true;
    ring.material.opacity = 0.65 + Math.sin(now / 400) * 0.2;

    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $("#toast").classList.remove("on"); }
    if (!$("#debug").hidden && (dbgT -= dt) <= 0) {
      dbgT = 0.15;
      $("#dbg-txt").textContent =
        "FPS      " + fpsShown + (fpsCap ? "（上限 " + fpsCap + "）" : "") +
        "\n狀態     " + player.sm.state + (player.sm.sub ? " / " + player.sm.sub : "") +
        "\n動畫     " + player.anim.cur + (player.anim.armsOn ? " + 抱持層" : "") +
        "\n速度     " + C.speed().toFixed(2) + " m/s  " + (C.grounded ? "地面" : "空中 y=" + C.pos.y.toFixed(2)) +
        "\n跳躍     " + C.jumpPhase +
        "\n持有     " + (inter.held ? inter.held.name : "—") + (inter.busy ? "（" + inter.busy + "）" : "") +
        "\n目標     " + (inter.target ? inter.target.name : "—") +
        "\n觸控點   " + input.mt.owners.size + "  " + input.mt.snapshot().map(function (o) { return o.name + "#" + o.id; }).join(" ") +
        "\n最多同時 " + input.mt.stats.maxSimultaneous + " 指；中斷 " + input.mt.stats.cancels + " 次" +
        "\n裝置     " + device.kind + (input.touchUI ? "・觸控介面" : "・鍵盤滑鼠") + "  " + w.innerWidth + "×" + w.innerHeight;
    }
    updateCamera(dt);
    renderer.render(scene, camera);
  }
  CK.tick("idle");
  boot.classList.add("done");
  w.requestAnimationFrame(frame);

  // 給自動化測試使用
  w.__lab = { player: player, input: input, inter: inter, CK: CK, cam: cam, THREE: THREE, renderer: renderer };
})(window);
