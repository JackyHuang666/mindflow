/*!
 * MFWorld Kit — SWT MindFlow 3D 地圖共用工具（three.js r128，全部程式生成，不需要外部模型檔）
 *
 *   var c = MFWorld.createContext(THREE, scene, { quality: "mid" });
 *   c.island({...}); c.bridge({...}); c.terrace({...}); c.ramp({...});    // 可走的地面＋外觀＋欄杆
 *   c.tree(...); c.glassDome(...); c.palace(...) ...                       // 建築與景物（自動加入碰撞）
 *   c.finish();                                                            // 產生欄杆、把靜態網格依材質合併
 *   每幀：c.update(t, dt)                                                   // 瀑布、光環、地球等動畫
 *
 * 新地圖只要另寫一個 maps/<名稱>.js 呼叫這些積木，不用改這個檔案。
 */
(function (w) {
  "use strict";
  var NS = w.MFWorld = w.MFWorld || {};
  NS.maps = NS.maps || {};

  /* ================================================================ 小工具 */
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function segDist(px, pz, ax, az, bx, bz) {
    var dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz, t = L ? clamp(((px - ax) * dx + (pz - az) * dz) / L, 0, 1) : 0;
    var qx = ax + dx * t - px, qz = az + dz * t - pz;
    return { d: Math.sqrt(qx * qx + qz * qz), t: t };
  }
  NS.util = { rng: rng, clamp: clamp, segDist: segDist };

  /* ================================================================ 物理：可走區域（地面高度）＋障礙物 */
  function Physics() {
    this.regions = [];   // {type:'circle'|'rect'|'path', ...}
    this.circles = [];   // 圓柱障礙 {x,z,r,base,top}
    this.boxes = [];     // 方形障礙 {x,z,hw,hd,rot,base,top}
    this.solids = [];    // 給鏡頭用的實心體（浮島、平台）{x,z,rx,rz,top,bottom}
    this.prev = { x: 0, z: 0 };
    this.stepUp = 0.45;
  }
  Physics.prototype.addCircle = function (x, z, r, h, tag) { var g = { type: "circle", x: x, z: z, r: r, h: h, tag: tag }; this.regions.push(g); return g; };
  /** ext：坡道兩端往外多延伸的長度（高度維持端點值），讓坡道和相接的平台重疊、不會留下走不過去的縫 */
  Physics.prototype.addRect = function (x, z, wd, dp, rot, h0, h1, tag, ext) {
    var g = { type: "rect", x: x, z: z, hw: wd / 2, hd: dp / 2, ext: ext || 0, rot: rot || 0, h0: h0, h1: h1 == null ? h0 : h1, tag: tag, c: Math.cos(rot || 0), s: Math.sin(rot || 0) };
    this.regions.push(g); return g;
  };
  Physics.prototype.addPath = function (pts, width, tag) { var g = { type: "path", pts: pts, hw: width / 2, tag: tag }; this.regions.push(g); return g; };
  /** 區域在 (x,z) 的地面高度；m 是往內縮的距離（角色半徑），負數＝往外擴 */
  Physics.prototype.heightIn = function (g, x, z, m) {
    if (g.type === "circle") { var dx = x - g.x, dz = z - g.z; return dx * dx + dz * dz <= (g.r - m) * (g.r - m) ? g.h : null; }
    if (g.type === "rect") {
      var lx = (x - g.x) * g.c - (z - g.z) * g.s, lz = (x - g.x) * g.s + (z - g.z) * g.c;   // 世界 → 區域座標（rot 為繞 Y 軸）
      if (Math.abs(lx) > g.hw - m || Math.abs(lz) > g.hd + g.ext - m) return null;
      return g.h0 + (g.h1 - g.h0) * clamp((lz + g.hd) / (2 * g.hd), 0, 1);
    }
    var best = null, bd = 1e9, p = g.pts;
    for (var i = 0; i < p.length - 1; i++) {
      var r = segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
      if (r.d <= g.hw - m && r.d < bd) { bd = r.d; best = p[i][2] + (p[i + 1][2] - p[i][2]) * r.t; }
    }
    return best;
  };
  /** 地面高度：只接受「不高於 y＋台階高度」的區域，取最高者；y 省略時取最高 */
  Physics.prototype.groundAt = function (x, z, y, m) {
    var best = null, lim = y == null ? 1e9 : y + this.stepUp;
    for (var i = 0; i < this.regions.length; i++) {
      var h = this.heightIn(this.regions[i], x, z, m || 0);
      if (h != null && h <= lim && (best == null || h > best)) best = h;
    }
    return best;
  };
  /** (x,z) 是否在 owner 以外的任何區域或障礙物裡（欄杆遇到通道、建築就自動留缺口） */
  Physics.prototype.covered = function (x, z, owner, pad) {
    for (var i = 0; i < this.regions.length; i++) { var g = this.regions[i]; if (g !== owner && this.heightIn(g, x, z, -pad) != null) return true; }
    return this.blocked(x, z, null, pad * 0.5);
  };
  Physics.prototype.blocked = function (x, z, y, pad) {
    pad = pad || 0;
    for (var i = 0; i < this.circles.length; i++) { var c = this.circles[i]; if (y != null && (y > c.top || y < c.base - 1.2)) continue; var dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz < (c.r + pad) * (c.r + pad)) return true; }
    for (var j = 0; j < this.boxes.length; j++) {
      var b = this.boxes[j]; if (y != null && (y > b.top || y < b.base - 1.2)) continue;
      var lx = (x - b.x) * Math.cos(b.rot) - (z - b.z) * Math.sin(b.rot), lz = (x - b.x) * Math.sin(b.rot) + (z - b.z) * Math.cos(b.rot);
      if (Math.abs(lx) < b.hw + pad && Math.abs(lz) < b.hd + pad) return true;
    }
    return false;
  };
  Physics.prototype.addCircleObstacle = function (x, z, r, base, top) { this.circles.push({ x: x, z: z, r: r, base: base, top: top }); };
  Physics.prototype.addBoxObstacle = function (x, z, wd, dp, rot, base, top) { this.boxes.push({ x: x, z: z, hw: wd / 2, hd: dp / 2, rot: rot || 0, base: base, top: top }); };
  Physics.prototype.walkable = function (x, z, y, r) { return this.groundAt(x, z, y, r * 0.85) != null; };
  /** 角色碰撞（給 CharacterController.collider 用）：先推離建築，再確保腳下有地面（不會走出欄杆、不會掉下浮島） */
  Physics.prototype.collide = function (P, v, r) {
    var i;
    for (i = 0; i < this.circles.length; i++) {
      var c = this.circles[i]; if (P.y >= c.top || P.y + 1 < c.base) continue;
      var dx = P.x - c.x, dz = P.z - c.z, d = Math.sqrt(dx * dx + dz * dz), min = r + c.r;
      if (d < min && d > 1e-6) { var nx = dx / d, nz = dz / d; P.x = c.x + nx * min; P.z = c.z + nz * min; var vn = v.x * nx + v.z * nz; if (vn < 0) { v.x -= vn * nx; v.z -= vn * nz; } }
    }
    for (i = 0; i < this.boxes.length; i++) {
      var b = this.boxes[i]; if (P.y >= b.top || P.y + 1 < b.base) continue;
      var cs = Math.cos(b.rot), sn = Math.sin(b.rot), ox = P.x - b.x, oz = P.z - b.z;
      var lx = ox * cs - oz * sn, lz = ox * sn + oz * cs;
      var qx = clamp(lx, -b.hw, b.hw), qz = clamp(lz, -b.hd, b.hd), ex = lx - qx, ez = lz - qz, dd = Math.sqrt(ex * ex + ez * ez);
      if (dd >= r) continue;
      if (dd < 1e-6) { var e = [lx + b.hw, b.hw - lx, lz + b.hd, b.hd - lz], k = e.indexOf(Math.min.apply(null, e)); ex = [-1, 1, 0, 0][k]; ez = [0, 0, -1, 1][k]; lx += ex * (e[k] + r); lz += ez * (e[k] + r); }
      else { ex /= dd; ez /= dd; lx = qx + ex * r; lz = qz + ez * r; }
      P.x = b.x + lx * cs + lz * sn; P.z = b.z - lx * sn + lz * cs;
      var wx = ex * cs + ez * sn, wz = -ex * sn + ez * cs, vn2 = v.x * wx + v.z * wz;
      if (vn2 < 0) { v.x -= vn2 * wx; v.z -= vn2 * wz; }
    }
    if (!this.walkable(P.x, P.z, P.y, r)) {
      var px = this.prev.x, pz = this.prev.z;
      if (this.walkable(P.x, pz, P.y, r)) { P.z = pz; v.z = 0; }
      else if (this.walkable(px, P.z, P.y, r)) { P.x = px; v.x = 0; }
      else { P.x = px; P.z = pz; v.x = v.z = 0; }
    }
  };
  /** 鏡頭用：這個點是否在建築或浮島裡面 */
  Physics.prototype.solidAt = function (x, y, z) {
    if (this.blocked(x, z, y, 0.25)) return true;
    for (var i = 0; i < this.solids.length; i++) {
      var s = this.solids[i]; if (y > s.top + 0.15 || y < s.bottom) continue;
      var dx = (x - s.x) / s.rx, dz = (z - s.z) / s.rz, k = (s.top - y) / (s.top - s.bottom);   // 浮島下方越往下越窄
      if (dx * dx + dz * dz < (1 - k * 0.85) * (1 - k * 0.85)) return true;
    }
    return false;
  };
  NS.Physics = Physics;

  /* ================================================================ 靜態網格合併（同材質合成一個網格，減少繪製次數） */
  function Batcher(THREE) { this.THREE = THREE; this.groups = new Map(); }
  Batcher.prototype.add = function (geom, mat, matrix, opt) {
    opt = opt || {};
    var key = mat.uuid + (opt.cast === false ? "" : "|c") + (opt.receive === false ? "" : "|r");
    var g = this.groups.get(key);
    if (!g) { g = { mat: mat, parts: [], cast: opt.cast !== false, receive: opt.receive !== false }; this.groups.set(key, g); }
    var gg = geom.index ? geom.toNonIndexed() : geom.clone();
    gg.applyMatrix4(matrix);
    g.parts.push(gg);
  };
  /** 把一個 Object3D 底下所有 Mesh 依世界座標加入（加入後原物件可以丟掉） */
  Batcher.prototype.addObject = function (obj, opt) {
    var self = this; obj.updateMatrixWorld(true);
    obj.traverse(function (m) { if (m.isMesh && !m.userData.live) self.add(m.geometry, m.material, m.matrixWorld, Object.assign({ cast: true, receive: true }, m.userData.batch || {}, opt || {})); });
  };
  Batcher.prototype.build = function (parent) {
    var THREE = this.THREE, out = [];
    this.groups.forEach(function (g) {
      var n = 0; g.parts.forEach(function (p) { n += p.attributes.position.count; });
      var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), o = 0;
      g.parts.forEach(function (p) {
        var c = p.attributes.position.count;
        pos.set(p.attributes.position.array, o * 3);
        if (p.attributes.normal) nor.set(p.attributes.normal.array, o * 3);
        if (p.attributes.uv) uv.set(p.attributes.uv.array, o * 2);
        o += c; p.dispose();
      });
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      geo.computeBoundingSphere();
      var mesh = new THREE.Mesh(geo, g.mat); mesh.castShadow = g.cast; mesh.receiveShadow = g.receive; mesh.matrixAutoUpdate = false;
      parent.add(mesh); out.push(mesh);
    });
    this.groups.clear();
    return out;
  };
  NS.Batcher = Batcher;

  /* ================================================================ 程式貼圖（canvas 畫，全部快取、不重複產生） */
  function makeTextures(THREE, aniso) {
    var cache = {};
    function canvasTex(key, wd, ht, draw, opt) {
      if (cache[key]) return cache[key];
      var cv = document.createElement("canvas"); cv.width = wd; cv.height = ht;
      draw(cv.getContext("2d"), wd, ht);
      var t = new THREE.CanvasTexture(cv);
      opt = opt || {};
      if (opt.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
      if (opt.srgb !== false) t.encoding = THREE.sRGBEncoding;
      t.anisotropy = aniso || 1;
      cache[key] = t; return t;
    }
    function noise(ctx, wd, ht, n, a, colors, seed, sz) {
      var r = rng(seed || 7); for (var i = 0; i < n; i++) { ctx.globalAlpha = a * (0.4 + r() * 0.6); ctx.fillStyle = colors[(r() * colors.length) | 0]; var s = (sz || 3) * (0.5 + r()); ctx.fillRect(r() * wd, r() * ht, s, s); } ctx.globalAlpha = 1;
    }
    var T = {
      pave: function () {
        return canvasTex("pave", 1024, 1024, function (c, W, H) {
          c.fillStyle = "#efe6d8"; c.fillRect(0, 0, W, H);
          noise(c, W, H, 3000, 0.25, ["#ffffff", "#e2d5c0", "#d8cbb6"], 3, 6);
          var cx = W / 2, cy = H / 2; c.lineWidth = 3;
          for (var r = 60; r < W / 2; r += 64) { c.strokeStyle = "rgba(160,140,110,.35)"; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.stroke(); }
          for (var k = 0; k < 48; k++) { var a = k / 48 * Math.PI * 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60); c.lineTo(cx + Math.cos(a) * W / 2, cy + Math.sin(a) * W / 2); c.stroke(); }
          c.strokeStyle = "#d8a948"; c.lineWidth = 8;
          [190, 300, 470].forEach(function (rr) { c.beginPath(); c.arc(cx, cy, rr, 0, 7); c.stroke(); });
          c.lineWidth = 4; for (var j = 0; j < 12; j++) { var b = j / 12 * Math.PI * 2; c.beginPath(); c.moveTo(cx + Math.cos(b) * 190, cy + Math.sin(b) * 190); c.lineTo(cx + Math.cos(b) * 300, cy + Math.sin(b) * 300); c.stroke(); }
        });
      },
      road: function () {
        return canvasTex("road", 256, 256, function (c, W, H) {
          c.fillStyle = "#ece2d2"; c.fillRect(0, 0, W, H);
          var r = rng(11);
          for (var y = 0; y < H; y += 32) for (var x = (y / 32) % 2 ? -32 : 0; x < W; x += 64) {
            var l = 222 + (r() * 22 | 0); c.fillStyle = "rgb(" + (l + 8) + "," + l + "," + (l - 14) + ")"; c.fillRect(x + 2, y + 2, 60, 28);
          }
          noise(c, W, H, 900, 0.18, ["#fff", "#cbbca3"], 5, 3);
          c.fillStyle = "#d4a64a"; c.fillRect(0, 0, 6, H); c.fillRect(W - 6, 0, 6, H);
        }, { repeat: true });
      },
      grass: function () {
        return canvasTex("grass", 256, 256, function (c, W, H) {
          c.fillStyle = "#8cc760"; c.fillRect(0, 0, W, H);
          noise(c, W, H, 5000, 0.5, ["#a4d672", "#76b04e", "#9bd06a", "#c3e38a", "#6aa548"], 9, 4);
        }, { repeat: true });
      },
      rock: function () {
        return canvasTex("rock", 256, 256, function (c, W, H) {
          c.fillStyle = "#a39a8d"; c.fillRect(0, 0, W, H);
          noise(c, W, H, 3000, 0.45, ["#8a8276", "#b8afa2", "#7b7468", "#c7bfb2"], 13, 7);
          var r = rng(4); c.strokeStyle = "rgba(90,84,76,.5)"; c.lineWidth = 2;
          for (var i = 0; i < 40; i++) { var x = r() * W; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + (r() - 0.5) * 40, H); c.stroke(); }
        }, { repeat: true });
      },
      windows: function (tone) {
        return canvasTex("win-" + tone, 256, 256, function (c, W, H) {
          c.fillStyle = "#f3ebdc"; c.fillRect(0, 0, W, H);
          var glow = tone === "cyan" ? ["#bff3ff", "#6fd3f5"] : tone === "violet" ? ["#efe1ff", "#b78cf2"] : ["#fff2c4", "#f2b75a"];
          for (var i = 0; i < 4; i++) {
            var x = 14 + i * 60, g = c.createLinearGradient(0, 70, 0, 220); g.addColorStop(0, glow[0]); g.addColorStop(1, glow[1]);
            c.fillStyle = "#d3b064"; c.beginPath(); c.moveTo(x - 4, 224); c.lineTo(x - 4, 96); c.arc(x + 20, 96, 24, Math.PI, 0); c.lineTo(x + 44, 224); c.fill();
            c.fillStyle = g; c.beginPath(); c.moveTo(x, 220); c.lineTo(x, 96); c.arc(x + 20, 96, 20, Math.PI, 0); c.lineTo(x + 40, 220); c.fill();
            c.fillStyle = "rgba(160,120,60,.6)"; c.fillRect(x + 19, 80, 2, 140); c.fillRect(x, 150, 40, 2);
          }
          c.fillStyle = "#d9b25c"; c.fillRect(0, 0, W, 10); c.fillRect(0, H - 14, W, 14);
        }, { repeat: true });
      },
      portal: function (tone) {
        return canvasTex("portal-" + tone, 256, 512, function (c, W, H) {
          var col = tone === "gold" ? ["255,236,170", "255,190,90"] : tone === "violet" ? ["240,220,255", "170,120,255"] : ["220,250,255", "90,200,255"];
          var g = c.createRadialGradient(W / 2, H * 0.48, 10, W / 2, H * 0.48, W * 0.75); g.addColorStop(0, "rgba(" + col[0] + ",1)"); g.addColorStop(0.55, "rgba(" + col[1] + ",.9)"); g.addColorStop(1, "rgba(" + col[1] + ",.25)");
          c.fillStyle = g; c.fillRect(0, 0, W, H);
          c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = 5; c.beginPath(); c.arc(W / 2, H * 0.42, W * 0.36, 0, 7); c.stroke();
          if (tone === "cyan") {                                     // 中央聖殿：光之世界樹
            c.fillStyle = "rgba(255,226,150,.95)"; c.fillRect(W / 2 - 7, H * 0.42, 14, H * 0.3);
            [[0, -40, 60], [-46, -10, 44], [46, -10, 44], [-24, -44, 40], [26, -46, 40]].forEach(function (b) { c.beginPath(); c.arc(W / 2 + b[0], H * 0.42 + b[1], b[2], 0, 7); c.fillStyle = "rgba(170,240,160,.9)"; c.fill(); });
          }
        });
      },
      earth: function () {
        return canvasTex("earth", 512, 256, function (c, W, H) {
          var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#2a6fd6"); g.addColorStop(0.5, "#3d9ef5"); g.addColorStop(1, "#2a6fd6");
          c.fillStyle = g; c.fillRect(0, 0, W, H);
          var r = rng(21);
          for (var i = 0; i < 26; i++) {                               // 大陸：一團團重疊的圓
            var x = r() * W, y = H * 0.2 + r() * H * 0.6, n = 6 + (r() * 10 | 0);
            for (var k = 0; k < n; k++) { c.fillStyle = r() < 0.7 ? "#7fd18a" : "#e9f3d4"; c.beginPath(); c.arc((x + (r() - 0.5) * 70 + W) % W, y + (r() - 0.5) * 40, 6 + r() * 18, 0, 7); c.fill(); }
          }
          c.strokeStyle = "rgba(200,245,255,.5)"; c.lineWidth = 1.5;
          for (var j = 1; j < 8; j++) { c.beginPath(); c.moveTo(0, j * H / 8); c.lineTo(W, j * H / 8); c.stroke(); }
          for (var m = 1; m < 16; m++) { c.beginPath(); c.moveTo(m * W / 16, 0); c.lineTo(m * W / 16, H); c.stroke(); }
        });
      },
      glow: function () {
        return canvasTex("glow", 128, 128, function (c, W, H) {
          var g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
          c.fillStyle = g; c.fillRect(0, 0, W, H);
        });
      },
      cloud: function () {
        return canvasTex("cloud", 256, 128, function (c, W, H) {
          var r = rng(33);
          for (var i = 0; i < 26; i++) {
            var x = W * (0.18 + r() * 0.64), y = H * (0.45 + (r() - 0.5) * 0.35), rr = 18 + r() * 34, g = c.createRadialGradient(x, y, 0, x, y, rr);
            g.addColorStop(0, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, W, H);
          }
        });
      },
      cloudSea: function () {
        return canvasTex("cloudsea", 512, 512, function (c, W, H) {
          c.fillStyle = "#eef5fb"; c.fillRect(0, 0, W, H);
          var r = rng(41);
          for (var i = 0; i < 160; i++) {
            var x = r() * W, y = r() * H, rr = 20 + r() * 60, g = c.createRadialGradient(x, y, 0, x, y, rr), b = r() < 0.5;
            g.addColorStop(0, b ? "rgba(255,255,255,.9)" : "rgba(196,214,236,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
            c.fillStyle = g; [[0, 0], [-W, 0], [0, -H], [-W, -H]].forEach(function (o) { c.save(); c.translate(o[0], o[1]); c.fillRect(0, 0, W * 2, H * 2); c.restore(); });
          }
        }, { repeat: true });
      },
      fall: function () {
        return canvasTex("fall", 64, 256, function (c, W, H) {
          c.clearRect(0, 0, W, H); var r = rng(51);
          for (var i = 0; i < 70; i++) { var x = r() * W, wd = 1 + r() * 3; c.fillStyle = "rgba(255,255,255," + (0.25 + r() * 0.6) + ")"; c.fillRect(x, r() * H, wd, 40 + r() * 140); }
          var g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.15, "rgba(210,240,255,.35)"); g.addColorStop(0.85, "rgba(210,240,255,.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
          c.fillStyle = g; c.fillRect(0, 0, W, H);
        }, { repeat: true });
      },
      lotus: function () {
        return canvasTex("lotus", 512, 512, function (c, W, H) {
          c.clearRect(0, 0, W, H); c.translate(W / 2, H / 2);
          c.strokeStyle = "#e0b24f"; c.lineWidth = 6; c.fillStyle = "rgba(255,226,150,.35)";
          for (var i = 0; i < 8; i++) { c.save(); c.rotate(i / 8 * Math.PI * 2); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(70, -90, 0, -200); c.quadraticCurveTo(-70, -90, 0, 0); c.fill(); c.stroke(); c.restore(); }
          c.beginPath(); c.arc(0, 0, 230, 0, 7); c.stroke(); c.beginPath(); c.arc(0, 0, 40, 0, 7); c.fillStyle = "#f6d88a"; c.fill();
        });
      },
      emblem: function (kind, color) {
        return canvasTex("emb-" + kind + color, 256, 256, function (c, W, H) {
          c.clearRect(0, 0, W, H); c.translate(W / 2, H / 2); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 9;
          c.beginPath(); c.arc(0, 0, 112, 0, 7); c.stroke();
          if (kind === "star") { for (var k = 0; k < 2; k++) { c.beginPath(); for (var i = 0; i < 3; i++) { var a = i / 3 * Math.PI * 2 + k * Math.PI / 3 - Math.PI / 2; c[i ? "lineTo" : "moveTo"](Math.cos(a) * 86, Math.sin(a) * 86); } c.closePath(); c.stroke(); } c.beginPath(); c.arc(0, 0, 22, 0, 7); c.fill(); }
          else if (kind === "sun") { c.beginPath(); c.arc(0, 0, 40, 0, 7); c.fill(); for (var j = 0; j < 12; j++) { c.save(); c.rotate(j / 12 * Math.PI * 2); c.fillRect(-5, -98, 10, 38); c.restore(); } }
          else if (kind === "flame") { c.beginPath(); c.moveTo(0, -84); c.bezierCurveTo(52, -20, 58, 30, 0, 72); c.bezierCurveTo(-58, 30, -52, -20, 0, -84); c.fill(); c.fillStyle = "rgba(255,255,255,.75)"; c.beginPath(); c.moveTo(0, -20); c.bezierCurveTo(24, 10, 24, 40, 0, 58); c.bezierCurveTo(-24, 40, -24, 10, 0, -20); c.fill(); }
          else { c.beginPath(); c.arc(0, -10, 44, Math.PI, 0); c.fill(); c.fillRect(-26, -10, 52, 14); c.beginPath(); c.arc(-44, -2, 26, 0, 7); c.arc(44, -2, 26, 0, 7); c.fill(); c.fillRect(-9, 0, 18, 70); }
        }, { srgb: true });
      },
      label: function (text, sub, tint) {
        return canvasTex("lbl-" + text + sub, 512, 160, function (c, W, H) {
          c.clearRect(0, 0, W, H);
          c.fillStyle = "rgba(14,34,58,.72)"; var r = 36;
          c.beginPath(); c.moveTo(r, 8); c.lineTo(W - r, 8); c.quadraticCurveTo(W - 8, 8, W - 8, r + 8); c.lineTo(W - 8, H - r - 8); c.quadraticCurveTo(W - 8, H - 8, W - r, H - 8); c.lineTo(r, H - 8); c.quadraticCurveTo(8, H - 8, 8, H - r - 8); c.lineTo(8, r + 8); c.quadraticCurveTo(8, 8, r, 8); c.fill();
          c.strokeStyle = tint || "#f2cf7a"; c.lineWidth = 4; c.stroke();
          c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#fff6dc";
          c.font = "700 58px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif"; c.fillText(text, W / 2, sub ? 64 : H / 2);
          if (sub) { c.fillStyle = tint || "#f2cf7a"; c.font = "600 32px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif"; c.fillText(sub, W / 2, 118); }
        });
      }
    };
    T.dispose = function () { Object.keys(cache).forEach(function (k) { cache[k].dispose(); }); };
    return T;
  }

  /* ================================================================ 場景積木 */
  function Ctx(THREE, scene, opt) {
    this.THREE = THREE; this.scene = scene; this.opt = opt = opt || {};
    this.q = opt.quality || "mid"; this.low = this.q === "low"; this.phone = !!opt.phone;
    this.phys = new Physics();
    this.batch = new Batcher(THREE);
    this.tex = makeTextures(THREE, opt.aniso || 1);
    this.mats = {}; this.geos = {};
    this.anims = []; this.labels = []; this.portals = []; this.railJobs = []; this.lights = [];
    this.glowables = []; this.glowSprites = []; this.glow = 1;   // 時段切換時調整：發光材質、光暈、點光源的強度
    this.root = new THREE.Group(); this.root.name = "World"; scene.add(this.root);
    this.live = new THREE.Group(); this.live.name = "WorldLive"; scene.add(this.live);
    this.rand = rng(opt.seed || 1234);
  }
  var P = Ctx.prototype;
  P.lin = function (hex) { return new this.THREE.Color(hex).convertSRGBToLinear(); };

  /** 共用材質（同一個 key 只建立一次） */
  P.mat = function (key) {
    if (this.mats[key]) return this.mats[key];
    var THREE = this.THREE, L = this.lin.bind(this), t = this.tex, m;
    var std = function (o) { return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.75, metalness: 0 }, o)); };
    var basic = function (o) { return new THREE.MeshBasicMaterial(o); };
    var self = this, glow = function (m, base) { self.glowables.push({ m: m, base: base, kind: m.isMeshBasicMaterial ? "basic" : "emissive" }); return m; };
    switch (key) {
      case "stone": m = std({ color: L("#f7f0e3"), roughness: 0.5, emissive: L("#3a2e1c"), emissiveIntensity: 0.08 }); break;
      case "stoneDark": m = std({ color: L("#e6d7bc"), roughness: 0.6 }); break;
      case "gold": m = std({ color: L("#f0c25e"), metalness: 0.85, roughness: 0.25, emissive: L("#6a4408"), emissiveIntensity: 0.45 }); break;
      case "goldRoof": m = std({ color: L("#f2b648"), metalness: 0.6, roughness: 0.3, emissive: L("#6a3c06"), emissiveIntensity: 0.4 }); break;
      case "violetRoof": m = std({ color: L("#a07ef0"), metalness: 0.35, roughness: 0.35, emissive: L("#3a1c80"), emissiveIntensity: 0.45 }); break;
      case "blueRoof": m = std({ color: L("#5c9df0"), metalness: 0.45, roughness: 0.28, emissive: L("#123c80"), emissiveIntensity: 0.25 }); break;
      case "pave": m = std({ map: t.pave(), roughness: 0.4, metalness: 0.05 }); break;
      case "road": m = std({ map: t.road(), roughness: 0.45 }); break;
      case "grass": m = std({ map: t.grass(), roughness: 0.95, emissive: L("#2c5a12"), emissiveIntensity: 0.12 }); break;
      case "rock": m = std({ map: t.rock(), color: L("#f2ece2"), roughness: 0.92, flatShading: true }); break;
      case "rockDark": m = std({ map: t.rock(), color: L("#d4ccc0"), roughness: 0.92, flatShading: true }); break;
      case "earth": m = std({ color: L("#b39268"), roughness: 1 }); break;
      case "trunk": m = std({ color: L("#a57a4e"), roughness: 0.85 }); break;
      case "worldTrunk": m = glow(std({ color: L("#e2b97c"), roughness: 0.6, emissive: L("#c07a20"), emissiveIntensity: 0.4 }), 0.4); break;
      case "leaf": m = std({ color: L("#5fb544"), roughness: 0.8, emissive: L("#1f5a12"), emissiveIntensity: 0.18 }); break;
      case "leaf2": m = std({ color: L("#93d454"), roughness: 0.8, emissive: L("#3a6a10"), emissiveIntensity: 0.18 }); break;
      case "leafDark": m = std({ color: L("#3e9440"), roughness: 0.85, emissive: L("#123f12"), emissiveIntensity: 0.15 }); break;
      case "leafGold": m = glow(std({ color: L("#cfe266"), roughness: 0.7, emissive: L("#8a7a10"), emissiveIntensity: 0.3 }), 0.3); break;
      case "pink": m = std({ color: L("#f7a6c8"), roughness: 0.75, emissive: L("#6a2040"), emissiveIntensity: 0.18 }); break;
      case "pink2": m = std({ color: L("#ffd2e6"), roughness: 0.75, emissive: L("#6a3048"), emissiveIntensity: 0.15 }); break;
      case "flower": m = std({ color: L("#ffffff"), roughness: 0.7, emissive: L("#ffffff"), emissiveIntensity: 0.12 }); break;
      case "cloud": m = std({ color: L("#ffffff"), roughness: 1, emissive: L("#ffffff"), emissiveIntensity: 0.32 }); break;
      case "glass": m = glow(std({ color: L("#d6f2ff"), metalness: 0.6, roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false, emissive: L("#7fd3ff"), emissiveIntensity: 0.22, side: THREE.DoubleSide }), 0.22); break;
      case "glassViolet": m = glow(std({ color: L("#e2d2ff"), metalness: 0.6, roughness: 0.05, transparent: true, opacity: 0.42, depthWrite: false, emissive: L("#a06cf5"), emissiveIntensity: 0.4, side: THREE.DoubleSide }), 0.4); break;
      case "glassBlue": m = glow(std({ color: L("#a8d8ff"), metalness: 0.6, roughness: 0.06, transparent: true, opacity: 0.6, depthWrite: false, emissive: L("#3f9be6"), emissiveIntensity: 0.45, side: THREE.DoubleSide }), 0.45); break;
      case "water": m = glow(std({ color: L("#6fd6ff"), roughness: 0.05, metalness: 0.4, emissive: L("#26a8e6"), emissiveIntensity: 0.55, transparent: true, opacity: 0.9 }), 0.55); break;
      case "winWarm": m = glow(std({ map: t.windows("warm"), emissiveMap: t.windows("warm"), emissive: L("#ffffff"), emissiveIntensity: 0.5, roughness: 0.5 }), 0.5); break;
      case "winCyan": m = glow(std({ map: t.windows("cyan"), emissiveMap: t.windows("cyan"), emissive: L("#ffffff"), emissiveIntensity: 0.5, roughness: 0.5 }), 0.5); break;
      case "winViolet": m = glow(std({ map: t.windows("violet"), emissiveMap: t.windows("violet"), emissive: L("#ffffff"), emissiveIntensity: 0.5, roughness: 0.5 }), 0.5); break;
      case "glowCyan": m = glow(basic({ color: L("#a6f0ff") }), 1); break;
      case "glowGold": m = glow(basic({ color: L("#ffe39a") }), 1); break;
      case "glowViolet": m = glow(basic({ color: L("#dcc2ff") }), 1); break;
      case "glowPink": m = glow(basic({ color: L("#ffd4e6") }), 1); break;
      case "banner": m = std({ color: L("#2e62d0"), roughness: 0.7, side: THREE.DoubleSide, emissive: L("#0a2470"), emissiveIntensity: 0.3 }); break;
      case "bannerViolet": m = std({ color: L("#6a46c8"), roughness: 0.7, side: THREE.DoubleSide }); break;
      default: throw new Error("unknown material " + key);
    }
    m.name = key; this.mats[key] = m; return m;
  };
  /** 共用幾何（同參數只建立一次） */
  P.geo = function (key, make) { return this.geos[key] || (this.geos[key] = make()); };

  /** 把幾何以位置、旋轉、縮放加入靜態合併 */
  P.put = function (geom, matKey, x, y, z, ry, sx, sy, sz, opt, rx, rz) {
    var THREE = this.THREE, m = this._m || (this._m = new THREE.Matrix4()), q = this._q || (this._q = new THREE.Quaternion()), e = this._e || (this._e = new THREE.Euler());
    e.set(rx || 0, ry || 0, rz || 0, "YXZ"); q.setFromEuler(e);
    if (!this._v1) { this._v1 = new THREE.Vector3(); this._v2 = new THREE.Vector3(); }
    m.compose(this._v1.set(x, y, z), q, this._v2.set(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz));
    this.batch.add(geom, typeof matKey === "string" ? this.mat(matKey) : matKey, m, opt);
  };
  P.box = function (matKey, x, y, z, wd, ht, dp, ry, opt) { this.put(this.geo("box", function () { return new this.THREE.BoxGeometry(1, 1, 1); }.bind(this)), matKey, x, y, z, ry, wd, ht, dp, opt); };
  P.cyl = function (matKey, x, y, z, rTop, rBot, ht, seg, opt) {
    var THREE = this.THREE; seg = seg || 12;
    this.put(this.geo("cyl" + rTop + "_" + rBot + "_" + seg, function () { return new THREE.CylinderGeometry(rTop, rBot, 1, seg); }), matKey, x, y, z, 0, 1, ht, 1, opt);
  };

  /* ---------------- 可走的地面 ---------------- */
  /** 浮島：可走半徑 r、地面高度 h；外觀包含草地、石板、岩石底座、瀑布 */
  P.island = function (o) {
    var THREE = this.THREE, r = o.r, h = o.h, R = r + (o.rim == null ? 1.6 : o.rim), sx = o.sx || 1, sz = o.sz || 1, self = this;
    var reg = o.walk === false ? null : this.phys.addCircle(o.x, o.z, r, h, o.tag);
    // 草地頂面
    var top = this.geo("disc48", function () { var g = new THREE.CircleGeometry(1, 48); g.rotateX(-Math.PI / 2); return g; });
    this.put(top, "grass", o.x, h - (o.grassDrop || 0.04), o.z, 0, R * sx, 1, R * sz, { cast: false });
    if (o.pave) this.put(top, o.paveMat || "pave", o.x, h + 0.01, o.z, o.paveRot || 0, o.pave, 1, o.pave, { cast: false });
    // 側邊土層＋岩石底座（越往下越窄、邊緣不規則）
    this.put(this.geo("band", function () { return new THREE.CylinderGeometry(1, 0.96, 1, 40, 1, true); }), "earth", o.x, h - 0.6, o.z, 0, R * sx, 1.15, R * sz, { cast: false });
    var depth = o.depth || R * 1.4, seed = o.seed || ((o.x * 31 + o.z * 17) | 0);
    var key = "under" + seed;
    var under = this.geo(key, function () {
      var rr = rng(seed), pts = [], n = 9;
      for (var i = 0; i <= n; i++) { var k = i / n, rad = (1 - Math.pow(k, 1.5)) * (0.92 + rr() * 0.12) + 0.04; pts.push(new THREE.Vector2(Math.max(0.02, rad * (k > 0.95 ? 0.2 : 1)), -k)); }
      var g = new THREE.LatheGeometry(pts, 18), p = g.attributes.position;
      for (var j = 0; j < p.count; j++) { var y = p.getY(j); if (y > -0.02) continue; var s = 1 + (rr() - 0.5) * 0.28; p.setX(j, p.getX(j) * s); p.setZ(j, p.getZ(j) * s); p.setY(j, y + (rr() - 0.5) * 0.05); }
      g.computeVertexNormals(); return g;
    });
    this.put(under, o.dark ? "rockDark" : "rock", o.x, h - 1.15, o.z, (seed % 7) * 0.4, R * sx, depth, R * sz, { cast: false });
    this.phys.solids.push({ x: o.x, z: o.z, rx: R * sx, rz: R * sz, top: h, bottom: h - 1.15 - depth });
    (o.falls || []).forEach(function (f) { self.waterfall(o.x + Math.cos(f.a) * R * sx * 0.98, h - 0.15, o.z + Math.sin(f.a) * R * sz * 0.98, f.a, f.w || 3, f.len || depth * 0.9); });
    if (reg && o.rail !== false) this.railJobs.push(function () { self.railCircle(reg, o.x, o.z, r + 0.1, h, o.lamps); });
    return reg;
  };
  /** 方形平台（可以是坡道：h0 → h1 沿區域 +Z 方向） */
  P.terrace = function (o) {
    var self = this, reg = this.phys.addRect(o.x, o.z, o.w, o.d, o.rot || 0, o.h, o.h, o.tag);
    this.box("stoneDark", o.x, o.h - (o.thick || 2.6) / 2 - 0.05, o.z, o.w + 0.3, o.thick || 2.6, o.d + 0.3, o.rot || 0, { cast: false });
    var THREE = this.THREE, pl = this.geo("plane", function () { var g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); return g; });
    var mat = this.mats["road" + o.w + "x" + o.d] || (this.mats["road" + o.w + "x" + o.d] = (function () { var m = self.mat("road").clone(); m.map = self.tex.road().clone(); m.map.needsUpdate = true; m.map.repeat.set(o.w / 4, o.d / 4); return m; })());
    this.put(pl, mat, o.x, o.h + 0.005, o.z, o.rot || 0, o.w, 1, o.d, { cast: false });
    if (o.rail !== false) this.railJobs.push(function () { self.railRect(reg, o.h); });
    return reg;
  };
  P.ramp = function (o) {   // 階梯：外觀是一階一階，物理是平滑坡道（腳不會卡住）
    var reg = this.phys.addRect(o.x, o.z, o.w, o.d, o.rot || 0, o.h0, o.h1, o.tag, o.ext == null ? 0.7 : o.ext), n = Math.max(2, Math.round(Math.abs(o.h1 - o.h0) / 0.28));
    var c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0), self = this;
    for (var k = 0; k < n; k++) {   // 每一階一個方塊，頂面高度＝坡道在該階中間的高度（腳和台階最多差半階）
      var lz = -o.d / 2 + (k + 0.5) * o.d / n, top = o.h0 + (o.h1 - o.h0) * (k + 0.5) / n, base = Math.min(o.h0, o.h1) - 0.6;
      this.box(k % 2 ? "stone" : "stoneDark", o.x + lz * s, (top + base) / 2, o.z + lz * c, o.w, top - base, o.d / n + 0.01, o.rot || 0, { cast: false });
    }
    if (o.rail !== false) this.railJobs.push(function () {
      [-1, 1].forEach(function (sd) {
        var pts = [], hw = o.w / 2 + 0.05; for (var i = 0; i <= 6; i++) { var lz = -o.d / 2 + i * o.d / 6; pts.push([o.x + (sd * hw) * c + lz * s, o.z - (sd * hw) * s + lz * c, o.h0 + (o.h1 - o.h0) * i / 6]); }
        self.railLine(pts, reg, true);
      });
    });
    return reg;
  };
  /** 橋／步道：控制點 [x,z,h]，自動平滑；寬度 w */
  P.bridge = function (o) {
    var THREE = this.THREE, self = this, cp = o.pts.map(function (p) { return new THREE.Vector3(p[0], p[2], p[1]); });
    var curve = cp.length > 2 ? new THREE.CatmullRomCurve3(cp, false, "centripetal") : new THREE.LineCurve3(cp[0], cp[1]);
    var L = curve.getLength(), n = Math.max(2, Math.ceil(L / 1.6)), pts = curve.getSpacedPoints(n).map(function (v) { return [v.x, v.z, v.y]; });
    var reg = this.phys.addPath(pts, o.w, o.tag), wd = o.w;
    var deck = this.mats["bridgeDeck" + wd] || (this.mats["bridgeDeck" + wd] = (function () { var m = self.mat("road").clone(); m.map = self.tex.road().clone(); m.map.needsUpdate = true; m.map.repeat.set(1, 1.6 / wd); return m; })());
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], seg = Math.sqrt(dx * dx + dz * dz), dh = b[2] - a[2];
      // YXZ 尤拉角：區域 +Z 對準行進方向，再繞 X 抬起坡度
      var yaw = Math.atan2(dx, dz), slope = -Math.atan2(dh, seg), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, my = (a[2] + b[2]) / 2;
      var bx = this.geo("box", function () { return new THREE.BoxGeometry(1, 1, 1); });
      this.put(this.geo("plane", function () { var g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); return g; }), deck, mx, my + 0.005, mz, yaw, wd, 1, seg + 0.06, { cast: false }, slope);
      this.put(bx, "stoneDark", mx, my - 0.3, mz, yaw, wd + 0.25, 0.6, seg + 0.08, { cast: false }, slope);
      this.put(bx, "stone", mx, my - 0.95, mz, yaw, wd * 0.55, 0.8, seg + 0.08, { cast: false }, slope);
    }
    // 橋下的拱（每隔幾段一個）
    if (o.arches !== false) for (var k = 2; k < pts.length - 2; k += 4) {
      var p = pts[k], q = pts[k + 1], yaw2 = Math.atan2(-(q[1] - p[1]), q[0] - p[0]);
      this.put(this.geo("arch", function () { return new THREE.TorusGeometry(1.6, 0.22, 6, 14, Math.PI); }), "stone", p[0], p[2] - 1.3, p[1], yaw2, 1, 1, 1, { cast: false }, 0, Math.PI);
    }
    if (o.rail !== false) this.railJobs.push(function () {
      [-1, 1].forEach(function (sd) {
        var side = pts.map(function (p, i) {
          var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.sqrt(dx * dx + dz * dz) || 1;
          return [p[0] - dz / l * (wd / 2 + 0.05) * sd, p[1] + dx / l * (wd / 2 + 0.05) * sd, p[2]];
        });
        self.railLine(side, reg, false, o.lampEvery || 7);
      });
    });
    return reg;
  };

  /* ---------------- 欄杆（遇到其他通道或建築自動留缺口） ---------------- */
  P.railLine = function (pts, owner, force, lampEvery) {
    var THREE = this.THREE, phys = this.phys, self = this, posts = [], acc = 0, nextLamp = lampEvery ? lampEvery * 0.5 : 1e9, spacing = 1.15;
    var resampled = [pts[0]];
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.sqrt(dx * dx + dz * dz), m = Math.max(1, Math.round(L / spacing));
      for (var k = 1; k <= m; k++) resampled.push([a[0] + dx * k / m, a[1] + dz * k / m, a[2] + (b[2] - a[2]) * k / m]);
    }
    resampled.forEach(function (p, i) { var ok = force || !phys.covered(p[0], p[1], owner, 0.35); posts.push(ok ? p : null); });
    var post = this.geo("baluster", function () { return new THREE.CylinderGeometry(0.07, 0.1, 0.78, 6); });
    var rail = this.geo("railbar", function () { return new THREE.BoxGeometry(1, 0.12, 0.2); });
    for (var j = 0; j < posts.length; j++) {
      var p0 = posts[j]; if (!p0) continue;
      this.put(post, "stone", p0[0], p0[2] + 0.39, p0[1], 0, 1, 1, 1, { cast: false });
      if (j > 0) { var dd = Math.hypot(p0[0] - resampled[j - 1][0], p0[1] - resampled[j - 1][1]); acc += dd; }
      var p1 = posts[j + 1];
      if (p1) {
        var ddx = p1[0] - p0[0], ddz = p1[1] - p0[1], len = Math.sqrt(ddx * ddx + ddz * ddz), yaw = Math.atan2(-ddz, ddx), sl = Math.atan2(p1[2] - p0[2], len);
        this.put(rail, "stone", (p0[0] + p1[0]) / 2, (p0[2] + p1[2]) / 2 + 0.84, (p0[1] + p1[1]) / 2, yaw, len + 0.08, 1, 1, { cast: false }, 0, sl);
        this.put(rail, "gold", (p0[0] + p1[0]) / 2, (p0[2] + p1[2]) / 2 + 0.92, (p0[1] + p1[1]) / 2, yaw, len + 0.08, 0.3, 0.5, { cast: false }, 0, sl);
        this.put(rail, "stoneDark", (p0[0] + p1[0]) / 2, (p0[2] + p1[2]) / 2 + 0.05, (p0[1] + p1[1]) / 2, yaw, len + 0.08, 1, 1.2, { cast: false }, 0, sl);
      }
      if (acc >= nextLamp) { nextLamp += lampEvery; self.lamp(p0[0], p0[2], p0[1]); }
    }
  };
  P.railCircle = function (owner, x, z, R, h, lamps) {
    var n = Math.max(12, Math.round(Math.PI * 2 * R / 1.15)), pts = [];
    for (var i = 0; i <= n; i++) { var a = i / n * Math.PI * 2; pts.push([x + Math.cos(a) * R, z + Math.sin(a) * R, h]); }
    this.railLine(pts, owner, false, lamps ? Math.PI * 2 * R / lamps : 0);
  };
  P.railRect = function (reg, h) {
    var c = reg.c, s = reg.s, hw = reg.hw + 0.05, hd = reg.hd + 0.05, pts = [];
    [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [-hw, -hd]].forEach(function (q) { pts.push([reg.x + q[0] * c + q[1] * s, reg.z - q[0] * s + q[1] * c, h]); });
    this.railLine(pts, reg, false, 9);
  };

  /* ---------------- 景物 ---------------- */
  P.lamp = function (x, y, z) {   // 水晶燈柱（發光不放真的燈，省效能）
    var THREE = this.THREE;
    this.cyl("stone", x, y + 0.9, z, 0.09, 0.13, 1.8, 6, { cast: false });
    this.cyl("gold", x, y + 1.85, z, 0.2, 0.12, 0.14, 6, { cast: false });
    this.put(this.geo("crystal", function () { return new THREE.OctahedronGeometry(0.2, 0); }), "glowCyan", x, y + 2.15, z, 0, 1, 1.6, 1, { cast: false });
    if (!this.low) (this.lampPts || (this.lampPts = [])).push([x, y + 2.15, z]);
  };
  /** 蓬鬆的樹冠塊：表面有起伏的圓球（畫質高時更圓滑） */
  P.puff = function (variant) {
    var THREE = this.THREE, det = this.q === "high" || this.q === "ultra" ? 2 : 1;
    return this.geo("puff" + det + "_" + variant, function () {
      var g = new THREE.IcosahedronGeometry(1, det), p = g.attributes.position, r = rng(900 + variant), v = new THREE.Vector3(), nor = new Float32Array(p.count * 3);
      var bumps = []; for (var i = 0; i < 7; i++) bumps.push(new THREE.Vector3(r() - 0.5, r() - 0.3, r() - 0.5).normalize());
      for (var j = 0; j < p.count; j++) {
        v.fromBufferAttribute(p, j); var n = v.clone().normalize(), k = 1;
        bumps.forEach(function (b) { k += Math.max(0, n.dot(b) - 0.55) * 0.55; });
        if (n.y < -0.3) k *= 0.85 + (n.y + 1) * 0.2;                       // 底部稍微平一點，像插畫裡的樹冠
        v.copy(n).multiplyScalar(k); p.setXYZ(j, v.x, v.y, v.z); nor[j * 3] = n.x; nor[j * 3 + 1] = n.y; nor[j * 3 + 2] = n.z;
      }
      g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));   // 用球面方向當法線：圓滑柔和，沒有稜角
      return g;
    });
  };
  P.tree = function (x, y, z, s, kind, solid) {
    var THREE = this.THREE, r = this.rand;
    s = s || 1; kind = kind || "round";
    if (kind === "cypress") {
      this.cyl("trunk", x, y + 0.4 * s, z, 0.12 * s, 0.16 * s, 0.8 * s, 6);
      var cone = this.geo("cypress", function () { var g = new THREE.SphereGeometry(1, 12, 10); g.scale(1, 1, 1); var p = g.attributes.position; for (var i = 0; i < p.count; i++) { var yy = p.getY(i), k = Math.pow((1 - yy) / 2, 0.75) * 1.15; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } g.computeVertexNormals(); return g; });
      this.put(cone, "leafDark", x, y + 2.3 * s, z, r() * 3, 0.62 * s, 1.9 * s, 0.62 * s);
    } else {
      this.cyl("trunk", x, y + 0.9 * s, z, 0.13 * s, 0.24 * s, 1.8 * s, 8);
      var leafs = kind === "pink" ? ["pink", "pink2", "pink"] : kind === "gold" ? ["leafGold", "leaf2", "leafGold"] : ["leaf", "leaf2", "leaf"];
      var n = kind === "pink" ? 7 : 6;
      for (var i = 0; i < n; i++) {
        var a = i / (n - 1) * 6.28 + r(), top = i === 0, d = top ? 0 : (0.6 + r() * 0.25) * s, sc = (top ? 1.05 : 0.68 + r() * 0.2) * s;
        this.put(this.puff(i % 4), leafs[i % leafs.length], x + Math.cos(a) * d, y + (top ? 2.55 : 1.95 + r() * 0.5) * s, z + Math.sin(a) * d, r() * 6, sc, sc * 0.85, sc);
      }
      if (kind === "pink" && !this.low) for (var f = 0; f < 6; f++) { var af = r() * 6.28; this.put(this.geo("dot", function () { return new THREE.IcosahedronGeometry(0.12, 0); }), "pink2", x + Math.cos(af) * (0.6 + r() * 1.2) * s, y + 0.06, z + Math.sin(af) * (0.6 + r() * 1.2) * s, 0, 1.2, 0.3, 1.2, { cast: false }); }
    }
    if (solid) this.phys.addCircleObstacle(x, z, 0.32 * s, y, y + 2.5 * s);
  };
  P.bush = function (x, y, z, s, matKey) {
    var r = this.rand;
    for (var i = 0; i < 3; i++) { var a = r() * 6.28, d = i ? 0.45 * s : 0, sc = (i ? 0.55 : 0.7) * s; this.put(this.puff(i), matKey || "leafDark", x + Math.cos(a) * d, y + 0.35 * s, z + Math.sin(a) * d, r() * 6, sc, sc * 0.75, sc, { cast: false }); }
    if (r() < 0.5) for (var f = 0; f < 5; f++) { var af = r() * 6.28; this.put(this.geo("dot", function () { return new this.THREE.IcosahedronGeometry(0.12, 0); }.bind(this)), r() < 0.5 ? "pink" : "flower", x + Math.cos(af) * 0.55 * s, y + (0.4 + r() * 0.35) * s, z + Math.sin(af) * 0.55 * s, 0, 1, 1, 1, { cast: false }); }
  };
  P.flowerBed = function (x, y, z, r, colorKey) {
    var THREE = this.THREE, n = Math.round(r * r * 5), rr = this.rand, dot = this.geo("dot", function () { return new THREE.IcosahedronGeometry(0.12, 0); });
    this.put(this.geo("disc48", function () { var g = new THREE.CircleGeometry(1, 48); g.rotateX(-Math.PI / 2); return g; }), "leafDark", x, y + 0.03, z, 0, r, 1, r, { cast: false });
    for (var i = 0; i < n; i++) { var a = rr() * 6.28, d = Math.sqrt(rr()) * r * 0.92; this.put(dot, rr() < 0.6 ? colorKey || "pink" : "flower", x + Math.cos(a) * d, y + 0.12 + rr() * 0.1, z + Math.sin(a) * d, 0, 1, 1, 1, { cast: false }); }
  };
  P.waterfall = function (x, y, z, ang, wd, len) {
    var THREE = this.THREE, self = this;
    if (!this.fallMat) {
      var t = this.tex.fall(); t.repeat.set(1, 2);
      this.fallMat = new THREE.MeshBasicMaterial({ map: t, color: this.lin("#f4fcff"), transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, fog: true });
      this.anims.push(function (tt) { t.offset.y = (tt * 0.9) % 1; });
    }
    var g = new THREE.PlaneGeometry(wd, len, 1, 6), p = g.attributes.position;
    for (var i = 0; i < p.count; i++) { var k = (p.getY(i) + len / 2) / len; p.setZ(i, Math.pow(clamp(1 - k, 0, 1), 2.2) * 1.8); }   // 上緣往外拋出一點的弧線
    g.translate(0, -len / 2, 0);
    var m = new THREE.Mesh(g, this.fallMat); m.position.set(x, y, z); m.rotation.y = Math.PI / 2 - ang; m.userData.live = true; m.renderOrder = 2;
    this.live.add(m);
    // 瀑布頂端的白色水花、底部的水霧雲團
    for (var k = 0; k < 3; k++) this.put(this.puff(k), "cloud", x + Math.cos(ang) * (0.6 + k * 0.2) + Math.sin(ang) * (k - 1) * wd * 0.3, y - 0.2, z + Math.sin(ang) * (0.6 + k * 0.2) - Math.cos(ang) * (k - 1) * wd * 0.3, k, wd * 0.22, wd * 0.14, wd * 0.22, { cast: false });
    for (var q = 0; q < (this.low ? 2 : 5); q++) { var ox = (q - 2) * wd * 0.35, sz = wd * (0.7 + q % 2 * 0.3); this.put(this.puff(q % 4), "cloud", x + Math.cos(ang) * (1.6 + q % 2) + Math.sin(ang) * ox, y - len * 0.93 + (q % 2) * 1.2, z + Math.sin(ang) * (1.6 + q % 2) - Math.cos(ang) * ox, q, sz, sz * 0.6, sz, { cast: false }); }
  };
  P.spriteMat = function (key, color, opacity, tex, additive) {
    var k = "spr" + key + color + opacity; if (this.mats[k]) return this.mats[k];
    var THREE = this.THREE;
    if (additive) this.mats[k + "_glow"] = 1;
    return (this.mats[k] = new THREE.SpriteMaterial({ map: tex || this.tex.glow(), color: this.lin(color), transparent: true, opacity: opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true }));
  };
  P.glowSprite = function (x, y, z, size, color, opacity) {
    var s = new this.THREE.Sprite(this.spriteMat("glow", color, opacity == null ? 0.7 : opacity, null, true)); s.position.set(x, y, z); s.scale.set(size, size, 1); this.live.add(s);
    this.glowSprites.push({ s: s, size: size }); return s;
  };
  P.light = function (x, y, z, color, intensity, dist) {
    if (this.low || this.lights.length >= (this.phone ? 3 : 6)) return null;
    var l = new this.THREE.PointLight(this.lin(color), intensity, dist, 2); l.position.set(x, y, z); l.userData.base = intensity; this.live.add(l); this.lights.push(l); return l;
  };
  /** 地名牌（靠近時才清楚顯示） */
  P.label = function (x, y, z, text, sub, tint) {
    var THREE = this.THREE, mat = new THREE.SpriteMaterial({ map: this.tex.label(text, sub, tint), transparent: true, depthWrite: false, depthTest: false, fog: false });
    var s = new THREE.Sprite(mat); s.position.set(x, y, z); s.scale.set(6.4, 2, 1); s.renderOrder = 10; this.live.add(s);
    this.labels.push(s); return s;
  };
  /** 入口：玩家靠近時出現「進入」提示 */
  P.portal = function (o) { this.portals.push(o); return o; };

  /* ---------------- 建築 ---------------- */
  P.glassDome = function (o) {
    var THREE = this.THREE, r = o.r, y = o.y, self = this, glass = o.glass || "glass", drumH = o.drumH || 2.4;
    var g = new THREE.Group(); g.position.set(o.x, y, o.z); g.rotation.y = o.rot || 0;
    var add = function (geo, mk, px, py, pz, ry, sx, sy, sz, rx, rz) { var m = new THREE.Mesh(geo, self.mat(mk)); m.position.set(px, py, pz); m.rotation.set(rx || 0, ry || 0, rz || 0, "YXZ"); m.scale.set(sx || 1, sy || 1, sz || 1); g.add(m); return m; };
    add(new THREE.CylinderGeometry(r + 0.9, r + 1.1, 0.5, 40), "stoneDark", 0, 0.25 - 0.2, 0);
    add(new THREE.CylinderGeometry(r, r, drumH, 32, 1, true), o.win || "winCyan", 0, drumH / 2, 0);
    add(new THREE.TorusGeometry(r + 0.05, 0.14, 6, 40), "gold", 0, drumH, 0, 0, 1, 1, 1, Math.PI / 2);
    var cols = Math.round(r * 3.2);
    for (var i = 0; i < cols; i++) { var a = i / cols * Math.PI * 2; add(new THREE.CylinderGeometry(0.15, 0.18, drumH + 0.4, 8), "stone", Math.cos(a) * (r + 0.55), (drumH + 0.4) / 2, Math.sin(a) * (r + 0.55)); }
    add(new THREE.TorusGeometry(r + 0.55, 0.16, 6, 40), "stone", 0, drumH + 0.45, 0, 0, 1, 1, 1, Math.PI / 2);
    var dome = add(new THREE.SphereGeometry(r, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, drumH, 0); dome.castShadow = false;
    for (var k = 0; k < 10; k++) add(new THREE.TorusGeometry(r, 0.07, 4, 20, Math.PI), "gold", 0, drumH, 0, k / 10 * Math.PI, 1, 1, 1);
    [0.35, 0.69, 0.9].forEach(function (k) { var rr = r * Math.sqrt(1 - k * k); add(new THREE.TorusGeometry(rr, 0.06, 4, 32), "gold", 0, drumH + r * k, 0, 0, 1, 1, 1, Math.PI / 2); });
    add(new THREE.TorusGeometry(r + 1.05, 0.08, 4, 48), "glow" + (o.glow || "Cyan"), 0, 0.08, 0, 0, 1, 1, 1, Math.PI / 2);
    // 門口兩側的旗幟（同分鏡圖的藍色學院旗）
    [-1.9, 1.9].forEach(function (bx) {
      add(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 6), "gold", bx, 2.1, r + 1.4);
      add(new THREE.PlaneGeometry(0.9, 2.2), o.glow === "Violet" ? "bannerViolet" : "banner", bx + (bx > 0 ? 0.5 : -0.5), 3, r + 1.4);
      add(new THREE.OctahedronGeometry(0.16, 0), "gold", bx, 4.35, r + 1.4);
    });
    add(new THREE.CylinderGeometry(0.25, 0.5, 0.8, 10), "gold", 0, drumH + r + 0.3, 0);
    add(new THREE.OctahedronGeometry(0.4, 0), "glowCyan", 0, drumH + r + 1.1, 0, 0, 1, 1.8, 1);
    // 正門（朝區域 +Z）
    add(new THREE.BoxGeometry(2.6, 3.2, 0.9), "stone", 0, 1.6, r + 0.55);
    add(new THREE.PlaneGeometry(1.7, 2.5), "glow" + (o.glow || "Cyan"), 0, 1.3, r + 1.01);
    this.batch.addObject(g);
    // 內部的光（不合併，才能有動畫）
    if (o.inner) { var s = this.glowSprite(o.x, y + drumH * 0.6, o.z, r * 1.6, o.inner, 0.55); this.anims.push(function (t) { s.material.opacity = 0.45 + Math.sin(t * 1.6) * 0.12; }); }
    this.phys.addCircleObstacle(o.x, o.z, r + 0.75, y - 0.5, y + drumH + r);
    var fx = o.x + Math.sin(o.rot || 0) * (r + 2.2), fz = o.z + Math.cos(o.rot || 0) * (r + 2.2);
    return { door: [fx, fz] };
  };
  P.pavilion = function (x, y, z, r, roofKey) {   // 小涼亭
    var THREE = this.THREE, n = 6;
    this.cyl("stoneDark", x, y + 0.1, z, r + 0.2, r + 0.3, 0.2, 6, { cast: false });
    for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; this.cyl("stone", x + Math.cos(a) * r, y + 1.2, z + Math.sin(a) * r, 0.1, 0.12, 2.2, 6); }
    this.put(this.geo("cone6", function () { return new THREE.ConeGeometry(1, 1, 6); }), roofKey || "violetRoof", x, y + 2.9, z, 0, r * 1.35, 1.4, r * 1.35);
    this.cyl("gold", x, y + 3.8, z, 0.05, 0.08, 0.6, 6);
    this.phys.addCircleObstacle(x, z, r + 0.25, y, y + 3.6);
  };
  /** 兩坡屋頂（三角柱）：寬 w（X）、深 d（Z）、高 h */
  P.gable = function (matKey, x, y, z, wd, ht, dp, ry) {
    var THREE = this.THREE, geo = this.geo("gable", function () {
      var s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0);
      var g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g;
    });
    this.put(geo, matKey, x, y, z, ry || 0, wd, ht, dp);
  };
  /** 金色殿堂（導師村、圓滿村用）；正面朝 rot 方向 */
  P.hall = function (o) {
    var THREE = this.THREE, self = this, y = o.y, wd = o.w || 10, dp = o.d || 8, ht = o.h || 5, roof = o.roof || "goldRoof";
    var g = new THREE.Group(); g.position.set(o.x, y, o.z); g.rotation.y = o.rot || 0;
    var add = function (geo, mk, px, py, pz, sx, sy, sz, ry) { var m = new THREE.Mesh(geo, typeof mk === "string" ? self.mat(mk) : mk); m.position.set(px, py, pz); m.scale.set(sx || 1, sy || 1, sz || 1); m.rotation.y = ry || 0; g.add(m); return m; };
    var box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 12), cone4 = new THREE.ConeGeometry(1, 1, 4);
    var gab = (function () { var s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0); var e = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); e.translate(0, 0, -0.5); return e; })();
    var win = o.win || "winWarm";
    add(box, "stoneDark", 0, 0.3, 0, wd + 1.4, 0.6, dp + 1.4);
    add(box, win, 0, 0.6 + ht / 2, 0, wd, ht, dp);
    add(box, "gold", 0, 0.6 + ht + 0.12, 0, wd + 0.4, 0.25, dp + 0.4);
    add(gab, roof, 0, 0.6 + ht + 0.25, 0, wd + 0.6, 2.6, dp + 0.6);
    // 兩側翼樓
    [-1, 1].forEach(function (sd) {
      add(box, win, sd * (wd / 2 + 2.2), 0.6 + ht * 0.4, 0.6, 4.2, ht * 0.8, dp - 1.6);
      add(gab, roof, sd * (wd / 2 + 2.2), 0.6 + ht * 0.8 + 0.1, 0.6, 4.6, 1.8, dp - 1.2);
    });
    // 中央塔樓＋尖頂
    add(box, win, 0, 0.6 + ht + 2.2, dp * 0.15, 3.6, 4.4, 3.6);
    add(cone4, roof, 0, 0.6 + ht + 4.4 + 1.6, dp * 0.15, 3.1, 3.2, 3.1, Math.PI / 4);
    add(cyl, "gold", 0, 0.6 + ht + 7.8, dp * 0.15, 0.08, 1.4, 0.08);
    // 正門與門廊
    add(box, "stone", 0, 0.6 + 1.7, dp / 2 + 0.8, 3.8, 3.4, 1.6);
    add(gab, roof, 0, 0.6 + 3.4, dp / 2 + 0.8, 4.4, 1.4, 1.9, 0);
    add(new THREE.PlaneGeometry(2.2, 2.6), o.door || "glowGold", 0, 0.6 + 1.3, dp / 2 + 1.61);
    [-1.6, 1.6].forEach(function (cx) { add(cyl, "stone", cx, 0.6 + 1.7, dp / 2 + 1.7, 0.18, 3.4, 0.18); });
    // 屋脊金線、四角小尖塔、門前燈籠
    var pin = new THREE.ConeGeometry(0.25, 1.4, 8);
    add(box, "gold", 0, 0.6 + ht + 2.85, 0, 0.18, 0.18, dp + 0.7);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
      add(cyl, "stone", q[0] * (wd / 2 + 4.3), 0.6 + ht * 0.4, q[1] * (dp / 2 - 0.2) + 0.6, 0.35, ht * 0.8 + 0.4, 0.35);
      add(pin, roof, q[0] * (wd / 2 + 4.3), 0.6 + ht * 0.8 + 1.1, q[1] * (dp / 2 - 0.2) + 0.6);
      add(pin, roof, q[0] * (wd / 2 + 0.1), 0.6 + ht + 0.9, q[1] * (dp / 2 + 0.1));
    });
    this.batch.addObject(g);
    var cR = Math.cos(o.rot || 0), sR = Math.sin(o.rot || 0);
    [-2.6, 2.6].forEach(function (lx) { var wx = o.x + lx * cR + (dp / 2 + 2.2) * sR, wz = o.z - lx * sR + (dp / 2 + 2.2) * cR; self.lamp(wx, y, wz); self.glowSprite(wx, y + 2.15, wz, 1.8, "#ffe2a0", 0.6); });
    if (o.emblem) {   // 門上的徽章（發光，正對前方）
      var em = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: this.tex.emblem(o.emblem, o.emblemColor || "#ffe9a8"), transparent: true, depthWrite: false }));
      var c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0), lz = dp / 2 + 0.33;
      em.position.set(o.x + s * lz, y + ht + 1.75, o.z + c * lz); em.rotation.y = o.rot || 0; this.live.add(em);
    }
    var hw = (wd / 2 + 4.4), c2 = Math.cos(o.rot || 0), s2 = Math.sin(o.rot || 0);
    this.phys.addBoxObstacle(o.x + s2 * 0.4, o.z + c2 * 0.4, hw * 2, dp + 3.4, o.rot || 0, y - 0.5, y + ht + 8);
    return { door: [o.x + s2 * (dp / 2 + 3.6), o.z + c2 * (dp / 2 + 3.6)] };
  };

  /* ---------------- 天空與遠景（漸層天空、太陽／月亮、星星、立體積雲、雲海、遠山、漂浮小島、光點） ---------------- */
  P.environment = function (o) {
    o = o || {};
    var THREE = this.THREE, self = this, L = this.lin.bind(this), r = rng(o.seed || 77);
    var U = { top: { value: L("#1f6fe0") }, mid: { value: L("#6fb6ff") }, hor: { value: L("#e6f4ff") }, sunCol: { value: L("#fff2d0") }, sunDir: { value: new THREE.Vector3(-0.35, 0.55, -0.75).normalize() }, stars: { value: 0 }, sunSize: { value: 1 } };
    var sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: U,
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: [
        "uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunCol; uniform vec3 sunDir; uniform float stars; uniform float sunSize; varying vec3 vP;",
        "float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
        "void main(){",
        "  vec3 d = normalize(vP); float h = d.y;",
        "  vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.8, h)) : mix(hor, mid, smoothstep(-0.08, 0.12, h));",
        "  float s = max(dot(d, normalize(sunDir)), 0.0);",
        "  c += sunCol * (smoothstep(0.9993 - 0.0006 * sunSize, 0.9997, s) * 2.2 + pow(s, 80.0) * 0.6 + pow(s, 7.0) * 0.22 + pow(s, 2.0) * 0.06 * (1.0 - h));",
        "  if (stars > 0.0 && h > 0.0) { vec2 g = vec2(atan(d.z, d.x) * 180.0, h * 260.0); vec2 id = floor(g); float st = step(0.985, h21(id)) * h21(id + 7.0); vec2 f = fract(g) - 0.5; c += vec3(0.9, 0.95, 1.0) * st * smoothstep(0.35, 0.0, length(f)) * stars * 1.6 * smoothstep(0.0, 0.25, h); }",
        "  gl_FragColor = vec4(c, 1.0);",
        "}"].join("\n")
    }));
    sky.renderOrder = -10; sky.frustumCulled = false; this.live.add(sky); this.sky = sky; this.skyU = U;
    // 雲海：大平面（底色）＋流動貼圖
    var seaT = this.tex.cloudSea(); seaT.repeat.set(7, 7);
    var seaMat = new THREE.MeshBasicMaterial({ map: seaT, color: L("#ffffff"), fog: true });
    var sea = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), seaMat);
    sea.rotation.x = -Math.PI / 2; sea.position.y = o.seaY || -30; this.live.add(sea); this.seaMat = seaMat;
    this.anims.push(function (t) { seaT.offset.set(t * 0.002, t * 0.001); });
    // 立體積雲：一團團白色蓬鬆球（雲海表面的雲浪、浮島下方的雲、地平線上的大積雲）
    var nNear = this.low ? 30 : this.phone ? 45 : 110, nFar = this.low ? 10 : this.phone ? 18 : 30;
    var cloudCluster = function (cx, cy, cz, size, flat) {
      var n = 4 + (r() * 4 | 0);
      for (var i = 0; i < n; i++) {
        var a = r() * 6.28, dd = r() * size * 0.9, sc = size * (0.45 + r() * 0.45);
        self.put(self.puff(i % 4), "cloud", cx + Math.cos(a) * dd, cy + (i ? r() * size * 0.35 : size * 0.2), cz + Math.sin(a) * dd * (flat ? 1 : 0.6), r() * 6, sc, sc * (flat ? 0.45 : 0.7), sc, { cast: false, receive: false });
      }
    };
    for (var i = 0; i < nNear; i++) { var a = r() * Math.PI * 2, d = 20 + Math.sqrt(r()) * 110; cloudCluster(Math.cos(a) * d, (o.seaY || -30) + 3 + r() * 10, Math.sin(a) * d - 8, 5 + r() * 7, true); }
    for (var j = 0; j < nFar; j++) { var a2 = r() * Math.PI * 2, d2 = 170 + r() * 170; cloudCluster(Math.cos(a2) * d2, -10 + r() * 45, Math.sin(a2) * d2, 14 + r() * 16, false); }
    var nC = this.low ? 8 : this.phone ? 16 : 26, cm = this.spriteMat("cloud", "#ffffff", 0.8, this.tex.cloud());
    for (var k = 0; k < nC; k++) { var a3 = r() * Math.PI * 2, d3 = 60 + r() * 260, sc3 = 18 + r() * 40, cl = new THREE.Sprite(cm); cl.position.set(Math.cos(a3) * d3, -20 + r() * 12, Math.sin(a3) * d3); cl.scale.set(sc3, sc3 * 0.45, 1); this.live.add(cl); }
    // 遠山（淡藍、受天空顏色影響）
    var mtnA = new THREE.MeshBasicMaterial({ color: L("#9dbbe6"), fog: false }), mtnB = new THREE.MeshBasicMaterial({ color: L("#c3d8f2"), fog: false }); this.mtnMats = [mtnA, mtnB];
    var cone = new THREE.ConeGeometry(1, 1, 7);
    for (var m = 0; m < 34; m++) {
      var am = m / 34 * Math.PI * 2 + r() * 0.15, dm = 380 + r() * 120, hm = 50 + r() * 120, wm = 40 + r() * 50;
      var mm = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(am) * dm, -40 + hm / 2, Math.sin(am) * dm), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 3, 0)), new THREE.Vector3(wm, hm, wm));
      this.batch.add(cone, m % 2 ? mtnA : mtnB, mm, { cast: false, receive: false });
    }
    // 漂浮小島（有的帶小瀑布）
    var nI = this.low ? 8 : 18;
    for (var q = 0; q < nI; q++) {
      var ai = r() * Math.PI * 2, di = 75 + r() * 170, yi = 8 + r() * 55, si = 2 + r() * 6;
      this.island({ x: Math.cos(ai) * di, z: Math.sin(ai) * di, r: si, h: yi, rim: 0.4, walk: false, rail: false, depth: si * 2.2, seed: 500 + q, dark: q % 2, falls: q % 3 === 0 && !this.low ? [{ a: ai + Math.PI, w: si * 0.35, len: si * 3 }] : [] });
      this.tree(Math.cos(ai) * di, yi, Math.sin(ai) * di, si * 0.45, q % 3 ? "round" : "cypress");
    }
    // 金色光點
    if (!this.low) {
      var nP = this.phone ? 260 : 520, pos = new Float32Array(nP * 3);
      for (var p = 0; p < nP; p++) { var ap = r() * Math.PI * 2, dp = r() * 60; pos[p * 3] = Math.cos(ap) * dp; pos[p * 3 + 1] = r() * 20; pos[p * 3 + 2] = Math.sin(ap) * dp - 8; }
      var pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      var pm = new THREE.PointsMaterial({ map: this.tex.glow(), color: L("#ffe9a6"), size: 0.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 });
      var pts = new THREE.Points(pg, pm); this.live.add(pts); this.sparkMat = pm;
      this.anims.push(function (t) { pts.rotation.y = t * 0.02; pts.position.y = Math.sin(t * 0.4) * 0.4; });
    }
  };

  /** 燈柱光暈（地圖建完後一次產生，時段切換時一起調整亮度） */
  P._lampGlows = function () {
    if (!this.lampPts || !this.lampPts.length) return;
    var THREE = this.THREE, n = this.lampPts.length, pos = new Float32Array(n * 3);
    this.lampPts.forEach(function (p, i) { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; });
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.lampMat = new THREE.PointsMaterial({ map: this.tex.glow(), color: this.lin("#9feeff"), size: 2.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 });
    this.live.add(new THREE.Points(g, this.lampMat));
  };

  /** 時段（白天／黃昏／夜晚）：由 world.js 傳入混合好的設定，這裡負責場景內的天空、雲、發光強度 */
  P.applyTime = function (T) {
    var U = this.skyU, self = this;
    if (U) { U.top.value.copy(T.top); U.mid.value.copy(T.mid); U.hor.value.copy(T.hor); U.sunCol.value.copy(T.sunCol); U.sunDir.value.copy(T.skySun); U.stars.value = T.stars; U.sunSize.value = T.sunSize; }
    if (this.seaMat) this.seaMat.color.copy(T.sea);
    if (this.mats.cloud) { this.mats.cloud.color.copy(T.cloud); this.mats.cloud.emissive.copy(T.cloud); this.mats.cloud.emissiveIntensity = T.cloudGlow; }
    Object.keys(this.mats).forEach(function (k) { if (k.indexOf("sprcloud") === 0) self.mats[k].color.copy(T.cloud); });
    if (this.mtnMats) { this.mtnMats[0].color.copy(T.mtn).multiplyScalar(0.85); this.mtnMats[1].color.copy(T.mtn); }
    if (this.fallMat) this.fallMat.color.copy(T.fall);
    var g = T.glow; this.glow = g;
    this.glowables.forEach(function (q) {
      if (q.kind === "emissive") q.m.emissiveIntensity = q.base * g;
      else { if (!q.col) q.col = q.m.color.clone(); q.m.color.copy(q.col).multiplyScalar(Math.min(1.6, 0.75 + g * 0.35)); }
    });
    this.glowSprites.forEach(function (q) { q.s.material.opacity = Math.min(1, (q.s.material.userData.base || (q.s.material.userData.base = q.s.material.opacity)) * (0.55 + g * 0.45)); });
    this.lights.forEach(function (l) { l.intensity = l.userData.base * (0.5 + g * 0.5); });
    if (this.lampMat) { this.lampMat.opacity = Math.min(0.95, 0.12 + (g - 1) * 0.5 + 0.2); this.lampMat.size = 1.6 + g * 0.7; }
    if (this.sparkMat) this.sparkMat.opacity = Math.min(1, 0.55 + g * 0.2);
  };

  /** 每幀動畫 */
  P.update = function (t, dt, camPos) {
    for (var i = 0; i < this.anims.length; i++) this.anims[i](t, dt);
    if (camPos) for (var j = 0; j < this.labels.length; j++) {   // 地名牌：近看清楚、遠看淡
      var s = this.labels[j], d = s.position.distanceTo(camPos), k = clamp(1.25 - d / 70, 0.15, 1);
      s.material.opacity = k; var sc = clamp(d / 14, 1, 2.6); s.scale.set(6.4 * sc, 2 * sc, 1);
    }
  };
  /** 地圖建完後呼叫：產生欄杆、合併靜態網格 */
  P.finish = function () {
    this.railJobs.forEach(function (f) { f(); }); this.railJobs = [];
    this._lampGlows();
    this.meshes = this.batch.build(this.root);
    var tris = 0; this.meshes.forEach(function (m) { tris += m.geometry.attributes.position.count / 3; });
    this.stats = { staticMeshes: this.meshes.length, staticTris: Math.round(tris), materials: Object.keys(this.mats).length };
    return this.stats;
  };
  P.dispose = function () {
    var THREE = this.THREE;
    [this.root, this.live].forEach(function (g) { g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); });
    Object.keys(this.mats).forEach(function (k) { this.mats[k].dispose(); }, this);
    Object.keys(this.geos).forEach(function (k) { this.geos[k].dispose(); }, this);
    this.tex.dispose();
  };

  NS.createContext = function (THREE, scene, opt) { return new Ctx(THREE, scene, opt); };
  NS.Ctx = Ctx;
})(window);
