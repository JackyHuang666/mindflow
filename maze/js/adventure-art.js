'use strict';
/* 角色冒險的 3D 美術：自然景觀牆、地面材質、場景裝飾、寶箱／寶石／小怪獸造型、光點粒子。
   只負責「長什麼樣子」，碰撞與規則仍在 adventure.js（以格子判定）。 */
window.AdvArt = (function () {
  const THREE = window.THREE;
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

  /* ===== 六種環境的配色與造景（明亮童話感＋探險氛圍；星夜保留夜色） ===== */
  const KIT = [
    { name: '竹林', mon: '#d9f27a', sky: '#d6ecd9', fog: '#d6ecd9', hemi: ['#fff8e8', '#4d6a45', 0.55], sun: ['#fff1d6', 1.15],
      ground: ['#6fa64e', '#7db35a', '#5f9644'], path: ['#d9c49a', '#cbb488', '#bfa67a'], wall: 'bamboo', deco: ['grass', 'flower', 'pebble', 'lantern', 'mushroom'], fx: 'firefly', fxc: '#fff3a0' },
    { name: '深海珊瑚', mon: '#ff9ad0', sky: '#a9dde8', fog: '#9fd6e2', hemi: ['#e8fbff', '#2f5c6a', 0.6], sun: ['#e6fbff', 1.0],
      ground: ['#e9dcb8', '#f1e5c4', '#dccfa8'], path: ['#f7efd9', '#efe4c8', '#e6d9b8'], wall: 'coral', deco: ['shell', 'pebble', 'seaweed', 'lantern'], fx: 'bubble', fxc: '#e9fbff' },
    { name: '沙漠綠洲', mon: '#f0c070', sky: '#f7e2bd', fog: '#f4dcb2', hemi: ['#fff6e6', '#8a6438', 0.55], sun: ['#ffe9c4', 1.2],
      ground: ['#e8c48a', '#efcd96', '#ddb77c'], path: ['#f3dfb8', '#ecd5a8', '#e4ca99'], wall: 'canyon', deco: ['pebble', 'cactus', 'grass', 'lantern'], fx: 'sand', fxc: '#fff1d0' },
    { name: '雪原極光', mon: '#ffffff', sky: '#dfeefa', fog: '#dcebf7', hemi: ['#ffffff', '#6d83a0', 0.55], sun: ['#ffffff', 1.0],
      ground: ['#f2f7fc', '#e8f0f8', '#fbfdff'], path: ['#aebfd3', '#a2b5cb', '#bccbdc'], wall: 'pine', deco: ['pebble', 'snowman', 'lantern', 'grass'], fx: 'snow', fxc: '#ffffff' },
    { name: '星夜', mon: '#b9a0ff', sky: '#1b1c45', fog: '#1d1e4a', hemi: ['#9aa6ff', '#2a2350', 0.7], sun: ['#c9c3ff', 0.75],
      ground: ['#3a3f78', '#434885', '#353a6e'], path: ['#6a6aa8', '#7474b2', '#5f5f9c'], wall: 'crystal', deco: ['glowshroom', 'pebble', 'lantern', 'grass'], fx: 'firefly', fxc: '#d9ccff' },
    { name: '秋日楓林', mon: '#ff8a3d', sky: '#f6dfc3', fog: '#f2d6b6', hemi: ['#fff1e0', '#6a4226', 0.55], sun: ['#ffe2bd', 1.15],
      ground: ['#c99a5a', '#d4a666', '#bd8c4e'], path: ['#e6cfa6', '#dcc294', '#d2b685'], wall: 'maple', deco: ['leafpile', 'mushroom', 'pebble', 'lantern', 'grass'], fx: 'leaf', fxc: '#f29a4a' }
  ];

  /* ===== 共用幾何（低面數，黏土／童話感） ===== */
  const GEO = {
    ico: new THREE.IcosahedronGeometry(0.5, 1),
    dodeca: new THREE.DodecahedronGeometry(0.5, 0),
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    cylT: new THREE.CylinderGeometry(0.35, 0.5, 1, 8),
    cone: new THREE.ConeGeometry(0.5, 1, 8),
    octa: new THREE.OctahedronGeometry(0.5, 0),
    half: new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  };
  [GEO.box, GEO.cyl, GEO.cylT, GEO.cone, GEO.octa].forEach(g => g.translate(0, 0.5, 0));   // 底部放在 y=0，方便擺在地面

  /* 收集零件 → 每種幾何一個 InstancedMesh（大地圖也很輕） */
  function Batch() { this.groups = {}; }
  Batch.prototype.add = function (geo, color, x, y, z, sx, sy, sz, ry, opt) {
    const key = geo + (opt && opt.glow ? '#g' : '') + (opt && opt.flat ? '#f' : '');
    const g = this.groups[key] || (this.groups[key] = { geo, glow: !!(opt && opt.glow), flat: !!(opt && opt.flat), items: [] });
    g.items.push([x, y, z, sx, sy == null ? sx : sy, sz == null ? sx : sz, ry || 0, color, opt && opt.rx || 0]);
  };
  Batch.prototype.build = function (parent, shadows) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    Object.values(this.groups).forEach(g => {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: g.glow ? 0.4 : 0.85, metalness: 0, flatShading: g.flat || g.glow });
      if (g.glow) { mat.emissive = new THREE.Color(0xffffff); mat.emissiveIntensity = 0.55; }
      const mesh = new THREE.InstancedMesh(GEO[g.geo], mat, g.items.length);
      g.items.forEach((it, i) => {
        p.set(it[0], it[1], it[2]); s.set(it[3], it[4], it[5]); q.setFromEuler(e.set(it[8], it[6], 0));
        mesh.setMatrixAt(i, m4.compose(p, q, s));
        mesh.setColorAt(i, c.set(it[7]).convertSRGBToLinear());
      });
      if (g.glow) mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor;'); };
      mesh.castShadow = shadows && !g.glow; mesh.receiveShadow = true;
      parent.add(mesh);
    });
  };

  /* ===== 自然景觀牆：每個牆格長出一叢植物或一團岩石 ===== */
  function wallCell(B, kit, x, z, CS, R, outer) {
    const r = () => R(), j = s => (r() - 0.5) * s, h = CS * 0.98;
    switch (kit.wall) {
      case 'bamboo':
        B.add('box', pick(R, ['#4f8a40', '#5a9649', '#47803b']), x, 0, z, h, 0.3, h);
        for (let k = 0; k < 4; k++) B.add('ico', pick(R, ['#5c9a48', '#68a653', '#4f8c3f']), x + j(0.75), 0.3, z + j(0.75), 0.5 + r() * 0.3, 0.45, 0.5 + r() * 0.3);
        for (let k = 0; k < (outer ? 3 : 5); k++) {
          const bx = x + j(0.85), bz = z + j(0.85), bh = 1.1 + r() * 0.55, tilt = j(0.18);
          B.add('cyl', pick(R, ['#86bd55', '#97c962', '#76ad4a']), bx, 0, bz, 0.055, bh, 0.055, 0, { rx: tilt });
          for (let n = 1; n < 4; n++) B.add('cyl', '#5d8c38', bx, bh * n / 4, bz + tilt * bh * n / 4, 0.066, 0.02, 0.066);
          for (let l = 0; l < 4; l++) {                      // 竹葉：細長斜向的葉片
            const a2 = r() * 6.28, ly = bh * (0.65 + r() * 0.35);
            B.add('cone', pick(R, ['#6fb04c', '#82c25a', '#5f9e42']), bx + Math.sin(a2) * 0.12, ly, bz + tilt * ly + Math.cos(a2) * 0.12, 0.05, 0.3, 0.012, a2, { rx: 1.1 });
          }
        }
        break;
      case 'coral':
        B.add('dodeca', pick(R, ['#b88fb8', '#a982b0', '#c49ac0']), x, 0.2, z, h * 1.05, 0.62, h * 1.05, r() * 6, { flat: true });
        for (let k = 0; k < 4; k++) {
          const cx = x + j(0.8), cz = z + j(0.8), col = pick(R, ['#ff8f7d', '#ffb36b', '#ff6f9a', '#ffd166', '#a58cff']);
          if (r() < 0.5) { const hh = 0.5 + r() * 0.5; B.add('cylT', col, cx, 0.35, cz, 0.12, hh, 0.12); B.add('ico', col, cx, 0.35 + hh, cz, 0.22); }
          else B.add('ico', col, cx, 0.5 + r() * 0.15, cz, 0.3 + r() * 0.15, 0.24, 0.3 + r() * 0.15);
        }
        break;
      case 'canyon':
        B.add('box', pick(R, ['#d99a5c', '#e2a868', '#cf8f52']), x, 0, z, h, 0.55 + r() * 0.15, h);
        B.add('box', pick(R, ['#c9864a', '#e8b878', '#d39558']), x + j(0.2), 0.62, z + j(0.2), h * (0.6 + r() * 0.25), 0.22 + r() * 0.2, h * (0.6 + r() * 0.25), r());
        if (r() < 0.25 && !outer) { B.add('cyl', '#5f9c55', x + j(0.4), 0.7, z + j(0.4), 0.13, 0.5, 0.13); }
        else B.add('dodeca', '#b97a42', x + j(0.6), 0.75, z + j(0.6), 0.28, 0.2, 0.28, r() * 6, { flat: true });
        break;
      case 'pine':
        B.add('dodeca', pick(R, ['#c9d3de', '#b8c4d2', '#d6dee8']), x, 0.18, z, h * 1.05, 0.5, h * 1.05, r() * 6, { flat: true });
        B.add('ico', '#ffffff', x, 0.42, z, h * 0.95, 0.22, h * 0.95);
        for (let k = 0; k < (outer ? 1 : 2); k++) {
          const px = x + j(0.6), pz = z + j(0.6), s = 0.85 + r() * 0.35;
          B.add('cyl', '#7a5a3c', px, 0.4, pz, 0.08, 0.25 * s, 0.08);
          B.add('cone', pick(R, ['#3f7a5a', '#4a8665', '#386e51']), px, 0.55 * s, pz, 0.62 * s, 0.6 * s, 0.62 * s);
          B.add('cone', pick(R, ['#4a8665', '#56936f']), px, 0.85 * s, pz, 0.46 * s, 0.5 * s, 0.46 * s);
          B.add('cone', '#f4f9ff', px, 1.12 * s, pz, 0.26 * s, 0.3 * s, 0.26 * s);
        }
        break;
      case 'crystal':
        B.add('dodeca', pick(R, ['#3b3a6e', '#45447c', '#34336a']), x, 0.22, z, h * 1.05, 0.62, h * 1.05, r() * 6, { flat: true });
        for (let k = 0; k < (outer ? 2 : 4); k++) {
          const s = 0.18 + r() * 0.2;
          B.add('octa', pick(R, ['#a58cff', '#7fd4ff', '#ff9be0', '#c9b8ff']), x + j(0.8), 0.45, z + j(0.8), s, s * (2.2 + r()), s, r() * 6, { glow: true, rx: j(0.6) });
        }
        break;
      default: // maple
        B.add('box', pick(R, ['#8a6a3c', '#7d5f34']), x, 0, z, h, 0.36, h);
        for (let k = 0; k < 3; k++) B.add('ico', pick(R, ['#d4732c', '#e08a35', '#c65f24', '#e9a13c']), x + j(0.7), 0.4, z + j(0.7), 0.52 + r() * 0.2, 0.42, 0.52 + r() * 0.2);
        if (r() < (outer ? 0.4 : 0.55)) {
          const tx = x + j(0.4), tz = z + j(0.4), s = 0.9 + r() * 0.3;
          B.add('cylT', '#6b4a2e', tx, 0.3, tz, 0.12 * s, 0.75 * s, 0.12 * s);
          B.add('ico', pick(R, ['#e3782f', '#f09a3e', '#d65f2a', '#f2b544']), tx, 1.05 * s, tz, 0.85 * s, 0.68 * s, 0.85 * s);
          B.add('ico', pick(R, ['#f0a040', '#e06a2c']), tx + 0.2, 1.3 * s, tz - 0.1, 0.5 * s);
        }
    }
  }
  const pick = (R, a) => a[R() * a.length | 0];

  function buildWalls(scene, lv, th, CS, wx, wz) {
    const kit = KIT[th], R = rng(lv.W * 131 + th * 7 + 3), B = new Batch(), grp = new THREE.Group();
    for (let y = 0; y < lv.H; y++) for (let x = 0; x < lv.W; x++) if (lv.g[y * lv.W + x]) wallCell(B, kit, wx(x), wz(y), CS, R, x === 0 || y === 0 || x === lv.W - 1 || y === lv.H - 1);
    // 迷宮外圍再長一圈景觀，讓迷宮像是嵌在大自然裡
    for (let y = -3; y < lv.H + 3; y++) for (let x = -3; x < lv.W + 3; x++) {
      if (x >= 0 && y >= 0 && x < lv.W && y < lv.H) continue;
      if (R() < 0.55) wallCell(B, kit, wx(x) + (R() - 0.5) * 0.4, wz(y) + (R() - 0.5) * 0.4, CS, R, true);
    }
    B.build(grp, true); scene.add(grp);
    return grp;
  }

  /* ===== 地面：草地／沙地／雪地底色＋道路石板（另外畫，不影響 2D 版） ===== */
  function buildFloor(scene, lv, th, CS) {
    const kit = KIT[th], P = 48, M = 4, W = lv.W + M * 2, H = lv.H + M * 2, R = rng(lv.W * 977 + th * 11);
    const cv = document.createElement('canvas'); cv.width = W * P; cv.height = H * P; const c = cv.getContext('2d');
    c.fillStyle = kit.ground[0]; c.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < W * H * 3; i++) {       // 底色斑駁
      c.globalAlpha = 0.25 + R() * 0.3; c.fillStyle = pick(R, kit.ground);
      c.beginPath(); c.ellipse(R() * cv.width, R() * cv.height, P * (0.2 + R() * 0.5), P * (0.15 + R() * 0.35), R() * 3, 0, 6.3); c.fill();
    }
    c.globalAlpha = 1;
    const floor = (x, y) => x >= 0 && y >= 0 && x < lv.W && y < lv.H && !lv.g[y * lv.W + x];
    for (let y = 0; y < lv.H; y++) for (let x = 0; x < lv.W; x++) {
      if (!floor(x, y)) continue;
      const px = (x + M) * P, py = (y + M) * P;
      // 道路：整格鋪底色，邊緣用不規則圓弧接到草地，上面散落大小不一的石塊
      c.fillStyle = kit.path[1];
      c.fillRect(px, py, P, P);
      [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(d => {
        if (floor(x + d[0], y + d[1])) return;
        c.fillStyle = kit.ground[0];
        for (let k = 0; k < 4; k++) {
          const t = (k + 0.5) / 4, ex = d[0] ? px + (d[0] > 0 ? P : 0) : px + t * P, ey = d[1] ? py + (d[1] > 0 ? P : 0) : py + t * P;
          c.beginPath(); c.ellipse(ex, ey, P * (0.12 + R() * 0.1), P * (0.12 + R() * 0.1), 0, 0, 6.3); c.fill();
        }
      });
    }
    for (let y = 0; y < lv.H; y++) for (let x = 0; x < lv.W; x++) {
      if (!floor(x, y)) continue;
      const px = (x + M) * P, py = (y + M) * P;
      for (let k = 0; k < 6; k++) {
        const sx = px + P * (0.15 + R() * 0.7), sy = py + P * (0.15 + R() * 0.7), rw = P * (0.08 + R() * 0.12), rh = rw * (0.6 + R() * 0.4), rot = R() * 3;
        c.fillStyle = 'rgba(0,0,0,.10)'; c.beginPath(); c.ellipse(sx + 1.5, sy + 2, rw, rh, rot, 0, 6.3); c.fill();
        c.fillStyle = pick(R, kit.path); c.beginPath(); c.ellipse(sx, sy, rw, rh, rot, 0, 6.3); c.fill();
        c.fillStyle = 'rgba(255,255,255,.14)'; c.beginPath(); c.ellipse(sx - rw * 0.25, sy - rh * 0.3, rw * 0.45, rh * 0.3, rot, 0, 6.3); c.fill();
      }
    }
    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W * CS, H * CS), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    mesh.rotation.x = -Math.PI / 2; mesh.receiveShadow = true; scene.add(mesh);
    // 更遠的地面（不貼圖），讓邊界自然融入霧中
    const far = new THREE.Mesh(new THREE.CircleGeometry(Math.max(W, H) * CS * 2, 48), new THREE.MeshStandardMaterial({ color: lin(kit.ground[0]), roughness: 1 }));
    far.rotation.x = -Math.PI / 2; far.position.y = -0.01; far.receiveShadow = true; scene.add(far);
    return mesh;
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }

  /* ===== 場景裝飾：沿著牆邊擺，不擋路（不參與碰撞） ===== */
  function decorate(scene, lv, th, CS, wx, wz, avoid) {
    const kit = KIT[th], R = rng(lv.W * 31 + th * 5 + 9), B = new Batch(), grp = new THREE.Group(), lights = [];
    const isW = (x, y) => x < 0 || y < 0 || x >= lv.W || y >= lv.H || !!lv.g[y * lv.W + x];
    let lanterns = 0;
    for (let y = 1; y < lv.H - 1; y++) for (let x = 1; x < lv.W - 1; x++) {
      if (isW(x, y) || avoid.has(y * lv.W + x)) continue;
      const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(d => isW(x + d[0], y + d[1]));
      if (!sides.length) continue;
      const n = R() < 0.55 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const d = sides[R() * sides.length | 0], along = (R() - 0.5) * 0.7;
        const px = wx(x) + d[0] * CS * 0.4 + (d[0] ? 0 : along * CS), pz = wz(y) + d[1] * CS * 0.4 + (d[1] ? 0 : along * CS);
        let type = pick(R, kit.deco);
        if (type === 'lantern' && (lanterns > lv.W * 0.45 || R() < 0.6)) type = 'pebble';
        deco(B, type, px, pz, R, kit);
        if (type === 'lantern') { lanterns++; lights.push([px, 0.62, pz]); }
      }
    }
    B.build(grp, false); scene.add(grp);
    return { group: grp, lanterns: lights };
  }
  function deco(B, type, x, z, R, kit) {
    const j = s => (R() - 0.5) * s;
    switch (type) {
      case 'grass': for (let i = 0; i < 4; i++) B.add('cone', pick(R, kit.ground.map(g => shade(g, -30))), x + j(0.18), 0, z + j(0.18), 0.05, 0.14 + R() * 0.12, 0.05, 0, { rx: j(0.5) }); break;
      case 'flower':
        for (let i = 0; i < 3; i++) { const fx = x + j(0.22), fz = z + j(0.22), hh = 0.1 + R() * 0.1; B.add('cyl', '#4f8a3c', fx, 0, fz, 0.012, hh, 0.012); B.add('ico', pick(R, ['#ff8fb1', '#ffd166', '#ffffff', '#b59cff', '#ff6b6b']), fx, hh, fz, 0.07, 0.04, 0.07); }
        break;
      case 'pebble': for (let i = 0; i < 2 + (R() * 2 | 0); i++) B.add('dodeca', pick(R, ['#b9b3a6', '#a8a196', '#cfc8bb']), x + j(0.25), 0.02, z + j(0.25), 0.07 + R() * 0.07, 0.05, 0.07 + R() * 0.07, R() * 6, { flat: true }); break;
      case 'mushroom':
        for (let i = 0; i < 2; i++) { const mx = x + j(0.2), mz = z + j(0.2), s = 0.7 + R() * 0.5; B.add('cyl', '#f4ead8', mx, 0, mz, 0.035 * s, 0.09 * s, 0.035 * s); B.add('half', pick(R, ['#e2453c', '#e9853c', '#c9483f']), mx, 0.085 * s, mz, 0.14 * s, 0.1 * s, 0.14 * s); }
        break;
      case 'glowshroom':
        for (let i = 0; i < 3; i++) { const mx = x + j(0.25), mz = z + j(0.25), s = 0.6 + R() * 0.6; B.add('cyl', '#cfd6ff', mx, 0, mz, 0.03 * s, 0.1 * s, 0.03 * s); B.add('half', pick(R, ['#7fd4ff', '#a58cff', '#ff9be0']), mx, 0.095 * s, mz, 0.14 * s, 0.1 * s, 0.14 * s, 0, { glow: true }); }
        break;
      case 'shell': B.add('half', pick(R, ['#ffd9c9', '#ffe9d6', '#f7c0b0']), x, 0, z, 0.14, 0.07, 0.11, R() * 6); B.add('ico', '#ffffff', x + 0.12, 0.02, z, 0.05); break;
      case 'seaweed': for (let i = 0; i < 3; i++) B.add('cylT', pick(R, ['#3f9a6a', '#4fae78', '#2f8a5a']), x + j(0.2), 0, z + j(0.2), 0.04, 0.3 + R() * 0.3, 0.04, 0, { rx: j(0.4) }); break;
      case 'cactus': B.add('cyl', '#5f9c55', x, 0, z, 0.09, 0.32, 0.09); B.add('ico', '#5f9c55', x, 0.32, z, 0.09); B.add('cyl', '#6aa95f', x + 0.08, 0.12, z, 0.05, 0.14, 0.05); B.add('ico', '#ff8fb1', x, 0.38, z, 0.05); break;
      case 'snowman': B.add('ico', '#ffffff', x, 0.09, z, 0.2); B.add('ico', '#ffffff', x, 0.24, z, 0.14); B.add('cone', '#ff8a3d', x, 0.25, z + 0.06, 0.025, 0.07, 0.025, 0, { rx: 1.57 }); break;
      case 'leafpile': for (let i = 0; i < 5; i++) B.add('ico', pick(R, ['#e3782f', '#f09a3e', '#d65f2a', '#f2b544']), x + j(0.3), 0.01, z + j(0.3), 0.1, 0.025, 0.07, R() * 6); break;
      case 'lantern':
        B.add('cyl', '#5a4030', x, 0, z, 0.035, 0.5, 0.035);
        B.add('box', '#3f2e22', x, 0.5, z, 0.16, 0.025, 0.16);
        B.add('box', '#ffd27a', x, 0.525, z, 0.12, 0.15, 0.12, 0, { glow: true });
        B.add('cone', '#3f2e22', x, 0.675, z, 0.12, 0.07, 0.12);
        break;
    }
  }
  function shade(hex, a) { const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, v + a)); return '#' + ((1 << 24) + (f(n >> 16) << 16) + (f((n >> 8) & 255) << 8) + f(n & 255)).toString(16).slice(1); }

  /* ===== 柔光圖片（燈籠、寶石、怪獸的光暈，用 Sprite 取代大量點光源，手機也順） ===== */
  let glowTex = null;
  function glow(color, size, opacity) {
    if (!glowTex) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(cv);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: lin(color), transparent: true, opacity: opacity == null ? 0.7 : opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.set(size, size, 1); return s;
  }
  function lanternGlows(scene, list) { list.forEach(p => { const s = glow('#ffcf70', 0.9, 0.75); s.position.set(p[0], p[1], p[2]); scene.add(s); }); }

  /* ===== 寶箱：圓頂木箱＋同色鐵框；蓋子以後緣為軸開關 ===== */
  function makeChest(color) {
    const g = new THREE.Group(), c = lin(color);
    const wood = new THREE.MeshStandardMaterial({ color: lin('#9a6236'), roughness: 0.8 }), wood2 = new THREE.MeshStandardMaterial({ color: lin('#7a4a26'), roughness: 0.85 });
    const metal = new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.35, emissive: c, emissiveIntensity: 0.18 });
    const W = 0.62, D = 0.44, Hh = 0.28;
    const add = (geo, m, x, y, z, p) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; (p || g).add(o); return o; };
    // 箱身：四面板＋底，裡面是空的，寶石才放得進去
    add(new THREE.BoxGeometry(W, 0.04, D), wood2, 0, 0.02, 0);
    add(new THREE.BoxGeometry(W, Hh, 0.04), wood, 0, Hh / 2, D / 2 - 0.02);
    add(new THREE.BoxGeometry(W, Hh, 0.04), wood, 0, Hh / 2, -D / 2 + 0.02);
    add(new THREE.BoxGeometry(0.04, Hh, D), wood, W / 2 - 0.02, Hh / 2, 0);
    add(new THREE.BoxGeometry(0.04, Hh, D), wood, -W / 2 + 0.02, Hh / 2, 0);
    add(new THREE.BoxGeometry(W - 0.08, 0.02, D - 0.08), new THREE.MeshStandardMaterial({ color: lin('#3a1f10'), roughness: 1 }), 0, 0.05, 0);
    [-0.2, 0.2].forEach(k => add(new THREE.BoxGeometry(0.05, Hh + 0.01, D + 0.012), metal, k, Hh / 2, 0));
    add(new THREE.BoxGeometry(W + 0.012, 0.035, 0.05), metal, 0, Hh - 0.018, D / 2 - 0.02);     // 箱口一圈金屬框
    add(new THREE.BoxGeometry(W + 0.012, 0.035, 0.05), metal, 0, Hh - 0.018, -D / 2 + 0.02);
    add(new THREE.BoxGeometry(0.05, 0.035, D + 0.012), metal, W / 2 - 0.02, Hh - 0.018, 0);
    add(new THREE.BoxGeometry(0.05, 0.035, D + 0.012), metal, -W / 2 + 0.02, Hh - 0.018, 0);
    // 蓋子：半圓柱，軸在後緣上方
    const lid = new THREE.Group(); lid.position.set(0, Hh, -D / 2); g.add(lid);
    const half = new THREE.CylinderGeometry(D / 2, D / 2, W, 16, 1, false, 0, Math.PI); half.rotateZ(Math.PI / 2);
    const top = add(half, wood, 0, 0, D / 2, lid); top.rotation.x = 0;
    [-0.2, 0.2].forEach(k => { const band = new THREE.CylinderGeometry(D / 2 + 0.008, D / 2 + 0.008, 0.05, 16, 1, false, 0, Math.PI); band.rotateZ(Math.PI / 2); add(band, metal, k, 0, D / 2, lid); });
    const lock = add(new THREE.BoxGeometry(0.08, 0.1, 0.03), metal, 0, -0.03, D + 0.012, lid);
    add(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: lin('#2a1a10') }), 0, -0.04, 0.018, lock);
    const shine = glow(color, 1.1, 0); shine.position.set(0, 0.35, 0); g.add(shine);
    return { group: g, lid, shine, open: 0 };
  }

  /* ===== 寶石：明亮式切割（多面體）＋光暈＋閃光 ===== */
  function makeGem(color) {
    const g = new THREE.Group(), c = lin(color);
    const pts = [[0, 0], [0.13, 0.13], [0.15, 0.155], [0.1, 0.205], [0, 0.205]].map(p => new THREE.Vector2(p[0], p[1]));
    const geo = new THREE.LatheGeometry(pts, 8);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.12, metalness: 0.15, emissive: c, emissiveIntensity: 0.4, flatShading: true }));
    m.position.y = 0.06; m.castShadow = true;
    const spin = new THREE.Group(); spin.add(m); g.add(spin);
    const halo = glow(color, 0.75, 0.55); halo.position.y = 0.17; g.add(halo);
    const spark = glow('#ffffff', 0.18, 0); spark.position.set(0.05, 0.27, 0.05); g.add(spark);
    return { group: g, spin, halo, spark };
  }

  /* ===== 小怪獸：圓滾滾的身體、會眨眼的大眼睛、小腳 ===== */
  function makeMonster(color, th) {
    const g = new THREE.Group(), c = lin(color), body = new THREE.Group(); g.add(body);
    const skin = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, emissive: c, emissiveIntensity: 0.22 });
    const add = (geo, m, x, y, z, p) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; (p || body).add(o); return o; };
    const blob = add(new THREE.SphereGeometry(0.27, 20, 16), skin, 0, 0.32, 0); blob.scale.set(1, 0.92, 0.95);
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), dark = new THREE.MeshStandardMaterial({ color: lin('#1a1a24'), roughness: 0.3 });
    const eyes = [];
    [-1, 1].forEach(s => {
      const e = new THREE.Group(); e.position.set(s * 0.1, 0.38, 0.21); body.add(e);
      add(new THREE.SphereGeometry(0.075, 14, 10), white, 0, 0, 0, e).scale.set(1, 1.15, 0.6);
      add(new THREE.SphereGeometry(0.04, 10, 8), dark, 0, -0.005, 0.035, e);
      add(new THREE.SphereGeometry(0.013, 6, 5), white, -0.012, 0.015, 0.068, e);
      eyes.push(e);
    });
    const mouth = add(new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI), dark, 0, 0.27, 0.245); mouth.rotation.z = Math.PI;
    [-1, 1].forEach(s => add(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshStandardMaterial({ color: lin('#ff9bb0'), roughness: 0.6 }), s * 0.17, 0.3, 0.2).scale.set(1, 0.6, 0.4));
    const feet = [-1, 1].map(s => add(new THREE.SphereGeometry(0.07, 10, 8), skin, s * 0.11, 0.05, 0.04, g));
    // 依環境加一點特徵：耳朵、觸角或背鰭
    const ear = th === 1 ? null : new THREE.ConeGeometry(0.06, 0.14, 8);
    if (ear) [-1, 1].forEach(s => { const o = add(ear, skin, s * 0.13, 0.57, 0); o.rotation.z = -s * 0.4; });
    const halo = glow(color, 1.2, 0.35); halo.position.y = 0.35; g.add(halo);
    return { group: g, body, eyes, feet, halo };
  }

  /* ===== 光點粒子：螢火蟲、泡泡、雪、沙、落葉（跟著玩家附近飄） ===== */
  function makeFx(scene, th) {
    const kit = KIT[th], N = 70, pos = new Float32Array(N * 3), seed = [];
    for (let i = 0; i < N; i++) { seed.push([Math.random() * 12 - 6, Math.random() * 2, Math.random() * 12 - 6, Math.random() * 6.28]); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (!glowTex) glow('#fff', 1);
    const mat = new THREE.PointsMaterial({ map: glowTex, color: lin(kit.fxc), size: kit.fx === 'firefly' ? 0.16 : kit.fx === 'leaf' ? 0.14 : 0.1, transparent: true, opacity: 0.85, depthWrite: false, blending: kit.fx === 'leaf' || kit.fx === 'sand' ? THREE.NormalBlending : THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
    return function update(t, cx, cz) {
      for (let i = 0; i < N; i++) {
        const s = seed[i]; let x = s[0], y = s[1], z = s[2];
        switch (kit.fx) {
          case 'bubble': y = (s[1] + t * 0.35) % 2.6; x += Math.sin(t + s[3]) * 0.15; break;
          case 'snow': y = 2.4 - ((s[1] + t * 0.3) % 2.4); x += Math.sin(t * 0.7 + s[3]) * 0.3; break;
          case 'sand': x += ((t * 0.8 + s[3]) % 12) - 6; y = 0.15 + s[1] * 0.3; break;
          case 'leaf': y = 2.2 - ((s[1] + t * 0.25) % 2.2); x += Math.sin(t * 0.9 + s[3]) * 0.4; break;
          default: y = 0.3 + s[1] * 0.6 + Math.sin(t * 0.8 + s[3]) * 0.15; x += Math.sin(t * 0.3 + s[3]) * 0.5; z += Math.cos(t * 0.27 + s[3]) * 0.5;
        }
        x = ((x % 12) + 18) % 12 - 6;
        pos[i * 3] = cx + x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = cz + z;
      }
      geo.attributes.position.needsUpdate = true;
      if (kit.fx === 'firefly') mat.opacity = 0.6 + Math.sin(t * 3) * 0.25;
    };
  }

  return { KIT, buildWalls, buildFloor, decorate, lanternGlows, makeChest, makeGem, makeMonster, makeFx, glow, lin };
})();
