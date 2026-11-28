/*!
 * MFWorld Props — 身心智慧學院風格的大型景物（聖殿、能量地球、世界樹、蓮花池、冥想光影）
 * 全部以程式生成並併入 MFWorld Kit 的靜態合併；動畫部分放在 c.live。其他地圖可以直接重複使用。
 */
(function (w) {
  "use strict";
  var NS = w.MFWorld, P = NS.Ctx.prototype, rng = NS.util.rng;

  /** 重複貼圖的材質副本（窗戶牆面依尺寸重複，不會被拉長） */
  P.matRepeat = function (key, rx, ry) {
    var k = key + "@" + rx + "x" + ry; if (this.mats[k]) return this.mats[k];
    var base = this.mat(key), m = base.clone(), THREE = this.THREE;
    ["map", "emissiveMap"].forEach(function (p) { if (base[p]) { m[p] = base[p].clone(); m[p].wrapS = m[p].wrapT = THREE.RepeatWrapping; m[p].repeat.set(rx, ry); m[p].needsUpdate = true; } });
    var gq = this.glowables.filter(function (q) { return q.m === base; })[0]; if (gq) this.glowables.push({ m: m, base: gq.base, kind: gq.kind });
    m.name = k; this.mats[k] = m; return m;
  };

  function grp(c, x, y, z, rot) {
    var THREE = c.THREE, g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot || 0;
    g.addM = function (geo, mk, px, py, pz, sx, sy, sz, ry, rx, rz) {
      var m = new THREE.Mesh(geo, typeof mk === "string" ? c.mat(mk) : mk);
      m.position.set(px, py, pz); m.scale.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz); m.rotation.set(rx || 0, ry || 0, rz || 0, "YXZ"); g.add(m); return m;
    };
    return g;
  }

  /** 中央聖殿（智慧殿堂）：正面中心在 (x, y, zf)，朝 +Z（rot 可轉向） */
  P.palace = function (o) {
    var THREE = this.THREE, c = this, x = o.x, y = o.y, zf = o.z, g = grp(this, x, y, zf, o.rot);
    var box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 14), cone = new THREE.ConeGeometry(1, 1, 14), oct = new THREE.OctahedronGeometry(1, 0);
    var winA = this.matRepeat("winCyan", 6, 2), winB = this.matRepeat("winCyan", 4, 1.5), winW = this.matRepeat("winCyan", 2, 1.6);
    g.addM(box, "stoneDark", 0, -0.8, -6.5, 31, 3.7, 13);                       // 台基（往下接到浮島）
    g.addM(box, winA, 0, 1 + 4.5, -7, 24, 9, 10);                              // 主體
    [1.2, 5.6, 10.1].forEach(function (h) { g.addM(box, "gold", 0, h, -1.95, 24.4, 0.3, 0.3); });
    g.addM(box, "stone", 0, 10.4, -7, 25, 0.8, 10.8);
    g.addM(box, winB, 0, 11 + 3, -8, 15, 6, 8);                                // 第二層
    g.addM(box, "gold", 0, 17.1, -8, 15.6, 0.3, 8.6);
    // 中央拱門與光之世界樹
    g.addM(box, "stone", 0, 1 + 7, -1.6, 9, 14, 1.4);
    g.addM(new THREE.PlaneGeometry(6, 10.5), new THREE.MeshBasicMaterial({ map: this.tex.portal("cyan"), transparent: false }), 0, 1 + 5.25, -0.89);
    g.addM(new THREE.TorusGeometry(3.6, 0.28, 6, 24, Math.PI), "gold", 0, 1 + 10.6, -0.85);
    g.addM(box, "gold", -3.3, 1 + 5.3, -0.85, 0.35, 10.6, 0.3); g.addM(box, "gold", 3.3, 1 + 5.3, -0.85, 0.35, 10.6, 0.3);
    // 列柱
    [-10.8, -8.6, -6.4, 6.4, 8.6, 10.8].forEach(function (cx) { g.addM(cyl, "stone", cx, 1 + 4.5, -1.2, 0.36, 9, 0.36); g.addM(cyl, "gold", cx, 1 + 9.1, -1.2, 0.5, 0.25, 0.5); });
    // 圓頂
    g.addM(cyl, winB, 0, 17.9, -8, 5, 1.6, 5);
    g.addM(new THREE.SphereGeometry(5, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), "glassBlue", 0, 18.7, -8).castShadow = false;
    for (var k = 0; k < 12; k++) g.addM(new THREE.TorusGeometry(5, 0.08, 4, 20, Math.PI), "gold", 0, 18.7, -8, 1, 1, 1, k / 12 * Math.PI);
    g.addM(cone, "gold", 0, 18.7 + 5 + 4.5, -8, 0.7, 9, 0.7);
    // 兩座主塔＋外側尖塔
    [-1, 1].forEach(function (sd) {
      g.addM(cyl, "stone", sd * 9.6, 9, -2.6, 1.3, 18, 1.3);
      [4, 9, 14].forEach(function (h) { g.addM(new THREE.TorusGeometry(1.32, 0.12, 6, 20), "gold", sd * 9.6, h, -2.6, 1, 1, 1, 0, Math.PI / 2); });
      g.addM(cone, "blueRoof", sd * 9.6, 18 + 3.6, -2.6, 1.7, 7.2, 1.7);
      g.addM(cyl, winW, sd * 15.5, 4.5, -7.5, 3.2, 9, 3.2);                    // 側翼圓樓
      g.addM(new THREE.SphereGeometry(3.2, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), "glassBlue", sd * 15.5, 9, -7.5);
      g.addM(cyl, "stone", sd * 13.6, 6.5, -3.4, 0.8, 13, 0.8);
      g.addM(cone, "blueRoof", sd * 13.6, 13 + 2.5, -3.4, 1.0, 5, 1.0);
      g.addM(new THREE.PlaneGeometry(1.5, 4.6), "banner", sd * 5.6, 6.2, -0.75);
      g.addM(box, "gold", sd * 5.6, 8.6, -0.72, 1.9, 0.12, 0.12);
    });
    // 屋頂欄杆與金色小尖塔（主體、第二層）
    var pin = new THREE.ConeGeometry(0.22, 1.1, 8), post = new THREE.CylinderGeometry(0.08, 0.1, 0.7, 6);
    [[24, 10, 10.8, -7], [15, 8, 17.25, -8]].forEach(function (L) {
      var w2 = L[0] / 2, d2 = L[1] / 2, y0 = L[2], zc = L[3];
      for (var px = -w2; px <= w2 + 0.01; px += 1.2) { g.addM(post, "stone", px, y0 + 0.35, zc + d2); g.addM(post, "stone", px, y0 + 0.35, zc - d2); }
      for (var pz = -d2; pz <= d2 + 0.01; pz += 1.2) { g.addM(post, "stone", -w2, y0 + 0.35, zc + pz); g.addM(post, "stone", w2, y0 + 0.35, zc + pz); }
      g.addM(box, "gold", 0, y0 + 0.75, zc + d2, L[0], 0.12, 0.25); g.addM(box, "gold", -w2, y0 + 0.75, zc, 0.25, 0.12, L[1]); g.addM(box, "gold", w2, y0 + 0.75, zc, 0.25, 0.12, L[1]);
      for (var k2 = 0; k2 <= 6; k2++) { var xx = -w2 + k2 * L[0] / 6; g.addM(cyl, "stone", xx, y0 + 0.9, zc + d2, 0.22, 1.8, 0.22); g.addM(pin, "gold", xx, y0 + 2.35, zc + d2); }
    });
    // 圓頂周圍四座小尖塔
    [[-4.6, -3.6], [4.6, -3.6], [-4.6, -12.4], [4.6, -12.4]].forEach(function (q) {
      g.addM(cyl, "stone", q[0], 19.2, q[1], 0.45, 4, 0.45); g.addM(cone, "blueRoof", q[0], 22.4, q[1], 0.6, 2.4, 0.6); g.addM(pin, "gold", q[0], 24.1, q[1]);
    });
    // 主塔的拱窗帶與金冠
    [-1, 1].forEach(function (sd) {
      g.addM(new THREE.CylinderGeometry(1.36, 1.36, 3.4, 14, 1, true), winW, sd * 9.6, 11.5, -2.6);
      g.addM(new THREE.TorusGeometry(1.75, 0.14, 6, 24), "gold", sd * 9.6, 18.1, -2.6, 1, 1, 1, 0, Math.PI / 2);
    });
    this.batch.addObject(g);
    // 第二層正面的玫瑰窗（發光）
    var rose = new THREE.Mesh(new THREE.CircleGeometry(1.9, 40), new THREE.MeshBasicMaterial({ map: this.tex.emblem("star", "#bff3ff"), transparent: true, depthWrite: false }));
    var rc = Math.cos(o.rot || 0), rs = Math.sin(o.rot || 0);
    rose.position.set(x + rs * -3.93, y + 14.2, zf + rc * -3.93); rose.rotation.y = o.rot || 0; this.live.add(rose);
    this.glowSprite(x + rs * -3.6, y + 14.2, zf + rc * -3.6, 6, "#9fe9ff", 0.45);
    [-4.4, 4.4].forEach(function (lx) { this.glowSprite(x + lx, y + 2.2, zf + 0.4, 2.4, "#ffe2a0", 0.7); this.lamp(x + lx, y, zf + 0.6); }, this);
    // 發光水晶與天空光環（動畫）
    var self = this, crystals = [];
    [[0, 18.7 + 10.5, -8, 1.3], [-9.6, 26.6, -2.6, 0.7], [9.6, 26.6, -2.6, 0.7], [-13.6, 19.4, -3.4, 0.5], [13.6, 19.4, -3.4, 0.5]].forEach(function (p) {
      var m = new THREE.Mesh(oct, self.mat("glowCyan")); m.scale.set(p[3], p[3] * 1.8, p[3]); m.position.set(x + p[0], y + p[1], zf + p[2]); self.live.add(m); crystals.push(m);
      self.glowSprite(x + p[0], y + p[1], zf + p[2], p[3] * 6, "#9fe9ff", 0.6);
    });
    var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 70, 12, 1, true), new THREE.MeshBasicMaterial({ color: this.lin("#bdf3ff"), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(x, y + 30 + 35, zf - 8); this.live.add(beam);
    var rings = [[10, "#9fe9ff", 0.12], [15, "#d9b8ff", -0.08], [21, "#ffffff", 0.05]].map(function (r, i) {
      var m = new THREE.Mesh(new THREE.TorusGeometry(r[0], 0.22, 6, 96), new THREE.MeshBasicMaterial({ color: self.lin(r[1]), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.set(x, y + 62 + i * 1.5, zf - 8); m.rotation.x = Math.PI / 2 + r[2]; m.userData.sp = (i % 2 ? -1 : 1) * (0.06 + i * 0.03); self.live.add(m); return m;
    });
    this.glowSprite(x, y + 62, zf - 8, 26, "#cfefff", 0.45);
    this.light(x, y + 5, zf + 3, "#9fe9ff", 2.2, 22);
    this.anims.push(function (t) {
      crystals.forEach(function (m, i) { m.rotation.y = t * 0.8 + i; m.position.y += Math.sin(t * 1.5 + i) * 0.004; });
      rings.forEach(function (m) { m.rotation.z = t * m.userData.sp; });
      beam.material.opacity = 0.26 + Math.sin(t * 2) * 0.06;
    });
    var cs = Math.cos(o.rot || 0), sn = Math.sin(o.rot || 0);
    this.phys.addBoxObstacle(x - sn * 7.5, zf - cs * 7.5, 37, 15, o.rot || 0, y - 3, y + 40);
    return { door: [x + sn * 1.6, zf + cs * 1.6] };
  };

  /** 能量核心：旋轉的地球＋金色軌道環＋噴泉水池 */
  P.globeFountain = function (o) {
    var THREE = this.THREE, x = o.x, y = o.y, z = o.z, self = this;
    this.cyl("stoneDark", x, y + 0.3, z, 4.3, 4.5, 0.6, 40);
    this.put(this.geo("disc48", function () { var g = new THREE.CircleGeometry(1, 48); g.rotateX(-Math.PI / 2); return g; }), "water", x, y + 0.56, z, 0, 3.95, 1, 3.95, { cast: false });
    this.put(new THREE.TorusGeometry(4.35, 0.12, 6, 48), "gold", x, y + 0.62, z, 0, 1, 1, 1, { cast: false }, Math.PI / 2);
    this.cyl("stone", x, y + 1.3, z, 1.2, 1.7, 1.6, 20);
    this.put(new THREE.TorusGeometry(1.25, 0.1, 6, 30), "gold", x, y + 2.1, z, 0, 1, 1, 1, { cast: false }, Math.PI / 2);
    // 地面上的光環
    [[6, 0.07, "gold"], [8.2, 0.07, "gold"], [5.2, 0.12, "glowCyan"]].forEach(function (r) { self.put(new THREE.TorusGeometry(r[0], r[1], 4, 96), r[2], x, y + 0.02, z, 0, 1, 1, 0.3, { cast: false }, Math.PI / 2); });
    var tex = this.tex.earth(), globe = new THREE.Mesh(new THREE.SphereGeometry(2.1, 40, 24), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: this.lin("#bfe8ff"), emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.1 }));
    globe.position.set(x, y + 4.4, z); globe.castShadow = true; this.live.add(globe);
    var ringMat = this.mat("gold"), r1 = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.06, 6, 80), ringMat), r2 = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.05, 6, 80), ringMat);
    [r1, r2].forEach(function (r) { r.position.copy(globe.position); self.live.add(r); });
    var halo = this.glowSprite(x, y + 4.4, z, 9, "#8fdcff", 0.55);
    // 噴泉水柱（四道向外的細水流，用發光小粒子表現）
    var jets = [];
    if (!this.low) for (var i = 0; i < 8; i++) { var s = new THREE.Sprite(this.spriteMat("jet", "#e9fbff", 0.7, null, true)); s.scale.set(0.5, 0.5, 1); this.live.add(s); jets.push({ s: s, a: i / 8 * Math.PI * 2, k: i / 8 }); }
    this.light(x, y + 4.4, z, "#8fdcff", 2.4, 16);
    this.anims.push(function (t, dt) {
      globe.rotation.y = t * 0.25;
      r1.rotation.set(Math.PI / 2 + 0.45, t * 0.5, 0); r2.rotation.set(Math.PI / 2 - 0.5, -t * 0.35, 0.3);
      halo.material.opacity = 0.45 + Math.sin(t * 1.7) * 0.1;
      jets.forEach(function (j) { var u = (t * 0.6 + j.k) % 1, d = 1.4 + u * 2.4; j.s.position.set(x + Math.cos(j.a) * d, y + 2.2 + Math.sin(u * Math.PI) * 1.6 - u * 1.4, z + Math.sin(j.a) * d); j.s.material.opacity = 0.7 * (1 - u); });
    });
    this.phys.addCircleObstacle(x, z, 4.4, y - 0.5, y + 7);
  };

  /** 世界樹：發光的巨樹（樹幹、氣根、枝幹、樹冠、能量環、垂掛水晶） */
  P.worldTree = function (o) {
    var THREE = this.THREE, x = o.x, y = o.y, z = o.z, self = this, r = rng(o.seed || 909), S = o.scale || 1;
    var prof = [[3.8, 0], [2.7, 0.6], [2.0, 2], [1.65, 4], [1.55, 7], [1.75, 9], [2.3, 10.6], [1.2, 11.6]].map(function (p) { return new THREE.Vector2(p[0] * S, p[1] * S); });
    var trunk = new THREE.LatheGeometry(prof, 16), tp = trunk.attributes.position;
    for (var i = 0; i < tp.count; i++) { var k = 1 + (r() - 0.5) * 0.18; tp.setX(i, tp.getX(i) * k); tp.setZ(i, tp.getZ(i) * k); }
    trunk.computeVertexNormals();
    this.put(trunk, "worldTrunk", x, y, z, 0, 1, 1, 1);
    var tube = function (pts, rad) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); })), 10, rad, 6, false); };
    for (var a = 0; a < 7; a++) {                                                // 氣根
      var an = a / 7 * Math.PI * 2 + r() * 0.3, c = Math.cos(an), s = Math.sin(an);
      this.put(tube([[c * 1.6 * S, 2.2 * S, s * 1.6 * S], [c * 3.2 * S, 0.9 * S, s * 3.2 * S], [c * 4.8 * S, 0.1, s * 4.8 * S]], 0.45 * S), "worldTrunk", x, y, z, 0, 1, 1, 1);
    }
    var leaves = ["leaf", "leaf2", "leafGold", "leaf"], blob = this.geo("blob", function () { return new THREE.IcosahedronGeometry(1, 1); }), oct = this.geo("crystal", function () { return new THREE.OctahedronGeometry(0.2, 0); });
    var nb = 9, ends = [];
    for (var b = 0; b < nb; b++) {                                               // 枝幹與樹冠
      var ab = b / nb * Math.PI * 2 + r() * 0.4, R = (6 + r() * 3.5) * S, H = (13 + r() * 3.5) * S, cb = Math.cos(ab), sb = Math.sin(ab);
      this.put(tube([[cb * 0.8 * S, 9.6 * S, sb * 0.8 * S], [cb * R * 0.45, H * 0.85, sb * R * 0.45], [cb * R, H, sb * R]], 0.42 * S), "worldTrunk", x, y, z, 0, 1, 1, 1);
      ends.push([cb * R, H, sb * R]);
      for (var l = 0; l < 4; l++) { var sc = (2.3 + r() * 1.5) * S; this.put(blob, leaves[(b + l) % 4], x + cb * R + (r() - 0.5) * 3.4 * S, y + H + (r() - 0.2) * 2 * S, z + sb * R + (r() - 0.5) * 3.4 * S, r() * 3, sc, sc * 0.72, sc); }
      for (var q = 0; q < 2; q++) this.put(oct, "glowCyan", x + cb * R * (0.5 + q * 0.3), y + H * 0.82 - 1.6 * S, z + sb * R * (0.5 + q * 0.3), 0, S * 1.3, S * 2.2, S * 1.3, { cast: false });
    }
    for (var t2 = 0; t2 < 8; t2++) { var sc2 = (3 + r() * 1.6) * S, at = r() * 6.28, dt2 = r() * 3.5 * S; this.put(blob, leaves[t2 % 4], x + Math.cos(at) * dt2, y + (16.5 + r() * 2.5) * S, z + Math.sin(at) * dt2, r() * 3, sc2, sc2 * 0.7, sc2); }
    // 正門（朝 rot 方向）與能量環
    var rot = o.rot || 0, dx = Math.sin(rot), dz = Math.cos(rot);
    var door = new THREE.Mesh(new THREE.PlaneGeometry(1.8 * S, 3.2 * S), new THREE.MeshBasicMaterial({ map: this.tex.portal("gold"), transparent: true, depthWrite: false }));
    door.position.set(x + dx * 2.05 * S, y + 1.7 * S, z + dz * 2.05 * S); door.rotation.y = rot; this.live.add(door);
    this.glowSprite(x + dx * 2.6 * S, y + 1.8 * S, z + dz * 2.6 * S, 5 * S, "#ffd98a", 0.6);
    var ringMat = new THREE.MeshBasicMaterial({ color: this.lin("#ffd77a"), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    var rings = [0, 1].map(function (i) { var m = new THREE.Mesh(new THREE.TorusGeometry((3.4 + i * 0.9) * S, 0.07 * S, 4, 64), ringMat); m.position.set(x, y + (4.4 + i * 1.3) * S, z); self.live.add(m); return m; });
    this.glowSprite(x, y + 14 * S, z, 26 * S, "#fff1b8", 0.28);
    this.light(x, y + 6 * S, z, "#ffd98a", 2.2, 20 * S);
    this.anims.push(function (t) { rings.forEach(function (m, i) { m.rotation.set(Math.PI / 2 + Math.sin(t * 0.6 + i) * 0.18, 0, t * (i ? -0.4 : 0.3)); m.position.y = y + (4.4 + i * 1.3 + Math.sin(t + i) * 0.25) * S; }); });
    this.phys.addCircleObstacle(x, z, 4.0 * S, y - 1, y + 40);
    return { door: [x + dx * 4.6 * S, z + dz * 4.6 * S] };
  };

  /** 蓮花水池 */
  P.lotusFountain = function (o) {
    var THREE = this.THREE, x = o.x, y = o.y, z = o.z, r = o.r || 2.2;
    this.cyl("stone", x, y + 0.3, z, r + 0.25, r + 0.35, 0.6, 32);
    this.put(this.geo("disc48", function () { var g = new THREE.CircleGeometry(1, 48); g.rotateX(-Math.PI / 2); return g; }), "water", x, y + 0.55, z, 0, r, 1, r, { cast: false });
    var petal = this.geo("petal", function () { return new THREE.SphereGeometry(1, 10, 6); });
    for (var i = 0; i < 10; i++) { var a = i / 10 * Math.PI * 2; this.put(petal, i % 2 ? "glowPink" : "glowGold", x + Math.cos(a) * 0.55, y + 1.0, z + Math.sin(a) * 0.55, -a + Math.PI / 2, 0.28, 0.14, 0.75, { cast: false }, -0.7); }
    var g = this.glowSprite(x, y + 1.2, z, 4, "#ffe6b0", 0.6);
    this.anims.push(function (t) { g.material.opacity = 0.5 + Math.sin(t * 2.1) * 0.12; });
    this.phys.addCircleObstacle(x, z, r + 0.35, y - 0.5, y + 0.75);
  };

  /** 冥想中的光之人形（智慧村圓頂內） */
  P.meditator = function (o) {
    var THREE = this.THREE, x = o.x, y = o.y, z = o.z;
    this.cyl("gold", x, y + 0.15, z, 1.1, 1.2, 0.3, 24);
    this.put(this.geo("cone10", function () { return new THREE.ConeGeometry(1, 1, 10); }), "glowCyan", x, y + 0.85, z, 0, 0.75, 1.1, 0.6, { cast: false });
    this.put(this.geo("head", function () { return new THREE.SphereGeometry(0.3, 12, 8); }), "glowCyan", x, y + 1.65, z, 0, 1, 1, 1, { cast: false });
    this.put(this.geo("legs", function () { return new THREE.CylinderGeometry(0.22, 0.22, 1.4, 8); }), "glowCyan", x, y + 0.42, z, 0, 1, 1, 1, { cast: false }, 0, Math.PI / 2);
    var s = this.glowSprite(x, y + 1.3, z, 4.5, "#8fe8ff", 0.6);
    this.anims.push(function (t) { s.scale.setScalar(4.2 + Math.sin(t * 1.2) * 0.4); });
  };

  /** 漂浮的徽章（學院標誌，慢慢旋轉） */
  P.floatEmblem = function (x, y, z, kind, color, size) {
    var THREE = this.THREE, m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: this.tex.emblem(kind, color), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.position.set(x, y, z); this.live.add(m);
    var g = this.glowSprite(x, y, z, size * 1.6, color, 0.4);
    this.anims.push(function (t) { m.rotation.y = t * 0.5; m.position.y = y + Math.sin(t * 0.9) * 0.3; g.position.y = m.position.y; });
    return m;
  };

  /** 在浮島上隨機種樹（避開通道、建築、入口動線） */
  P.scatter = function (o) {
    var r = rng(o.seed || 5), n = 0, tries = 0, ph = this.phys, self = this;
    while (n < o.count && tries++ < o.count * 40) {
      var a = r() * Math.PI * 2, d = (o.rMin || 0) + Math.sqrt(r()) * (o.rMax - (o.rMin || 0)), x = o.x + Math.cos(a) * d * (o.sx || 1), z = o.z + Math.sin(a) * d * (o.sz || 1);
      if (o.avoidWalk && ph.covered(x, z, o.owner || null, o.pad || 1.2)) continue;
      if (!o.avoidWalk && ph.regions.some(function (g) { return g !== o.owner && g.type !== "circle" && ph.heightIn(g, x, z, -(o.pad || 1.4)) != null; })) continue;
      if (ph.blocked(x, z, null, o.pad || 1.2)) continue;
      if ((o.keep || []).some(function (k) { return NS.util.segDist(x, z, k[0], k[1], k[2] == null ? k[0] : k[2], k[3] == null ? k[1] : k[3]).d < (k[4] || 2.6); })) continue;
      var kind = o.kinds[(r() * o.kinds.length) | 0], s = (o.sMin || 0.9) + r() * ((o.sMax || 1.4) - (o.sMin || 0.9));
      if (kind === "bush") self.bush(x, o.y, z, s * 0.7, r() < 0.5 ? "leafDark" : "leaf");
      else if (kind === "flowers") self.flowerBed(x, o.y, z, s * 0.8, o.flower || "pink");
      else self.tree(x, o.y, z, s, kind, o.solid);
      n++;
    }
    return n;
  };
})(window);
