/*!
 * AnimationLibrary — 七種角色動畫的 AnimationClip（骨架動畫）
 *
 * 動作以「相對於站姿的旋轉量（角度）」描述關鍵影格，再用三次曲線補間、以 30fps 取樣成
 * QuaternionKeyframeTrack / VectorKeyframeTrack。因為是相對量，套到別的角色（換裝、換體型）時
 * 會自動加上該角色自己的站姿，所以同一套動作可以共用。
 *
 * 角度方向（角色面向 +Z）：
 *   大腿／手臂 X 負 = 往前擺；小腿 X 正 = 膝蓋彎；前臂 X 負 = 手肘彎；脊椎／頭 X 正 = 前傾／低頭
 *   左手臂 Z 正 = 向外抬（右手臂相反）；腳掌 X 負 = 腳尖翹起
 *
 * 動畫：idle, walk, run, jumpStart, jumpAir, jumpLand, turn, grab, release, celebrate,
 *       carryArms（持物時的上半身層）、blink（眨眼層，永遠疊加）
 */
(function (w) {
  "use strict";
  var NS = w.MFChar;
  var ARM_BONES = ["LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand"];

  /* ---------- 共用姿勢 ---------- */
  function mirror(p) {  // 左 → 右鏡像：X 不變，Y、Z 取反
    var o = {};
    Object.keys(p).forEach(function (k) {
      var v = p[k];
      if (k.indexOf("Left") === 0) o["Right" + k.slice(4)] = [v[0], -v[1], -v[2]];
      else if (k.indexOf("Right") === 0) o["Left" + k.slice(5)] = [v[0], -v[1], -v[2]];
      else o[k] = v;
    });
    return o;
  }
  function both(left) { return Object.assign({}, left, mirror(left)); }
  function merge() { var o = {}; for (var i = 0; i < arguments.length; i++) Object.assign(o, arguments[i]); return o; }

  var CARRY_ARMS = both({ LeftShoulder: [0, 0, 2], LeftArm: [-40, 0, -11], LeftForeArm: [-60, 0, 0], LeftHand: [8, 0, -8] });
  var CROUCH = both({ LeftUpLeg: [-36, 0, 0], LeftLeg: [66, 0, 0], LeftFoot: [-30, 0, 0] });
  var REACH = merge(both({ LeftUpLeg: [-22, 0, 0], LeftLeg: [44, 0, 0], LeftFoot: [-22, 0, 0], LeftArm: [-74, 0, -7], LeftForeArm: [-10, 0, 0], LeftHand: [-12, 0, 0] }),
    { Spine: [26, 0, 0], Spine1: [10, 0, 0], Head: [-16, 0, 0] });
  var AIR = merge({ LeftUpLeg: [-32, 0, 0], RightUpLeg: [-10, 0, 0], LeftLeg: [55, 0, 0], RightLeg: [26, 0, 0] },
    both({ LeftFoot: [16, 0, 0], LeftArm: [-38, 0, 52], LeftForeArm: [-30, 0, 0] }), { Spine: [-3, 0, 0], Head: [-4, 0, 0] });

  /* ---------- 動作定義：keys[bone] = [[t, x, y, z], ...]（角度）；pos.Hips = [[t, dx, dy, dz]] ---------- */
  function poseKeys(list) {       // list = [[t, pose, hipsDy], ...] → keys / pos
    var keys = {}, pos = { Hips: [] };
    var bones = {};
    list.forEach(function (e) { Object.keys(e[1]).forEach(function (b) { bones[b] = 1; }); });
    Object.keys(bones).forEach(function (b) { keys[b] = list.map(function (e) { var v = e[1][b] || [0, 0, 0]; return [e[0], v[0], v[1], v[2]]; }); });
    pos.Hips = list.map(function (e) { var d = e[2] || [0, 0, 0]; if (typeof d === "number") d = [0, d, 0]; return [e[0], d[0], d[1], d[2]]; });
    return { keys: keys, pos: pos };
  }
  function valueAt(keys, t, dur) {  // 循環關鍵影格的線性取值
    var ks = keys.concat([[dur, keys[0][1], keys[0][2], keys[0][3]]]);
    for (var i = 0; i < ks.length - 1; i++) {
      if (t >= ks[i][0] && t <= ks[i + 1][0]) {
        var u = (t - ks[i][0]) / Math.max(1e-6, ks[i + 1][0] - ks[i][0]);
        return [t, ks[i][1] + (ks[i + 1][1] - ks[i][1]) * u, ks[i][2] + (ks[i + 1][2] - ks[i][2]) * u, ks[i][3] + (ks[i + 1][3] - ks[i][3]) * u];
      }
    }
    return [t, keys[0][1], keys[0][2], keys[0][3]];
  }
  function shift(keys, dt, dur) {  // 走路／跑步的右腳＝左腳延後半個週期
    var out = keys.map(function (k) { return [(k[0] + dt) % dur, k[1], k[2], k[3]]; }).sort(function (a, b) { return a[0] - b[0]; });
    if (out[0][0] > 1e-6) { var v = valueAt(keys, (dur - dt) % dur, dur); out.unshift([0, v[1], v[2], v[3]]); }
    return out;
  }
  function closeLoop(keys, dur) { var f = keys[0]; if (keys[keys.length - 1][0] < dur) keys.push([dur, f[1], f[2], f[3]]); return keys; }
  function cycle(left, dur) {      // 左側關鍵影格 → 左右各自循環
    var keys = {};
    Object.keys(left).forEach(function (b) {
      keys[b] = closeLoop(left[b].slice(), dur);
      if (b.indexOf("Left") === 0) {
        var r = "Right" + b.slice(4);
        keys[r] = closeLoop(shift(left[b], dur / 2, dur).map(function (k) { return [k[0], k[1], -k[2], -k[3]]; }), dur);
      }
    });
    return keys;
  }

  var DEFS = {};

  DEFS.idle = {
    dur: 6, loop: true,
    keys: {
      Spine: [[0, 0, 0, 0], [1.5, 1, 0, 0.6], [3, 0, 0, 0], [4.5, 1, 0, -0.6], [6, 0, 0, 0]],
      Spine1: [[0, 0, 0, 0], [1.5, 2, 0, 0], [3, 0, 0, 0], [4.5, 2, 0, 0], [6, 0, 0, 0]],            // 呼吸：胸口起伏
      LeftShoulder: [[0, 0, 0, 0], [1.5, 0, 0, 2.2], [3, 0, 0, 0], [4.5, 0, 0, 2.2], [6, 0, 0, 0]],   // 肩膀輕微上下
      RightShoulder: [[0, 0, 0, 0], [1.5, 0, 0, -2.2], [3, 0, 0, 0], [4.5, 0, 0, -2.2], [6, 0, 0, 0]],
      Head: [[0, 0, 0, 0], [2.1, 0, 0, 0], [2.7, -3, 15, 2], [3.7, -3, 15, 2], [4.3, 0, 0, 0], [5.2, 2, -4, 0], [6, 0, 0, 0]],   // 偶爾轉頭看看
      LeftArm: [[0, 0, 0, 0], [3, 2, 0, 2.5], [6, 0, 0, 0]],
      RightArm: [[0, 0, 0, 0], [3, 2, 0, -1.5], [6, 0, 0, 0]],
      LeftForeArm: [[0, 0, 0, 0], [3, -4, 0, 0], [6, 0, 0, 0]],
      RightForeArm: [[0, 0, 0, 0], [3, -3, 0, 0], [6, 0, 0, 0]],
      LeftUpLeg: [[0, 0, 0, 0], [3, 0, 0, -1.2], [6, 0, 0, 0]],                                       // 重心左右微移
      RightUpLeg: [[0, 0, 0, 0], [3, 0, 0, -1.2], [6, 0, 0, 0]]
    },
    pos: { Hips: [[0, 0, 0, 0], [1.5, 0.002, 0.002, 0], [3, 0.006, 0, 0], [4.5, 0.002, 0.002, 0], [6, 0, 0, 0]] }
  };

  DEFS.walk = {
    dur: 1, loop: true, stride: 0.56,
    keys: Object.assign(cycle({
      LeftUpLeg: [[0, -28, 0, 0], [0.25, -4, 0, 0], [0.5, 24, 0, 0], [0.75, -8, 0, 0]],
      LeftLeg: [[0, 4, 0, 0], [0.12, 14, 0, 0], [0.28, 6, 0, 0], [0.5, 12, 0, 0], [0.63, 46, 0, 0], [0.82, 28, 0, 0]],
      LeftFoot: [[0, -18, 0, 0], [0.12, 0, 0, 0], [0.4, 6, 0, 0], [0.55, 28, 0, 0], [0.7, 6, 0, 0], [0.88, -10, 0, 0]],   // 腳跟著地 → 腳尖離地
      LeftArm: [[0, 22, 0, 0], [0.5, -24, 0, 0]],                                                       // 手腳反向擺動
      LeftForeArm: [[0, -10, 0, 0], [0.5, -24, 0, 0]]
    }, 1), {
      Hips: [[0, 0, -6, 2], [0.25, 0, 0, 0], [0.5, 0, 6, -2], [0.75, 0, 0, 0], [1, 0, -6, 2]],
      Spine: [[0, 4, 0, 0], [1, 4, 0, 0]],
      Spine1: [[0, 1, 5, -1], [0.5, 1, -5, 1], [1, 1, 5, -1]],
      Head: [[0, -3, 1, 1], [0.5, -3, -1, -1], [1, -3, 1, 1]]
    }),
    pos: { Hips: [[0, 0, -0.012, 0], [0.25, 0, 0.008, 0], [0.5, 0, -0.012, 0], [0.75, 0, 0.008, 0], [1, 0, -0.012, 0]] }   // 隨步伐上下起伏
  };

  DEFS.run = {
    dur: 0.66, loop: true, stride: 1.5,
    keys: Object.assign(cycle({
      LeftUpLeg: [[0, -48, 0, 0], [0.165, -10, 0, 0], [0.33, 32, 0, 0], [0.5, -22, 0, 0]],
      LeftLeg: [[0, 15, 0, 0], [0.08, 30, 0, 0], [0.165, 24, 0, 0], [0.33, 30, 0, 0], [0.42, 96, 0, 0], [0.55, 72, 0, 0]],
      LeftFoot: [[0, -10, 0, 0], [0.165, 0, 0, 0], [0.33, 36, 0, 0], [0.45, 10, 0, 0]],
      LeftArm: [[0, 46, 0, 8], [0.33, -56, 0, 8]],                                                      // 手臂大幅擺動
      LeftForeArm: [[0, -66, 0, 0], [0.33, -84, 0, 0]]
    }, 0.66), {
      Hips: [[0, 0, -10, 3], [0.33, 0, 10, -3], [0.66, 0, -10, 3]],
      Spine: [[0, 14, 0, 0], [0.66, 14, 0, 0]],                                                          // 身體前傾
      Spine1: [[0, 4, 8, 0], [0.33, 4, -8, 0], [0.66, 4, 8, 0]],
      Head: [[0, -11, 0, 0], [0.66, -11, 0, 0]]
    }),
    pos: { Hips: [[0, 0, -0.02, 0], [0.08, 0, -0.03, 0], [0.2, 0, 0.032, 0], [0.33, 0, -0.02, 0], [0.41, 0, -0.03, 0], [0.53, 0, 0.032, 0], [0.66, 0, -0.02, 0]] }   // 彈跳
  };

  DEFS.jumpStart = Object.assign({ dur: 0.32, loop: false }, poseKeys([
    [0, {}, 0],
    [0.1, merge(CROUCH, both({ LeftArm: [40, 0, 4], LeftForeArm: [-20, 0, 0] }), { Spine: [18, 0, 0], Head: [-12, 0, 0] }), -0.042],   // 下蹲蓄力
    [0.2, merge(both({ LeftUpLeg: [-5, 0, 0], LeftLeg: [8, 0, 0], LeftFoot: [32, 0, 0], LeftArm: [-72, 0, 34], LeftForeArm: [-24, 0, 0] }), { Spine: [-4, 0, 0], Head: [-6, 0, 0] }), 0.012],   // 蹬地伸展
    [0.32, AIR, 0]
  ]));
  DEFS.jumpAir = Object.assign({ dur: 1, loop: true }, poseKeys([
    [0, AIR, 0],
    [0.5, merge(AIR, { LeftUpLeg: [-24, 0, 0], RightUpLeg: [-16, 0, 0], LeftArm: [-34, 0, 58], RightArm: [-34, 0, -58] }), 0],
    [1, AIR, 0]
  ]));
  DEFS.jumpLand = Object.assign({ dur: 0.36, loop: false }, poseKeys([
    [0, AIR, 0],
    [0.07, merge(CROUCH, both({ LeftArm: [-24, 0, 28], LeftForeArm: [-26, 0, 0] }), { Spine: [16, 0, 0], Head: [-6, 0, 0] }), -0.04],   // 落地膝蓋微彎
    [0.36, {}, 0]
  ]));

  DEFS.turn = {
    dur: 0.7, loop: true,
    keys: cycle({ LeftUpLeg: [[0, 0, 0, 0], [0.17, -18, 0, 0], [0.35, 0, 0, 0]], LeftLeg: [[0, 0, 0, 0], [0.17, 32, 0, 0], [0.35, 0, 0, 0]], LeftFoot: [[0, 0, 0, 0], [0.17, -6, 0, 0], [0.35, 0, 0, 0]], LeftArm: [[0, 4, 0, 2], [0.35, -4, 0, 2]] }, 0.7),
    pos: { Hips: [[0, 0, 0, 0], [0.17, 0, 0.006, 0], [0.35, 0, -0.002, 0], [0.52, 0, 0.006, 0], [0.7, 0, 0, 0]] }
  };

  DEFS.grab = Object.assign({ dur: 1, loop: false }, poseKeys([
    [0, {}, 0],
    [0.42, REACH, -0.035],                                                            // 彎腰、手伸向物品（0.42 手掌接觸）
    [0.56, merge(REACH, both({ LeftForeArm: [-22, 0, 0], LeftHand: [-2, 0, 0] })), -0.035],   // 握住
    [0.8, merge(both({ LeftUpLeg: [-8, 0, 0], LeftLeg: [14, 0, 0], LeftFoot: [-6, 0, 0] }), CARRY_ARMS, { Spine: [8, 0, 0], Head: [-6, 0, 0] }), -0.01],
    [1, merge(CARRY_ARMS, { Spine: [-3, 0, 0] }), 0]
  ]));
  DEFS.release = Object.assign({ dur: 0.9, loop: false }, poseKeys([
    [0, merge(CARRY_ARMS, { Spine: [-3, 0, 0] }), 0],
    [0.4, merge(REACH, both({ LeftArm: [-70, 0, -6], LeftForeArm: [-16, 0, 0] })), -0.035],   // 手臂向前伸、物品放下（0.45 放開）
    [0.56, merge(REACH, both({ LeftArm: [-64, 0, 4], LeftForeArm: [-10, 0, 0], LeftHand: [4, 0, 0] })), -0.03],
    [0.9, {}, 0]
  ]));

  DEFS.celebrate = Object.assign({ dur: 1.7, loop: false }, poseKeys([
    [0, {}, 0],
    [0.14, merge(both({ LeftUpLeg: [-25, 0, 0], LeftLeg: [50, 0, 0], LeftFoot: [-20, 0, 0], LeftArm: [20, 0, 6] }), { Spine: [10, 0, 0] }), -0.035],
    [0.3, merge(both({ LeftUpLeg: [-6, 0, 0], LeftLeg: [12, 0, 0], LeftFoot: [26, 0, 0], LeftArm: [-10, 0, 150], LeftForeArm: [-16, 0, 0] }), { Spine: [-8, 0, 0], Head: [-15, 0, 0] }), 0.09],   // 雙手舉起跳起
    [0.45, merge(both({ LeftUpLeg: [-26, 0, 0], LeftLeg: [46, 0, 0], LeftFoot: [10, 0, 0], LeftArm: [-8, 0, 158], LeftForeArm: [-12, 0, 0] }), { Spine: [-6, 0, 0], Head: [-14, 0, 0] }), 0.11],
    [0.6, merge(both({ LeftUpLeg: [-22, 0, 0], LeftLeg: [42, 0, 0], LeftFoot: [-18, 0, 0], LeftArm: [-6, 0, 150], LeftForeArm: [-20, 0, 0] }), { Spine: [6, 0, 0], Head: [-6, 0, 0] }), -0.03],
    [0.78, merge(both({ LeftUpLeg: [-8, 0, 0], LeftLeg: [15, 0, 0], LeftFoot: [12, 0, 0] }), { LeftArm: [-4, 0, 166], RightArm: [-4, 0, -146], LeftForeArm: [-10, 0, 0], RightForeArm: [-26, 0, 0], Head: [-10, 0, 8], Spine: [-5, 0, 3] }), 0.05],
    [0.96, merge({ LeftArm: [-4, 0, 146], RightArm: [-4, 0, -166], LeftForeArm: [-26, 0, 0], RightForeArm: [-10, 0, 0], Head: [-8, 0, -8], Spine: [-3, 0, -3] }), 0],
    [1.16, merge(both({ LeftArm: [-6, 0, 154], LeftForeArm: [-16, 0, 0] }), { Head: [-6, 0, 0], Spine: [-3, 0, 0] }), 0],
    [1.45, merge(both({ LeftArm: [0, 0, 22], LeftForeArm: [-8, 0, 0] })), 0],
    [1.7, {}, 0]
  ]));

  DEFS.carryArms = { dur: 2, loop: true, only: ARM_BONES, keys: (function () {
    var k = {}; Object.keys(CARRY_ARMS).forEach(function (b) { var v = CARRY_ARMS[b]; k[b] = [[0, v[0], v[1], v[2]], [1, v[0] - 2, v[1], v[2]], [2, v[0], v[1], v[2]]]; }); return k;
  })() };

  /* ---------- 曲線補間 → 取樣 ---------- */
  function sampler(keys, dur, loop) {
    var n = keys.length;
    var times = keys.map(function (k) { return k[0]; });
    return function (t, c) {
      if (n === 1) return keys[0][c];
      if (t <= times[0]) return keys[0][c];
      if (t >= times[n - 1]) return keys[n - 1][c];
      var i = 0; while (i < n - 2 && t > times[i + 1]) i++;
      var t0 = times[i], t1 = times[i + 1], h = t1 - t0, u = (t - t0) / h;
      var p0 = keys[i][c], p1 = keys[i + 1][c];
      function slope(j) {
        var a = j - 1, b = j + 1, ta, tb, pa, pb;
        if (a < 0) { if (!loop) return 0; a = n - 2; ta = times[a] - dur; } else ta = times[a];
        if (b > n - 1) { if (!loop) return 0; b = 1; tb = times[b] + dur; } else tb = times[b];
        pa = keys[a][c]; pb = keys[b][c];
        return (pb - pa) / (tb - ta);
      }
      var m0 = slope(i) * h, m1 = slope(i + 1) * h;
      var u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
    };
  }

  /**
   * 把「角色座標下的相對旋轉 D」換算成骨頭的 local 旋轉。
   * 程式角色的骨頭座標本來就對齊角色座標，直接 rest * D；
   * 匯入的 .glb（retarget）骨頭座標各自不同，改用 rest * (Rw⁻¹ · D · Rw)，Rw 為骨頭站姿在角色座標的方向。
   */
  function poseQuat(rig, b, D, out) {
    var r = rig.rest[b];
    if (!rig.retarget) return out.copy(r.q).multiply(D);
    var Rw = r.world, t = Rw.clone().invert().multiply(D).multiply(Rw);
    return out.copy(r.q).multiply(t);
  }

  function build(rig, opts) {
    var THREE = rig.THREE, FPS = (opts && opts.fps) || 30, D2R = Math.PI / 180;
    var e = new THREE.Euler(), q = new THREE.Quaternion(), qq = new THREE.Quaternion(), hv3 = new THREE.Vector3();
    var clips = {}, stride = {};
    Object.keys(DEFS).forEach(function (name) {
      var d = DEFS[name], dur = d.dur, tracks = [];
      var frames = Math.max(2, Math.round(dur * FPS) + 1);
      var times = new Float32Array(frames);
      for (var f = 0; f < frames; f++) times[f] = Math.min(dur, f / FPS);
      times[frames - 1] = dur;
      var bones = (d.only || rig.boneNames).filter(function (b) { return !!rig.rest[b]; });
      bones.forEach(function (b) {
        var k = d.keys[b], rest = rig.rest[b].q;
        var vals = new Float32Array(frames * 4);
        var s = k ? sampler(k, dur, d.loop) : null;
        for (var f2 = 0; f2 < frames; f2++) {
          var t = times[f2];
          if (s) e.set(s(t, 1) * D2R, s(t, 2) * D2R, s(t, 3) * D2R, "XYZ"); else e.set(0, 0, 0);
          qq.setFromEuler(e); poseQuat(rig, b, qq, q);
          q.toArray(vals, f2 * 4);
        }
        tracks.push(new THREE.QuaternionKeyframeTrack(rig.prefix + b + ".quaternion", times, vals));
      });
      if (!d.only) {
        var hk = d.pos && d.pos.Hips, hr = rig.rest.Hips.p, hv = new Float32Array(frames * 3), hs = hk ? sampler(hk, dur, d.loop) : null;
        for (var f3 = 0; f3 < frames; f3++) {
          var t3 = times[f3];
          hv3.set(hs ? hs(t3, 1) : 0, hs ? hs(t3, 2) : 0, hs ? hs(t3, 3) : 0);
          if (rig.retarget && rig.rest.Hips.parentInv) hv3.applyMatrix3(rig.rest.Hips.parentInv);   // 角色座標位移 → 骨架座標
          hv[f3 * 3] = hr.x + hv3.x; hv[f3 * 3 + 1] = hr.y + hv3.y; hv[f3 * 3 + 2] = hr.z + hv3.z;
        }
        tracks.push(new THREE.VectorKeyframeTrack(rig.prefix + "Hips.position", times, hv));
      }
      clips[name] = new THREE.AnimationClip(name, dur, tracks);
      if (!d.only) clips[name + "_noArms"] = new THREE.AnimationClip(name + "_noArms", dur, tracks.filter(function (tr) {
        return !ARM_BONES.some(function (b) { return tr.name === rig.prefix + b + ".quaternion"; });
      }));
      if (d.stride) stride[name] = d.stride;
    });
    // 眨眼層：只控制眼睛縮放，任何狀態都會自然眨眼（模型沒有獨立眼睛時不做）
    if (!rig.eyes || !rig.eyes.length || !rig.eyes[0]) { clips.blink = new THREE.AnimationClip("blink", 4.4, []); return { clips: clips, stride: stride, armBones: ARM_BONES }; }
    clips.blink = new THREE.AnimationClip("blink", 4.4, [
      new THREE.VectorKeyframeTrack("EyeL.scale", [0, 2.0, 2.06, 2.14, 3.5, 3.56, 3.64, 4.4], [1, 1, 1, 1, 1, 1, 1, 0.08, 1, 1, 1, 1, 1, 1, 1, 1, 0.08, 1, 1, 1, 1, 1, 1, 1]),
      new THREE.VectorKeyframeTrack("EyeR.scale", [0, 2.0, 2.06, 2.14, 3.5, 3.56, 3.64, 4.4], [1, 1, 1, 1, 1, 1, 1, 0.08, 1, 1, 1, 1, 1, 1, 1, 1, 0.08, 1, 1, 1, 1, 1, 1, 1])
    ]);
    return { clips: clips, stride: stride, armBones: ARM_BONES };
  }

  /** 計算抱持姿勢下雙手中點，作為物品的掛載點（掛在右手上，物品會跟著手部移動） */
  function carrySocket(rig) {
    var THREE = rig.THREE, B = rig.bones, D2R = Math.PI / 180, saved = {};
    Object.keys(CARRY_ARMS).forEach(function (b) {
      if (!B[b] || !rig.rest[b]) return;
      saved[b] = B[b].quaternion.clone();
      var v = CARRY_ARMS[b];
      poseQuat(rig, b, new THREE.Quaternion().setFromEuler(new THREE.Euler(v[0] * D2R, v[1] * D2R, v[2] * D2R)), B[b].quaternion);
    });
    rig.root.updateMatrixWorld(true);
    var l = new THREE.Vector3(), r = new THREE.Vector3();
    if (rig.retarget) { B.LeftHand.getWorldPosition(l); B.RightHand.getWorldPosition(r); }
    else { B.LeftHand.localToWorld(l.set(0, -0.035, 0.01)); B.RightHand.localToWorld(r.set(0, -0.035, 0.01)); }
    var mid = l.clone().add(r).multiplyScalar(0.5);
    var socket = new THREE.Object3D(); socket.name = "HandSocket";
    B.RightHand.add(socket);
    B.RightHand.worldToLocal(mid); socket.position.copy(mid);
    // 讓 socket 在抱持姿勢下保持「正立、面向角色前方」，物品掛上去就不會歪斜
    var qHand = new THREE.Quaternion(), qRoot = new THREE.Quaternion();
    B.RightHand.getWorldQuaternion(qHand); rig.root.getWorldQuaternion(qRoot);
    socket.quaternion.copy(qHand.invert().multiply(qRoot));
    var handGap = l.distanceTo(r);
    Object.keys(saved).forEach(function (b) { B[b].quaternion.copy(saved[b]); });
    rig.root.updateMatrixWorld(true);
    rig.sockets.hand = socket; rig.handGap = handGap;
    return socket;
  }

  NS.AnimationLibrary = { build: build, carrySocket: carrySocket, DEFS: DEFS, ARM_BONES: ARM_BONES };
})(window);
