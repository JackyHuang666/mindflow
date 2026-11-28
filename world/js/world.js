/*!
 * MFWorld 執行頁：載入地圖（maps/*.js）、放入原有的背包客角色、第三人稱鏡頭、HUD 與入口。
 * 網址參數：?map=academy-hub  &char=boy-ai|girl-ai  &embed=1（學院內開啟）  &q=low|mid|high|ultra（畫質，預設跟學院設定）
 */
(function () {
  "use strict";
  var NS = window.MFChar, MW = window.MFWorld, THREE = window.THREE, d = document, $ = function (id) { return d.getElementById(id); };
  var boot = $("wBoot");
  if (!THREE || !NS || !MW) { boot.textContent = "3D 引擎載入失敗，請重新整理。"; return; }

  var QS = new URLSearchParams(location.search);
  var EMBED = QS.get("embed") === "1" && window.parent !== window;
  if (EMBED) d.documentElement.classList.add("embed");
  var MAP = MW.maps[QS.get("map") || "academy-hub"] || MW.maps["academy-hub"];
  var BASE = window.WORLD_CHAR_BASE || "../character/";

  /* ===== 輸入（沿用角色系統：左手搖桿、右手技能；電腦 WASD） ===== */
  var stage = $("stage");
  NS.lockBrowserGestures(stage);
  var input = new NS.InputManager({ root: stage, uiParent: stage, actionKeys: { KeyC: "celebrate", Enter: "action" } });
  input.actions.addButton({ id: "celebrate", label: "慶祝", icon: "🎉", mode: "tap", slot: 3 });
  var device = input.device;

  /* ===== 畫質：跟學院「畫質與色彩」設定（手機／平板預設中、電腦預設高） ===== */
  var Q = QS.get("q");
  if (!/^(low|mid|high|ultra)$/.test(Q || "")) { try { Q = (JSON.parse(localStorage.getItem("mf-gfx") || "null") || {}).quality; } catch (e) { Q = null; } }
  if (!/^(low|mid|high|ultra)$/.test(Q || "")) Q = device.kind === "desktop" ? "high" : "mid";
  var QS_CAP = { low: 1, mid: 1.25, high: 1.5, ultra: 2 }[Q], phone = device.kind === "phone";

  /* ===== 繪圖器與場景 ===== */
  var renderer = new THREE.WebGLRenderer({ canvas: $("cv"), antialias: Q !== "low", powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QS_CAP, phone ? 1.5 : 2));
  if (window.MFGLGuard) MFGLGuard.watch(renderer);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.88;
  renderer.shadowMap.enabled = Q !== "low"; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  var lin = function (h) { return new THREE.Color(h).convertSRGBToLinear(); };
  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(lin(MAP.fog.color), MAP.fog.near, MAP.fog.far);
  var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1600);
  var hemi = new THREE.HemisphereLight(lin("#cfe6ff"), lin("#cdb48a"), 0.72); scene.add(hemi);
  var sun = new THREE.DirectionalLight(lin(MAP.sun.color), MAP.sun.intensity), SUN = new THREE.Vector3().fromArray(MAP.sun.dir).normalize();
  sun.castShadow = renderer.shadowMap.enabled;
  var SM = Q === "mid" ? 1024 : 2048; sun.shadow.mapSize.set(SM, SM);
  (function (c) { c.left = c.bottom = -18; c.right = c.top = 18; c.near = 1; c.far = 120; })(sun.shadow.camera);
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  /* ===== 建立地圖 ===== */
  var c = MW.createContext(THREE, scene, { quality: Q, phone: phone, aniso: Math.min(4, renderer.capabilities.getMaxAnisotropy()) });
  var t0b = performance.now();
  MAP.build(c);
  var stats = c.finish();
  stats.buildMs = Math.round(performance.now() - t0b);
  var phys = c.phys;
  // 反射：金色、玻璃、水面會映出天空（材質依種類設定反射強度）
  Object.keys(c.mats).forEach(function (k) {
    var m = c.mats[k]; if (!m || !m.isMeshStandardMaterial) return;
    m.envMapIntensity = /^(gold|goldRoof|glass|glassBlue|glassViolet|water|blueRoof|violetRoof)/.test(k) ? 1.1 : /^(stone|pave|road)/.test(k) ? 0.3 : 0.2;
  });

  /* ===== 時段：白天／黃昏／夜晚（依時間＝跟學院主畫面相同的規則） ===== */
  var TOD = {
    day: { top: "#1f6fe0", mid: "#6fb6ff", hor: "#e8f5ff", sunCol: "#fff2d0", sunDir: [-0.35, 0.8, 0.55], skySun: [-0.35, 0.55, -0.75], sunSize: 1, sun: "#fff1d8", sunI: 1.7, hemiS: "#cfe6ff", hemiG: "#d8c08f", hemiI: 0.45, fog: "#d6ebfc", near: 110, far: 520, exp: 0.82, glow: 1, stars: 0, sea: "#ffffff", cloud: "#ffffff", cloudGlow: 0.32, mtn: "#c3d8f2", fall: "#f4fcff", bloom: 0.42, thr: 0.86, sat: 1.12, tint: "#ffffff" },
    dusk: { top: "#33478f", mid: "#e7908a", hor: "#ffcf8f", sunCol: "#ffb060", sunDir: [-0.3, 0.3, -0.9], skySun: [-0.3, 0.06, -0.95], sunSize: 2.4, sun: "#ffb27a", sunI: 1.35, hemiS: "#ffc8a6", hemiG: "#7a5a5a", hemiI: 0.55, fog: "#f2bc98", near: 90, far: 460, exp: 0.98, glow: 1.6, stars: 0.12, sea: "#ffd9bf", cloud: "#ffcfb0", cloudGlow: 0.42, mtn: "#c9a3b8", fall: "#ffe9d6", bloom: 0.5, thr: 0.88, sat: 1.18, tint: "#fff0e0" },
    night: { top: "#040a22", mid: "#0f2352", hor: "#29457a", sunCol: "#cfe0ff", sunDir: [0.45, 0.7, -0.45], skySun: [0.4, 0.45, -0.8], sunSize: 1.5, sun: "#9db6ff", sunI: 0.5, hemiS: "#5f78c0", hemiG: "#1a1d33", hemiI: 0.45, fog: "#16294f", near: 70, far: 380, exp: 1.05, glow: 2.4, stars: 1, sea: "#55689a", cloud: "#6b80b2", cloudGlow: 0.22, mtn: "#3b5285", fall: "#bcd6ff", bloom: 0.9, thr: 0.72, sat: 1.1, tint: "#e6eeff" }
  };
  function prep(p) { var o = {}; Object.keys(p).forEach(function (k) { var v = p[k]; o[k] = typeof v === "string" ? lin(v) : Array.isArray(v) ? new THREE.Vector3().fromArray(v).normalize() : v; }); return o; }
  Object.keys(TOD).forEach(function (k) { TOD[k] = prep(TOD[k]); });
  function mixT(a, b, k) { var o = {}; Object.keys(a).forEach(function (n) { var x = a[n], y = b[n]; o[n] = x.isColor ? x.clone().lerp(y, k) : x.isVector3 ? x.clone().lerp(y, k).normalize() : x + (y - x) * k; }); return o; }
  var TIME_KEY = "mf-world-time", TIME_ORDER = ["auto", "day", "dusk", "night"], TIME_LABEL = { auto: "🕒 依時間", day: "☀️ 白天", dusk: "🌇 黃昏", night: "🌙 夜晚" };
  var timeMode = QS.get("time"); if (TIME_ORDER.indexOf(timeMode) < 0) { try { timeMode = localStorage.getItem(TIME_KEY); } catch (e) { timeMode = null; } } if (TIME_ORDER.indexOf(timeMode) < 0) timeMode = "auto";
  function wantedTime() {
    if (timeMode !== "auto") return timeMode;
    var dd = new Date(), h = dd.getHours() + dd.getMinutes() / 60;
    return h >= 6.5 && h < 16.5 ? "day" : (h >= 16.5 && h < 18.5) || (h >= 5.5 && h < 6.5) ? "dusk" : "night";
  }
  var todCur = TOD[wantedTime()], todFrom = todCur, todTo = todCur, todK = 1, todName = wantedTime(), envDirty = true, POST = null;
  function applyTod(T) {
    c.applyTime(T);
    scene.fog.color.copy(T.fog); scene.fog.near = T.near; scene.fog.far = T.far;
    hemi.color.copy(T.hemiS); hemi.groundColor.copy(T.hemiG); hemi.intensity = T.hemiI;
    sun.color.copy(T.sun); sun.intensity = T.sunI; SUN.copy(T.sunDir);
    renderer.toneMappingExposure = T.exp;
    if (POST) { POST.bloom.strength = T.bloom; POST.bloom.threshold = T.thr; POST.grade.uniforms.sat.value = T.sat; POST.grade.uniforms.tint.value.copy(T.tint); }
  }
  function setTime(mode, instant) {
    timeMode = mode; try { localStorage.setItem(TIME_KEY, mode); } catch (e) { /* ignore */ }
    $("wTime").textContent = TIME_LABEL[mode];
    var nm = wantedTime(); if (nm === todName && !instant) return;
    todName = nm; todFrom = todCur; todTo = TOD[nm]; todK = instant ? 1 : 0; if (instant) { todCur = todTo; applyTod(todCur); envDirty = true; }
  }
  $("wTime").onclick = function () { setTime(TIME_ORDER[(TIME_ORDER.indexOf(timeMode) + 1) % TIME_ORDER.length]); toast("時段：" + TIME_LABEL[timeMode].slice(2) + (timeMode === "auto" ? "（現在是" + { day: "白天", dusk: "黃昏", night: "夜晚" }[todName] + "）" : "")); };
  setInterval(function () { if (timeMode === "auto") setTime("auto"); }, 60000);
  // 天空反射貼圖：用目前時段的天空顏色畫一張全景漸層圖，再轉成反射用的貼圖（換時段時重算一次）
  var pmrem = Q === "low" ? null : new THREE.PMREMGenerator(renderer), envCv = d.createElement("canvas"), envRT = null, envTex = null;
  envCv.width = 256; envCv.height = 128;
  function hex(cl) { return "#" + cl.clone().convertLinearToSRGB().getHexString(); }
  function updateEnv() {
    envDirty = false; if (!pmrem) return;
    var T = todCur, g = envCv.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, hex(T.top)); gr.addColorStop(0.32, hex(T.mid)); gr.addColorStop(0.5, hex(T.hor)); gr.addColorStop(0.56, hex(T.cloud)); gr.addColorStop(1, hex(T.hemiG));
    g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
    var sx = (Math.atan2(T.skySun.z, T.skySun.x) / (Math.PI * 2) + 0.5) * 256, sy = (0.5 - Math.asin(T.skySun.y) / Math.PI) * 128, rg = g.createRadialGradient(sx, sy, 0, sx, sy, 26);
    rg.addColorStop(0, hex(T.sunCol)); rg.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = rg; g.fillRect(0, 0, 256, 128);
    if (envTex) envTex.dispose(); envTex = new THREE.CanvasTexture(envCv); envTex.encoding = THREE.sRGBEncoding; envTex.mapping = THREE.EquirectangularReflectionMapping;
    var old = envRT; envRT = pmrem.fromEquirectangular(envTex); scene.environment = envRT.texture; if (old) old.dispose();
  }

  /* ===== 柔光暈（畫質高／超高才開；中畫質用光暈貼圖代替；低畫質關閉） ===== */
  function loadScript(src) { return new Promise(function (ok, no) { var e = d.createElement("script"); e.src = src; e.onload = ok; e.onerror = no; d.head.appendChild(e); }); }
  if (Q === "high" || Q === "ultra") {
    var EX = window.WORLD_THREE_EXAMPLES || "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/";
    ["shaders/CopyShader.js", "shaders/LuminosityHighPassShader.js", "postprocessing/EffectComposer.js", "postprocessing/RenderPass.js", "postprocessing/ShaderPass.js", "postprocessing/UnrealBloomPass.js"]
      .reduce(function (p, f) { return p.then(function () { return loadScript(EX + f); }); }, Promise.resolve())
      .then(function () {
        var W = renderer.domElement.clientWidth || innerWidth, H = renderer.domElement.clientHeight || innerHeight;
        var rt = new THREE.WebGLRenderTarget(W, H, { type: renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType });
        var comp = new THREE.EffectComposer(renderer, rt);
        comp.addPass(new THREE.RenderPass(scene, camera));
        var bloom = new THREE.UnrealBloomPass(new THREE.Vector2(W, H), todCur.bloom, 0.55, todCur.thr); comp.addPass(bloom);
        // 最後一道：線性 → sRGB、飽和度、色調、暗角（畫面更接近分鏡圖的插畫色彩）
        var grade = new THREE.ShaderPass({
          uniforms: { tDiffuse: { value: null }, sat: { value: todCur.sat }, tint: { value: todCur.tint.clone() }, vig: { value: 0.35 } },
          vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
          fragmentShader: "uniform sampler2D tDiffuse; uniform float sat; uniform vec3 tint; uniform float vig; varying vec2 vUv;" +
            "vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }" +
            "void main(){ vec3 c = clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0); float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = clamp(mix(vec3(l), c, sat) * tint, 0.0, 1.0);" +
            " c = srgb(c); vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * vig; gl_FragColor = vec4(c, 1.0); }"
        });
        comp.addPass(grade);
        POST = { comp: comp, bloom: bloom, grade: grade };
        resize(); applyTod(todCur);
      })
      .catch(function (e) { console.warn("柔光暈載入失敗，改用一般畫面", e); });
  }

  /* ===== 玩家（沿用原本的背包客模型、動畫與控制） ===== */
  var inter = new NS.InteractionManager(); inter.bounds = 1e6;
  var player = NS.createPlayer({ THREE: THREE, scene: scene, input: input, interaction: inter, character: "boy",
    controller: { bounds: 1e6, walkSpeed: 1.5, runSpeed: 4.2, jumpHeight: 0.85, radius: 0.26 } });
  var C = player.controller;
  C.groundAt = function (x, z, y) { return phys.groundAt(x, z, y); };      // 地面高度偵測（樓梯、坡道、浮島高低差）
  C.collider = function (P, v, r) { phys.collide(P, v, r); };             // 建築碰撞＋不會走出欄杆
  player.object.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
  function toSpawn() { var s = MAP.spawn; C.pos.x = s.x; C.pos.z = s.z; C.pos.y = phys.groundAt(s.x, s.z) || 0; C.vel.x = C.vel.y = C.vel.z = 0; C.yaw = C.targetYaw = s.yaw; cam.yaw = s.yaw + Math.PI; }

  var AI = (window.MFCHAR_MODELS || []).map(function (m) { return Object.assign({}, m, { url: BASE + m.url }); });
  var charIdx = Math.max(0, AI.findIndex(function (m) { return m.id === QS.get("char"); }));
  var rigCache = {};
  function applyChar(done) {
    var m = AI[charIdx]; $("wChar").textContent = m ? m.label : "🧑 背包客";
    if (!m) { if (done) done(); return; }
    if (rigCache[m.id]) { player.setCharacter({ rig: rigCache[m.id] }); shadowOn(); if (done) done(); return; }
    NS.GLBCharacterLoader.load(THREE, m.url, Object.assign({ height: 1 }, m, { name: m.label })).then(function (rig) {
      rig.keep = true; rigCache[m.id] = rig; if (AI[charIdx] === m) { player.setCharacter({ rig: rig }); shadowOn(); } if (done) done();
    }, function (err) { console.error(err); toast("角色模型載入失敗，先用備用角色"); if (done) done(); });
  }
  function shadowOn() { player.object.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } }); }
  $("wChar").onclick = function () { if (AI.length < 2) return; charIdx = (charIdx + 1) % AI.length; applyChar(); var q = new URLSearchParams(location.search); q.set("char", AI[charIdx].id); history.replaceState(null, "", "?" + q); };

  /* ===== 鏡頭：第三人稱斜後方跟隨；拖曳旋轉（左右＋上下）、滾輪／雙指縮放、避開建築與地形 ===== */
  var cam = { yaw: 0, pitch: 0.32, dist: 6.5, cur: 6.5, min: 2.2, max: 16, target: new THREE.Vector3(), manualT: 9, pitchD: 0 };
  var PRESETS = [[3.6, 0.22, "近"], [6.5, 0.32, "中"], [11, 0.5, "遠"]], preset = 1;
  (function camInput() {
    var ch = input.camHandler, pts = new Map();
    ch.multi = true;                                                     // 讓第二根手指也能落在鏡頭區（雙指縮放）
    function spread() { var a = Array.from(pts.values()); return a.length < 2 ? 0 : Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
    ch.onDown = function (p) { pts.set(p.id, { x: p.x, y: p.y }); };
    ch.onMove = function (p) {
      var o = pts.get(p.id); if (!o) return;
      if (pts.size >= 2) { var b = spread(); o.x = p.x; o.y = p.y; var a = spread(); if (a > 0 && b > 0) cam.dist = THREE.MathUtils.clamp(cam.dist * b / a, cam.min, cam.max); }
      else { input.camDelta += p.x - o.x; cam.pitchD += p.y - o.y; o.x = p.x; o.y = p.y; }
      cam.manualT = 0;
    };
    ch.onUp = function (p) { pts.delete(p.id); };
    stage.addEventListener("wheel", function (e) { e.preventDefault(); cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + Math.sign(e.deltaY) * Math.min(0.25, Math.abs(e.deltaY) * 0.0015)), cam.min, cam.max); cam.manualT = 0; }, { passive: false });
  })();
  $("wCam").onclick = function () { preset = (preset + 1) % PRESETS.length; cam.dist = PRESETS[preset][0]; cam.pitch = PRESETS[preset][1]; $("wCam").textContent = "🎥 " + PRESETS[preset][2]; };
  var _dir = new THREE.Vector3(), _p = new THREE.Vector3();
  function updateCamera(dt, snap, moving, s) {
    var P = C.pos;
    cam.yaw -= (s ? s.cameraDelta : 0) * 0.0065;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + cam.pitchD * 0.0045, -0.08, 1.25); cam.pitchD = 0;
    cam.manualT += dt;
    // 移動時鏡頭慢慢回到角色斜後方（玩家手動轉鏡頭後 1.5 秒內不干擾；橫移時不跟，避免繞圈）
    if (moving && cam.manualT > 1.5 && s && s.moveY > -0.2 && Math.abs(s.moveX) < 0.7) cam.yaw = NS.math.dampAngle(cam.yaw, C.yaw + Math.PI, 1.3, dt);
    var k = snap ? 1 : 1 - Math.exp(-10 * dt), ky = snap ? 1 : 1 - Math.exp(-6 * dt);
    cam.target.x += (P.x - cam.target.x) * k; cam.target.z += (P.z - cam.target.z) * k; cam.target.y += (P.y + 1.05 - cam.target.y) * ky;
    var cp = Math.cos(cam.pitch);
    _dir.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
    // 鏡頭碰撞：從角色往鏡頭方向逐段檢查，碰到建築、浮島或地面就拉近
    var allow = cam.dist, steps = 22;
    for (var i = 1; i <= steps; i++) {
      var t = 0.5 + (cam.dist - 0.5) * i / steps;
      _p.copy(cam.target).addScaledVector(_dir, t);
      var g = phys.groundAt(_p.x, _p.z);
      if (phys.solidAt(_p.x, _p.y, _p.z) || (g != null && _p.y < g + 0.35)) { allow = Math.max(0.6, t - 0.4); break; }
    }
    cam.cur = snap || allow < cam.cur ? allow : cam.cur + (allow - cam.cur) * (1 - Math.exp(-2.5 * dt));
    camera.position.copy(cam.target).addScaledVector(_dir, cam.cur);
    camera.lookAt(cam.target.x, cam.target.y + 0.12, cam.target.z);
    player.object.visible = cam.cur > 0.9;                                   // 鏡頭被擠到角色身上時暫時隱藏角色
    sun.position.set(P.x + SUN.x * 50, P.y + SUN.y * 50, P.z + SUN.z * 50); sun.target.position.set(P.x, P.y, P.z);
  }
  function resize() { var cv = renderer.domElement, W = cv.clientWidth || innerWidth, H = cv.clientHeight || innerHeight; renderer.setSize(W, H, false); if (typeof POST !== "undefined" && POST) { POST.comp.setPixelRatio(renderer.getPixelRatio()); POST.comp.setSize(W, H); } camera.aspect = W / H; camera.fov = W < H ? 62 : 50; camera.updateProjectionMatrix(); }
  addEventListener("resize", resize); resize();
  (function () { var lw = -1, lh = -1; function chk() { var cv = renderer.domElement; if (cv.clientWidth !== lw || cv.clientHeight !== lh) { lw = cv.clientWidth; lh = cv.clientHeight; resize(); } } addEventListener("orientationchange", function () { [80, 250, 500, 900, 1500].forEach(function (t) { setTimeout(chk, t); }); }); if (window.visualViewport) visualViewport.addEventListener("resize", chk); setInterval(chk, 400); })();

  /* ===== 入口：靠近建築大門時出現「進入」 ===== */
  var near = null, actBtn = input.actions.buttons.action && input.actions.buttons.action.el;
  function setActBtn() {
    if (!actBtn) return;
    actBtn.querySelector(".mfc-btn-ic").textContent = "🚪"; actBtn.querySelector(".mfc-btn-lb").textContent = "進入";
    actBtn.classList.toggle("locked", !near || !near.id); actBtn.classList.remove("mode-grab");
  }
  function checkPortal() {
    var best = null, bd = 1e9;
    c.portals.forEach(function (p) { var dd = Math.hypot(C.pos.x - p.x, C.pos.z - p.z); if (dd < (p.r || 3) && dd < bd) { bd = dd; best = p; } });
    if (best !== near) {
      near = best; var el = $("wPrompt");
      if (!near) el.hidden = true;
      else {
        el.hidden = false;
        $("wPName").textContent = near.name; $("wPSub").textContent = near.sub || "";
        var go = $("wGo"); go.disabled = !near.id; go.textContent = near.id ? (input.touchUI ? "🚪 進入" : "🚪 進入（E）") : "即將開放";
      }
      setActBtn();
    }
  }
  function enter(p) {
    if (!p) return;
    if (!p.id) { toast(p.name + "：" + (p.sub || "即將開放")); return; }
    if (EMBED) { try { window.parent.postMessage({ type: "mf-world-enter", scene: p.id }, location.origin === "null" ? "*" : location.origin); } catch (e) { /* ignore */ } toast("前往 " + p.name + "…"); }
    else toast("請從學院主畫面開啟 3D 全景，才能進入「" + p.name + "」");
    player.sm.queued = "CELEBRATE";
  }
  $("wGo").onclick = function () { enter(near); };

  /* ===== HUD ===== */
  var toastT = 0;
  function toast(s) { var t = $("wToast"); t.textContent = s; t.classList.add("on"); toastT = 2.4; }
  $("wTitle").textContent = MAP.title;
  $("wBack").onclick = function () {
    if (EMBED) { try { window.parent.postMessage({ type: "mfc-lab-close" }, location.origin === "null" ? "*" : location.origin); } catch (e) { /* ignore */ } }
    else location.href = "../index.html";
  };
  $("wHelp").onclick = function () { $("wHelpBox").hidden = !$("wHelpBox").hidden; };
  $("wHelpBox").onclick = function () { $("wHelpBox").hidden = true; };

  /* ===== 小地圖（由可走區域自動畫出；點一下放大） ===== */
  var mapCv = $("wMap"), mapBg = null, mapT = 0, B = (function () {
    var b = [1e9, 1e9, -1e9, -1e9];
    phys.regions.forEach(function (g) { var pts = g.type === "path" ? g.pts : [[g.x - (g.r || g.hw || 0), g.z - (g.r || g.hd || 0)], [g.x + (g.r || g.hw || 0), g.z + (g.r || g.hd || 0)]]; pts.forEach(function (p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }); });
    return [b[0] - 4, b[1] - 4, b[2] + 4, b[3] + 4];
  })();
  mapCv.onclick = function () { mapCv.classList.toggle("big"); mapBg = null; };
  function drawMap(now) {
    if (now - mapT < 100) return; mapT = now;
    var r = mapCv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2), W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (!W || !H) return;
    var sc = Math.min(W / (B[2] - B[0]), H / (B[3] - B[1])), ox = (W - (B[2] - B[0]) * sc) / 2, oy = (H - (B[3] - B[1]) * sc) / 2;
    var X = function (x) { return ox + (x - B[0]) * sc; }, Y = function (z) { return oy + (z - B[1]) * sc; };
    if (!mapBg || mapBg.width !== W || mapBg.height !== H) {
      mapBg = d.createElement("canvas"); mapBg.width = W; mapBg.height = H; var g = mapBg.getContext("2d");
      g.fillStyle = "rgba(240,236,224,.95)"; g.strokeStyle = "rgba(240,236,224,.95)"; g.lineCap = "round";
      phys.regions.forEach(function (q) {
        if (q.type === "circle") { g.beginPath(); g.arc(X(q.x), Y(q.z), q.r * sc, 0, 7); g.fill(); }
        else if (q.type === "rect") { g.save(); g.translate(X(q.x), Y(q.z)); g.rotate(-q.rot); g.fillRect(-q.hw * sc, -q.hd * sc, q.hw * 2 * sc, q.hd * 2 * sc); g.restore(); }
        else { g.lineWidth = q.hw * 2 * sc; g.beginPath(); q.pts.forEach(function (p, i) { g[i ? "lineTo" : "moveTo"](X(p[0]), Y(p[1])); }); g.stroke(); }
      });
      g.fillStyle = "rgba(120,140,160,.75)";
      phys.circles.forEach(function (o) { if (o.r > 1.5) { g.beginPath(); g.arc(X(o.x), Y(o.z), o.r * sc, 0, 7); g.fill(); } });
      phys.boxes.forEach(function (o) { g.save(); g.translate(X(o.x), Y(o.z)); g.rotate(-o.rot); g.fillRect(-o.hw * sc, -o.hd * sc, o.hw * 2 * sc, o.hd * 2 * sc); g.restore(); });
      c.portals.forEach(function (p) { g.fillStyle = p.id ? "#f2b84b" : "#9aa7b4"; g.beginPath(); g.arc(X(p.x), Y(p.z), 3.2 * dpr, 0, 7); g.fill(); });
    }
    if (mapCv.width !== W || mapCv.height !== H) { mapCv.width = W; mapCv.height = H; }
    var x = mapCv.getContext("2d"); x.clearRect(0, 0, W, H); x.drawImage(mapBg, 0, 0);
    x.save(); x.translate(X(C.pos.x), Y(C.pos.z)); x.rotate(Math.PI - C.yaw); x.fillStyle = "#2f7fe0"; x.strokeStyle = "#fff"; x.lineWidth = 1.5 * dpr;
    var a = 6 * dpr; x.beginPath(); x.moveTo(0, -a); x.lineTo(a * 0.7, a * 0.7); x.lineTo(0, a * 0.3); x.lineTo(-a * 0.7, a * 0.7); x.closePath(); x.fill(); x.stroke(); x.restore();
  }

  /* ===== 主迴圈 ===== */
  var last = performance.now(), readyFlag = false, clockT = 0;
  function ready() { readyFlag = true; boot.classList.add("done"); toast("歡迎來到 " + MAP.title.split("・")[0] + "！走到建築大門前可以進入"); }
  toSpawn(); updateCamera(0, true, false, null);
  $("wTime").textContent = TIME_LABEL[timeMode]; applyTod(todCur);
  if (AI.length) { player.object.visible = false; applyChar(function () { player.object.visible = true; ready(); }); } else ready();
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min((now - last) / 1000, 0.05); last = now; clockT += dt;
    var s = input.sample(dt);
    // 「進入」鍵（E／Enter／右手 🚪）不交給抓取系統
    for (var i = s.actions.length - 1; i >= 0; i--) if (s.actions[i].type === "action") { s.actions.splice(i, 1); if (near) enter(near); }
    if (!readyFlag) { s.moveX = s.moveY = s.mag = 0; s.actions.length = 0; }
    phys.prev.x = C.pos.x; phys.prev.z = C.pos.z;
    player.update(dt, cam.yaw, s);
    if (C.pos.y < -20) { toSpawn(); toast("回到觀景台"); }                  // 保險：不應該發生，但萬一掉下去就回起點
    setActBtn();
    checkPortal();
    if (todK < 1) { todK = Math.min(1, todK + dt / 1.6); var e = todK * todK * (3 - 2 * todK); todCur = mixT(todFrom, todTo, e); applyTod(todCur); if (todK >= 1) envDirty = true; }
    if (envDirty) updateEnv();
    c.update(clockT, dt, camera.position);
    updateCamera(dt, false, s.mag > 0.05, s);
    drawMap(now);
    if (toastT > 0 && (toastT -= dt) <= 0) $("wToast").classList.remove("on");
    if (POST) POST.comp.render(dt); else renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  // 給自動化測試使用
  window.__world = { THREE: THREE, scene: scene, camera: camera, renderer: renderer, player: player, input: input, phys: phys, ctx: c, cam: cam, stats: stats, quality: Q,
    get ready() { return readyFlag; }, get near() { return near; }, get post() { return !!POST; }, get time() { return todName; }, toSpawn: toSpawn, enter: enter, setTime: setTime };
})();
