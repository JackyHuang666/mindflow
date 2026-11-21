'use strict';
/* 角色冒險（2.5D 單人體驗）
   沿用迷宮尋寶的地圖產生（game.js 的 gen）、寶石／寶箱／小怪獸資料，
   再用 SWT MindFlow 角色系統（/character）讓背包客在迷宮裡自由移動。多人連線模式完全不受影響。 */
(function () {
  const NS = window.MFChar, THREE = window.THREE, d = document, $ = id => d.getElementById(id);
  const boot = $('aBoot');
  if (!THREE || !NS) { boot.textContent = '3D 引擎載入失敗，請重新整理。'; return; }

  /* ===== 參數（網址：?li=難度 0–3 &th=環境 0–5 &char=boy-ai|girl-ai） ===== */
  const QS = new URLSearchParams(location.search);
  const int = (v, lo, hi, def) => { const n = parseInt(v, 10); return Number.isInteger(n) && n >= lo && n <= hi ? n : def; };
  // 關卡模式（?lvl=1–36，見 maze-levels.js）：地圖、大小、種子、有無小地圖都由關卡決定
  const ML = window.MazeLevels, LEVEL = ML && QS.get('lvl') ? ML.LEVELS[int(QS.get('lvl'), 1, ML.LEVELS.length, 1) - 1] : null;
  const EMBED = QS.get('embed') === '1' && window.parent !== window;
  const li = LEVEL ? LEVEL.li : int(QS.get('li'), 0, LV.length - 1, 0);          // 預設「入門」：最小的地圖
  const th = LEVEL ? LEVEL.th : int(QS.get('th'), 0, TH.length - 1, 0);
  const seed = LEVEL ? LEVEL.seed : int(QS.get('sd'), 1, 2147483646, (Math.random() * 2147483646 | 0) + 1);
  const BASE = window.ADV_BASE || '/character/';                  // 角色系統所在位置（學院平台內為 ../character/）
  const T = TH[th];
  const CS = 1.25;          // 一格的邊長（公尺）；角色身高約 1
  const fmt = ms => { ms = Math.max(0, ms | 0); const m = ms / 60000 | 0, s = (ms % 60000) / 1000; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };

  /* ===== 迷宮資料（與多人模式同一個產生器） ===== */
  const lv = gen(seed, li); lv.key = 'adv/' + seed + '/' + li;
  const W = lv.W, H = lv.H;
  const wx = x => (x - (W - 1) / 2) * CS, wz = y => (y - (H - 1) / 2) * CS;
  const isWall = (x, y) => x < 0 || y < 0 || x >= W || y >= H || !!lv.g[y * W + x];
  const cellOf = (X, Z) => [Math.round(X / CS + (W - 1) / 2), Math.round(Z / CS + (H - 1) / 2)];

  /* ===== 輸入（左手搖桿、右手技能；電腦鍵盤） ===== */
  const stage = $('stage');
  NS.lockBrowserGestures(stage);
  const input = new NS.InputManager({ root: stage, uiParent: stage });
  const device = input.device;

  /* ===== 場景 ===== */
  const renderer = new THREE.WebGLRenderer({ canvas: $('cv'), antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
  const ART = window.AdvArt, KIT = ART.KIT[th];
  const scene = new THREE.Scene();
  scene.background = lin(KIT.sky);
  scene.fog = new THREE.Fog(lin(KIT.fog), 13, 30);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  scene.add(new THREE.HemisphereLight(lin(KIT.hemi[0]), lin(KIT.hemi[1]), KIT.hemi[2]));
  const sun = new THREE.DirectionalLight(lin(KIT.sun[0]), KIT.sun[1]);
  sun.castShadow = true; sun.shadow.mapSize.set(device.kind === 'phone' ? 1024 : 2048, device.kind === 'phone' ? 1024 : 2048);
  { const c = sun.shadow.camera; c.left = c.bottom = -7; c.right = c.top = 7; c.near = 0.5; c.far = 30; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03; }
  scene.add(sun, sun.target);
  const clay = (hex, o) => new THREE.MeshStandardMaterial(Object.assign({ color: lin(hex), roughness: 0.85, metalness: 0 }, o || {}));

  // 地面（草地／沙地／雪地＋石板路）、自然景觀牆、沿牆裝飾、光點粒子
  ART.buildFloor(scene, lv, th, CS);
  ART.buildWalls(scene, lv, th, CS, wx, wz);
  const keep = new Set([lv.spawn].concat(lv.targets.map(t => t[1] * W + t[0]), lv.balls.map(b => b[1] * W + b[0])));
  ART.lanternGlows(scene, ART.decorate(scene, lv, th, CS, wx, wz, keep).lanterns);
  const fx = ART.makeFx(scene, th);

  /* ===== 碰撞：角色是圓，牆是方格；推出牆外並去掉撞牆方向的速度（可沿牆滑行） ===== */
  function pushOut(P, r, v) {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const [cx, cy] = cellOf(P.x, P.z);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const gx = cx + i, gy = cy + j; if (!isWall(gx, gy)) continue;
        const minX = wx(gx) - CS / 2, maxX = minX + CS, minZ = wz(gy) - CS / 2, maxZ = minZ + CS;
        const qx = Math.max(minX, Math.min(P.x, maxX)), qz = Math.max(minZ, Math.min(P.z, maxZ));
        let dx = P.x - qx, dz = P.z - qz, dd = Math.hypot(dx, dz);
        if (dd >= r) continue;
        if (dd < 1e-6) {                       // 中心已在牆內：往最近的邊推出去
          const e = [P.x - minX, maxX - P.x, P.z - minZ, maxZ - P.z], k = e.indexOf(Math.min(...e));
          dx = [-1, 1, 0, 0][k]; dz = [0, 0, -1, 1][k]; dd = 0;
          P.x += dx * (e[k] + r); P.z += dz * (e[k] + r);
        } else { const nx = dx / dd, nz = dz / dd; P.x = qx + nx * r; P.z = qz + nz * r; dx = nx; dz = nz; }
        if (v) { const vn = v.x * dx + v.z * dz; if (vn < 0) { v.x -= vn * dx; v.z -= vn * dz; } }
        hit = true;
      }
    }
    return hit;
  }
  function circleFree(x, z, r) {
    const [cx, cy] = cellOf(x, z);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j; if (!isWall(gx, gy)) continue;
      const minX = wx(gx) - CS / 2, minZ = wz(gy) - CS / 2;
      const qx = Math.max(minX, Math.min(x, minX + CS)), qz = Math.max(minZ, Math.min(z, minZ + CS));
      if (Math.hypot(x - qx, z - qz) < r) return false;
    }
    return true;
  }

  /* ===== 寶箱與寶石（同色配對，沿用 BC 顏色） ===== */
  const inter = new NS.InteractionManager();
  inter.bounds = 1e6;
  inter.placeFilter = (x, z, it) => circleFree(x, z, it.radius + 0.03);
  const home = lv.targets.map(() => false);
  const chests = lv.targets.map((t, i) => {
    const x = wx(t[0]), z = wz(t[1]), art = ART.makeChest(BC[i]);
    art.group.position.set(x, 0, z); scene.add(art.group);
    const fr = [[0, 1], [1, 0], [-1, 0], [0, -1]].find(d => !isWall(t[0] + d[0], t[1] + d[1]));   // 箱子正面朝向通道
    if (fr) art.group.rotation.y = Math.atan2(fr[0], fr[1]);
    const glowL = new THREE.PointLight(lin(BC[i]), 0, 2.4); glowL.position.set(x, 0.6, z); scene.add(glowL);
    const surf = { id: 'chest' + i, kind: 'chest', idx: i, x, z, r: 0.42, h: 0.3 };
    inter.surfaces.push(surf);
    inter.obstacles.push({ x, z, r: 0.34, h: 0.3, surfaceId: surf.id });
    return Object.assign(art, { glow: glowL, x, z, homeT: 0 });
  });
  const gems = lv.balls.map((b, i) => {
    const art = ART.makeGem(BC[i]); art.group.position.set(wx(b[0]), 0, wz(b[1])); scene.add(art.group);
    const it = inter.addItem({ id: 'gem' + i, idx: i, name: '寶石', icon: '💎', radius: 0.17, height: 0.3, weight: 1.2, obj: art.group, pos: { x: wx(b[0]), y: 0, z: wz(b[1]) } });
    it.art = art; return it;
  });

  /* ===== 小怪獸（沿用原本的巡邏路線與步調） ===== */
  const MCOL = KIT.mon || '#d9f27a';
  const mons = (lv.mons || []).map((path, i) => {
    const k = (i * 2) % path.length, art = ART.makeMonster(MCOL, th);
    art.group.position.set(wx(path[k][0]), 0, wz(path[k][1])); scene.add(art.group);
    return { path, k, d: 1, g: art.group, art, cell: path[k].slice(), body: art.body };
  });
  let monT = 0;
  function monStep() {
    mons.forEach(m => {
      let nk = m.k + m.d;
      if (nk < 0 || nk >= m.path.length) { m.d = -m.d; nk = m.k + m.d; }
      const t = m.path[nk];
      if (gems.some(it => { const c = cellOf(it.pos.x, it.pos.z); return it.state !== 'held' && c[0] === t[0] && c[1] === t[1]; })) { m.d = -m.d; return; }  // 寶石擋路就折返
      m.k = nk; m.cell = t.slice();
    });
  }

  /* ===== 玩家（背包客） ===== */
  const AI = (window.MFCHAR_MODELS || []).map(m => Object.assign({}, m, { url: BASE + m.url }));
  let charIdx = Math.max(0, AI.findIndex(m => m.id === QS.get('char')));
  const player = NS.createPlayer({ THREE, scene, input, interaction: inter, character: 'boy', controller: { bounds: 1e6 } });
  player.controller.collider = (P, v, r) => pushOut(P, r, v);
  const spawn = [lv.spawn % W, lv.spawn / W | 0];
  function toSpawn() { const C = player.controller; C.pos.x = wx(spawn[0]); C.pos.z = wz(spawn[1]); C.pos.y = 0; C.vel.x = C.vel.z = C.vel.y = 0; C.yaw = C.targetYaw = Math.PI; }
  toSpawn();
  const glbCache = {};
  function applyChar(done) {
    const m = AI[charIdx]; $('aChar').textContent = m ? m.label : '🧑 背包客';
    if (!m) { if (done) done(); return; }
    if (glbCache[m.id]) { player.setCharacter({ rig: glbCache[m.id] }); if (done) done(); return; }
    NS.GLBCharacterLoader.load(THREE, m.url, Object.assign({ height: 1 }, m, { name: m.label })).then(rig => {
      rig.keep = true; glbCache[m.id] = rig; if (AI[charIdx] === m) player.setCharacter({ rig }); if (done) done();
    }, err => { console.error(err); toast('角色模型載入失敗，先用備用角色'); if (done) done(); });
  }
  if (AI.length) { player.object.visible = false; applyChar(() => { player.object.visible = true; ready(); }); } else ready();

  /* ===== 鏡頭：2.5D 斜俯視跟隨；滑鼠或右半邊拖曳可轉動 ===== */
  const cam = { yaw: 0, dist: 3.3, height: 6.2, pos: new THREE.Vector3(), look: new THREE.Vector3() };
  function updateCamera(dt, snap) {
    const P = player.controller.pos, portrait = innerHeight > innerWidth;
    const dist = cam.dist * (portrait ? 1.15 : 1), h = cam.height * (portrait ? 1.3 : 1);
    const k = snap ? 1 : 1 - Math.exp(-5 * dt);
    cam.pos.x += (P.x + Math.sin(cam.yaw) * dist - cam.pos.x) * k;
    cam.pos.y += (h + P.y * 0.3 - cam.pos.y) * k;
    cam.pos.z += (P.z + Math.cos(cam.yaw) * dist - cam.pos.z) * k;
    cam.look.x += (P.x - cam.look.x) * k; cam.look.y += (0.45 - cam.look.y) * k; cam.look.z += (P.z - cam.look.z) * k;
    camera.position.copy(cam.pos); camera.lookAt(cam.look);
    sun.position.set(P.x + 3, 9, P.z + 5); sun.target.position.set(P.x, 0, P.z);
  }
  function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = innerWidth < innerHeight ? 55 : 42; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize(); updateCamera(0, true);

  /* ===== HUD 與遊戲流程 ===== */
  let toastT = 0, t0 = 0, el = 0, done = false, freezeT = 0, hits = 0;
  function toast(s) { const t = $('aToast'); t.textContent = s; t.classList.add('on'); toastT = 1.8; }
  function setGems() { $('aGems').textContent = '寶石 ' + home.filter(Boolean).length + '/' + home.length; }
  setGems();
  $('aLevel').textContent = LV[li].n + '・' + W + '×' + H;
  const menuUrl = 'index.html' + (EMBED ? '?embed=1' : '');
  if (LEVEL) {
    $('aLevel').hidden = true; $('aEnv').hidden = true;
    const lc = $('aLvChip'); if (lc) { lc.hidden = false; lc.textContent = '第 ' + LEVEL.id + ' 關'; }
    const ex = d.querySelector('.ahud a.abtn'); if (ex) { ex.href = menuUrl; ex.textContent = '‹ 關卡'; }
    if (!LEVEL.map) $('aMap').hidden = true;
  }
  const TH3 = ML ? ML.thresholds(lv, LEVEL, CS) : null;
  const reload = p => { const q = new URLSearchParams(location.search); Object.keys(p).forEach(k => p[k] == null ? q.delete(k) : q.set(k, p[k])); location.search = q.toString(); };
  $('aLevel').onclick = () => reload({ li: (li + 1) % LV.length, sd: null });
  $('aEnv').textContent = ART.KIT[th].name;
  $('aEnv').onclick = () => reload({ th: (th + 1) % TH.length });
  $('aChar').onclick = () => { if (AI.length < 2) return; charIdx = (charIdx + 1) % AI.length; applyChar(); const q = new URLSearchParams(location.search); q.set('char', AI[charIdx].id); history.replaceState(null, '', '?' + q); };

  inter.on('grabDone', it => toast('拿起了 ' + it.icon + ' 寶石，帶到同色寶箱放下'));
  inter.on('grabStart', it => { if (home[it.idx]) { home[it.idx] = false; setGems(); } });
  inter.on('placed', e => {
    const it = e.item, s = inter.surfaces.find(q => q.id === e.place.surface);
    if (s && s.kind === 'chest') {
      if (s.idx === it.idx) { home[it.idx] = true; it.grabbable = false; chests[it.idx].homeT = 0; chime([660, 990]); toast('寶石歸位！'); if (home.every(Boolean)) finish(); else player.sm.queued = 'CELEBRATE'; }
      else toast('顏色不一樣，換一個寶箱試試');
    }
    setGems();
  });
  function finish() {
    done = true; el = performance.now() - t0; player.sm.queued = 'CELEBRATE'; chime([523, 659, 784, 1047]);
    const sec = el / 1000, stars = TH3 ? ML.starsFor(sec, TH3) : -1;
    let gained = 0, before = -1;
    if (LEVEL) {
      const prog = ML.load(); before = prog[LEVEL.id - 1];
      gained = Math.max(0, stars - Math.max(0, before));
      if (stars > before) { prog[LEVEL.id - 1] = stars; ML.save(prog); }
      if (EMBED) try { window.parent.postMessage({ type: 'mf-maze', level: LEVEL.id, stars, sec: Math.round(sec), hits }, location.origin === 'null' ? '*' : location.origin); } catch (e) { /* ignore */ }
    }
    setTimeout(() => {
      const ov = $('aOv'); ov.hidden = false;
      const starRow = stars >= 0 ? '<div class="astars">' + [1, 2, 3].map(k => '<i class="' + (k <= stars ? 'on' : '') + '">★</i>').join('') + '</div>' +
        (stars === 0 ? '<p>超過 8 分鐘，這次沒有拿到星星，再挑戰一次吧！</p>' : gained ? '<p>獲得 ' + gained + ' 顆智慧星星 ⭐</p>' : before >= stars && stars > 0 ? '<p>（已拿過這些星星，挑戰更快的時間可以再得星）</p>' : '') : '';
      const next = LEVEL && LEVEL.id < ML.LEVELS.length ? '<a class="abtn" href="play.html?lvl=' + (LEVEL.id + 1) + (EMBED ? '&embed=1' : '') + '">下一關 ›</a>' : '';
      ov.innerHTML = '<div class="card"><h2>' + (LEVEL ? '第 ' + LEVEL.id + ' 關完成' : '全部寶石歸位') + '</h2>' + starRow + '<div class="tbig">' + fmt(el) + '</div>' + (hits ? '<p>被小怪獸撞到 ' + hits + ' 次</p>' : '') +
        '<div class="row"><button class="abtn" id="aAgain">再玩一次</button>' + (LEVEL ? next + '<a class="abtn" href="' + menuUrl + '">關卡選單</a>' : (li < LV.length - 1 ? '<button class="abtn" id="aNext">下一個難度</button>' : '') + '<a class="abtn" href="/">回首頁</a>') + '</div></div>';
      $('aAgain').onclick = () => LEVEL ? location.reload() : reload({ sd: null });
      const nx = $('aNext'); if (nx) nx.onclick = () => reload({ li: li + 1, sd: null });
    }, 1600);
  }
  // 關卡模式：開始前顯示這一關的星星標準
  if (LEVEL && TH3) {
    const ov = $('aOv'); ov.hidden = false;
    ov.innerHTML = '<div class="card"><h2>第 ' + LEVEL.id + ' 關・' + LEVEL.mapName + '</h2><p>' + LEVEL.size + '・' + lv.balls.length + ' 顆寶石・' + (lv.mons || []).length + ' 隻小怪獸・' + (LEVEL.map ? '有小地圖' : '沒有小地圖') + '</p>' +
      '<ul class="arule"><li><b>★★★</b> ' + ML.fmt(TH3.t3) + ' 內完成</li><li><b>★★</b> ' + ML.fmt(TH3.t2) + ' 內完成</li><li><b>★</b> ' + ML.fmt(TH3.t1) + ' 內完成</li></ul>' +
      '<p class="small">把每顆寶石搬進同顏色的寶箱，開始移動才開始計時。</p><div class="row"><button class="abtn go" id="aGo">開始</button></div></div>';
    $('aGo').onclick = () => { ov.hidden = true; };
  }
  let AC;
  function chime(fs) {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume();
      const t = AC.currentTime;
      fs.forEach((f, i) => { const o = AC.createOscillator(), g = AC.createGain(), s = t + i * .18; o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(.1, s + .03); g.gain.exponentialRampToValueAtTime(.001, s + 1.6); o.connect(g); g.connect(AC.destination); o.start(s); o.stop(s + 1.7); });
    } catch (e) { /* 沒有音效也能玩 */ }
  }

  /* ===== 小地圖：走過的地方才會出現（沿用原版的視野規則） ===== */
  const mapCv = $('aMap'), seen = new Uint8Array(W * H), vis = LV[li].v;
  let mapT = 0;
  mapCv.onclick = () => mapCv.classList.toggle('big');
  function drawMap(now) {
    const C = player.controller, [px, py] = cellOf(C.pos.x, C.pos.z);
    mark(seen, lv, px, py, vis);
    if (now - mapT < 120) return; mapT = now;
    const r = mapCv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (!w || !h) return;
    if (mapCv.width !== w || mapCv.height !== h) { mapCv.width = w; mapCv.height = h; }
    const c = mapCv.getContext('2d'), pad = 8 * dpr, ts = Math.min((w - pad * 2) / W, (h - pad * 2) / H), ox = (w - ts * W) / 2, oy = (h - ts * H) / 2;
    c.clearRect(0, 0, w, h);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!seen[y * W + x]) continue;
      c.fillStyle = lv.g[y * W + x] ? 'rgba(70,110,85,.95)' : 'rgba(236,226,200,.92)';
      c.fillRect(ox + x * ts, oy + y * ts, Math.ceil(ts), Math.ceil(ts));
    }
    lv.targets.forEach((t, i) => { if (!seen[t[1] * W + t[0]]) return; c.fillStyle = BC[i]; c.fillRect(ox + (t[0] + 0.15) * ts, oy + (t[1] + 0.15) * ts, ts * 0.7, ts * 0.7); if (home[i]) { c.strokeStyle = '#fff'; c.lineWidth = dpr; c.strokeRect(ox + (t[0] + 0.15) * ts, oy + (t[1] + 0.15) * ts, ts * 0.7, ts * 0.7); } });
    gems.forEach((it, i) => { if (home[i] || it.state !== 'free') return; const [gx, gy] = cellOf(it.pos.x, it.pos.z); if (!seen[gy * W + gx]) return; c.fillStyle = BC[i]; c.beginPath(); c.arc(ox + (gx + 0.5) * ts, oy + (gy + 0.5) * ts, ts * 0.32, 0, 6.3); c.fill(); });
    mons.forEach(m => { const [mx, my] = m.cell; if (Math.hypot(mx - px, my - py) > vis) return; c.fillStyle = MCOL; c.beginPath(); c.arc(ox + (mx + 0.5) * ts, oy + (my + 0.5) * ts, ts * 0.3, 0, 6.3); c.fill(); });
    // 玩家：箭頭指向面向（鏡頭朝北時地圖上方＝畫面上方）
    const ax = ox + (C.pos.x / CS + (W - 1) / 2 + 0.5) * ts, ay = oy + (C.pos.z / CS + (H - 1) / 2 + 0.5) * ts, yaw = C.yaw;
    c.save(); c.translate(ax, ay); c.rotate(Math.PI - yaw); c.fillStyle = '#ffffff'; c.strokeStyle = '#0d1819'; c.lineWidth = dpr;
    c.beginPath(); c.moveTo(0, -ts * 0.55); c.lineTo(ts * 0.38, ts * 0.38); c.lineTo(0, ts * 0.18); c.lineTo(-ts * 0.38, ts * 0.38); c.closePath(); c.fill(); c.stroke(); c.restore();
  }

  /* ===== 主迴圈 ===== */
  let last = performance.now(), started = false, readyFlag = false;
  function ready() { readyFlag = true; boot.classList.add('done'); toast('把每顆寶石搬進同顏色的寶箱'); }
  const hi = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.25, 32), new THREE.MeshBasicMaterial({ color: lin(0x7ee0c3), transparent: true, opacity: 0.9, depthWrite: false }));
  hi.rotation.x = -Math.PI / 2; hi.visible = false; scene.add(hi);
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    const s = input.sample(dt);
    cam.yaw -= s.cameraDelta * 0.006;
    if (!started && readyFlag && (s.mag > 0.1 || s.actions.length)) { started = true; t0 = now; }
    if (freezeT > 0 || done) { freezeT -= dt; s.moveX = s.moveY = s.mag = 0; s.sprint = false; if (done) s.actions.length = 0; }
    player.update(dt, cam.yaw, s);
    const C = player.controller;
    // 小怪獸
    if ((monT += dt * 1000) >= LV[li].ms) { monT = 0; monStep(); }
    mons.forEach((m, i) => {
      const tx = wx(m.cell[0]), tz = wz(m.cell[1]), g = m.g, k = 1 - Math.exp(-10 * dt);
      const mvx = tx - g.position.x, mvz = tz - g.position.z;
      g.position.x += mvx * k; g.position.z += mvz * k;
      if (Math.hypot(mvx, mvz) > 0.05) g.rotation.y = Math.atan2(mvx, mvz);
      const hop = Math.abs(Math.sin(now / 160 + i * 2));
      m.body.position.y = hop * 0.07; m.body.scale.set(1 + (1 - hop) * 0.06, 1 - (1 - hop) * 0.06, 1);
      m.art.feet.forEach((f, s) => { f.position.z = 0.04 + Math.sin(now / 160 + s * 3.14) * 0.05; });
      const blink = (now / 1000 + i) % 3.2 < 0.12 ? 0.1 : 1; m.art.eyes.forEach(e => { e.scale.y = blink; });
      const dx = C.pos.x - g.position.x, dz = C.pos.z - g.position.z;
      if (!done && freezeT <= 0 && C.pos.y < 0.45 && Math.hypot(dx, dz) < 0.55) {
        hits++; freezeT = 3; toSpawn(); updateCamera(0, true); chime([196, 165]); toast('撞到小怪獸，回到起點，3 秒後可以繼續');
        if (navigator.vibrate) try { navigator.vibrate([120, 60, 120]); } catch (e) { /* ignore */ }
      }
    });
    // 寶箱：拿著寶石靠近時打開蓋子；寶石放進去後收進箱內、蓋子關上並發光
    chests.forEach((c, i) => {
      const near = Math.hypot(C.pos.x - c.x, C.pos.z - c.z) < 1.9;
      const holdingGem = !!(inter.held || inter.pending) && (inter.held || inter.pending).id && String((inter.held || inter.pending).id).startsWith('gem');
      let want = 0;
      if (home[i]) { c.homeT += dt; want = c.homeT < 0.75 ? 1 : 0; }
      else if (near && (holdingGem || inter.busy === 'release')) want = 1;
      c.open += (want - c.open) * (1 - Math.exp(-8 * dt));
      c.lid.rotation.x = -1.95 * c.open;
      c.glow.intensity += ((home[i] && c.homeT > 0.75 ? 1.4 + Math.sin(now / 300) * 0.3 : 0) - c.glow.intensity) * 0.1;
      c.shine.material.opacity = home[i] ? Math.min(0.6, c.homeT) * (0.7 + Math.sin(now / 300) * 0.2) : 0;
    });
    gems.forEach((it, i) => {
      const a = it.art;
      a.spin.rotation.y = now / 900 + i;
      if (home[i] && it.state === 'free') {           // 收進寶箱裡
        const c = chests[i], k = 1 - Math.exp(-6 * dt);
        a.group.position.x += (c.x - a.group.position.x) * k; a.group.position.z += (c.z - a.group.position.z) * k;
        a.group.position.y += (0.04 - a.group.position.y) * k; a.group.scale.setScalar(a.group.scale.x + (0.75 - a.group.scale.x) * k);
        a.halo.material.opacity = 0;
      } else if (it.state === 'free') {
        a.spin.position.y = 0.05 + Math.sin(now / 500 + i) * 0.03;
        a.halo.material.opacity = 0.45 + Math.sin(now / 400 + i) * 0.15;
      } else { a.spin.position.y = 0; a.halo.material.opacity = 0.35; }
      const sp = Math.max(0, Math.sin(now / 700 + i * 1.7)); a.spark.material.opacity = sp > 0.85 && !home[i] ? (sp - 0.85) * 6 : 0;
    });
    fx(now / 1000, C.pos.x, C.pos.z);
    drawMap(now);
    // 目標提示與 HUD
    const tg = inter.target; hi.visible = !!tg;
    if (tg) { hi.position.set(tg.pos.x, tg.pos.y + 0.01, tg.pos.z); const sc = (tg.radius + 0.08) / 0.25 * (1 + Math.sin(now / 180) * 0.06); hi.scale.set(sc, sc, 1); }
    const hc = $('aHeld'); if (inter.held) { hc.hidden = false; hc.textContent = '持有 ' + inter.held.icon; } else hc.hidden = true;
    $('aClock').textContent = fmt(done ? el : started ? now - t0 : 0);
    if (toastT > 0 && (toastT -= dt) <= 0) $('aToast').classList.remove('on');
    player.object.children.forEach(o => { o.visible = freezeT > 0 ? Math.sin(now / 80) > -0.3 : true; });
    updateCamera(dt);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  // 給自動化測試使用
  window.__adv = { TH3, LEVEL, player, input, inter, lv, cellOf, wx, wz, isWall, gems, chests, mons, home, cam, CS, get done() { return done; }, get ready() { return readyFlag; }, get hits() { return hits; } };
})();
