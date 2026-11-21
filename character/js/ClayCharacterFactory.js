/*!
 * ClayCharacterFactory — 黏土公仔質感 Q 版角色（程式建模＋真實骨架）
 *
 * 目前專案沒有角色的 3D 模型檔，所以這裡依照四視角設定圖，用 Three.js 程式組出男、女背包客，
 * 外觀「接近」設定圖但不是原圖本身。每個部位都是剛性網格，掛在命名一致的骨頭上：
 *   mixamorigHips / Spine / Spine1 / Neck / Head / Left|Right Shoulder, Arm, ForeArm, Hand / UpLeg, Leg, Foot
 * 骨頭名稱與 Mixamo 標準相同，動畫（AnimationClip）只認骨頭名稱，
 * 之後換成正式的綁骨 .glb 模型時，同一套動畫與控制系統可以直接沿用（見 README 的素材需求）。
 *
 * 因為每個部位都是硬殼零件跟著骨頭轉，不會有網格拉伸，所以動作中不會變形、五官不會位移、比例固定。
 * 換裝：create(THREE, spec) 傳入不同顏色或髮型即可，動畫不受影響。
 */
(function (w) {
  "use strict";
  var NS = w.MFChar;

  var PRESETS = {
    boy: {
      name: "男生背包客", hair: "short", skin: 0xf2c9a5, cheek: 0xf3a6a0, hairColor: 0x8a5a3c, eye: 0x4a2f22,
      jacket: 0xa9c08a, jacketDark: 0x92aa74, inner: 0xf1e8d6, pants: 0x8a6a52, cuffs: true, socks: 0xf0e6d2,
      boots: 0xb98a5e, sole: 0x6e4a32, pack: 0x8b5a3a, packDark: 0x6f452b, roll: 0xc69a6e, strap: 0x7a4a2e, hoodie: false
    },
    girl: {
      name: "女生背包客", hair: "long", skin: 0xf2c9a5, cheek: 0xf2a39d, hairColor: 0x8d5d40, eye: 0x4a2f22,
      jacket: 0xa9c08a, jacketDark: 0x92aa74, inner: 0x8f6a50, pants: 0x86664f, cuffs: false, socks: null,
      boots: 0xb98a5e, sole: 0x6e4a32, pack: 0x8b5a3a, packDark: 0x6f452b, roll: 0xc69a6e, strap: 0x7a4a2e, hoodie: true
    }
  };
  // 換裝範例：只改顏色，骨架與動畫完全共用
  var OUTFITS = {
    forest: {},
    sky: { jacket: 0x9cc3d8, jacketDark: 0x83abc2, pants: 0x5d6f86, pack: 0x6c7f95, packDark: 0x55657a, strap: 0x4e5d70 },
    sunset: { jacket: 0xe8a57f, jacketDark: 0xd38e69, pants: 0x7a5a4c, inner: 0xfff3dc, pack: 0x9a5f45, packDark: 0x7d4a35 }
  };

  var BONES = ["Hips", "Spine", "Spine1", "Neck", "Head",
    "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot"];
  var PREFIX = "mixamorig";

  var noiseTex = null;
  function clayNoise(THREE) {
    if (noiseTex) return noiseTex;
    var c = w.document.createElement("canvas"); c.width = c.height = 128;
    var g = c.getContext("2d"), img = g.createImageData(128, 128);
    for (var i = 0; i < img.data.length; i += 4) { var v = 118 + Math.random() * 20; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    g.globalAlpha = 0.25; g.filter = "blur(1.2px)"; g.drawImage(c, 0, 0);       // 輕微模糊：黏土指紋般的細紋
    noiseTex = new THREE.CanvasTexture(c);
    noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping; noiseTex.repeat.set(3, 3);
    return noiseTex;
  }

  function create(THREE, spec) {
    if (typeof spec === "string") spec = PRESETS[spec];
    spec = Object.assign({}, PRESETS.boy, spec || {});
    var mats = {};
    function mat(hex, opts) {
      var k = hex + JSON.stringify(opts || {});
      if (!mats[k]) mats[k] = new THREE.MeshStandardMaterial(Object.assign({
        color: new THREE.Color(hex).convertSRGBToLinear(), roughness: 0.82, metalness: 0, bumpMap: clayNoise(THREE), bumpScale: 0.012,
        emissive: new THREE.Color(hex).convertSRGBToLinear().multiplyScalar(0.05)
      }, opts || {}));
      return mats[k];
    }
    var geos = [];
    function track(g) { geos.push(g); return g; }
    function mesh(geo, m, parent, x, y, z, sx, sy, sz, rx, ry, rz) {
      var o = new THREE.Mesh(track(geo), m);
      o.position.set(x || 0, y || 0, z || 0);
      o.scale.set(sx || 1, sy || sx || 1, sz || sx || 1);
      o.rotation.set(rx || 0, ry || 0, rz || 0);
      o.castShadow = true; o.receiveShadow = true;
      parent.add(o); return o;
    }
    function sphere(r, seg) { return new THREE.SphereGeometry(r, seg || 24, Math.round((seg || 24) * 0.75)); }
    function capsule(r, len, seg) {                                      // r128 沒有 CapsuleGeometry，用車床旋轉做
      var pts = [], n = 8, i, a;
      for (i = 0; i <= n; i++) { a = -Math.PI / 2 + Math.PI / 2 * i / n; pts.push(new THREE.Vector2(Math.cos(a) * r + 1e-4, Math.sin(a) * r - len / 2)); }
      for (i = 0; i <= n; i++) { a = Math.PI / 2 * i / n; pts.push(new THREE.Vector2(Math.cos(a) * r + 1e-4, Math.sin(a) * r + len / 2)); }
      return new THREE.LatheGeometry(pts, seg || 18);
    }
    function lathe(profile, seg) { return new THREE.LatheGeometry(profile.map(function (p) { return new THREE.Vector2(p[0] + 1e-4, p[1]); }), seg || 28); }
    function rbox(wd, ht, dp, r) {                                       // 圓角方塊
      r = Math.min(r, wd / 2 - 1e-3, ht / 2 - 1e-3, dp / 2 - 1e-3);
      var s = new THREE.Shape(), x = -wd / 2 + r, y = -ht / 2 + r, W = wd - 2 * r, H = ht - 2 * r;
      s.moveTo(x, y - r); s.lineTo(x + W, y - r); s.quadraticCurveTo(x + W + r, y - r, x + W + r, y);
      s.lineTo(x + W + r, y + H); s.quadraticCurveTo(x + W + r, y + H + r, x + W, y + H + r);
      s.lineTo(x, y + H + r); s.quadraticCurveTo(x - r, y + H + r, x - r, y + H); s.lineTo(x - r, y); s.quadraticCurveTo(x - r, y - r, x, y - r);
      var g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-3, dp - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.98, bevelSegments: 4, curveSegments: 6 });
      g.translate(0, 0, -(dp - 2 * r) / 2); g.computeVertexNormals();
      return g;
    }

    /* ---------- 骨架（rest pose：A 字站姿，面向 +Z） ---------- */
    var root = new THREE.Group(); root.name = "ClayCharacter";
    var B = {};
    function bone(name, parent, x, y, z) {
      var b = new THREE.Bone(); b.name = PREFIX + name; b.position.set(x, y, z);
      (parent || root).add(b); B[name] = b; return b;
    }
    bone("Hips", null, 0, 0.34, 0);
    bone("Spine", B.Hips, 0, 0.04, 0);
    bone("Spine1", B.Spine, 0, 0.1, 0);
    bone("Neck", B.Spine1, 0, 0.115, 0);
    bone("Head", B.Neck, 0, 0.035, 0);
    [["Left", 1], ["Right", -1]].forEach(function (sd) {
      var S = sd[0], k = sd[1];
      bone(S + "Shoulder", B.Spine1, 0.05 * k, 0.085, 0);
      bone(S + "Arm", B[S + "Shoulder"], 0.08 * k, -0.005, 0).rotation.z = 0.2 * k;   // A 字手臂
      bone(S + "ForeArm", B[S + "Arm"], 0, -0.13, 0).rotation.x = -0.12;
      bone(S + "Hand", B[S + "ForeArm"], 0, -0.115, 0);
      bone(S + "UpLeg", B.Hips, 0.068 * k, -0.02, 0);
      bone(S + "Leg", B[S + "UpLeg"], 0, -0.14, 0);
      bone(S + "Foot", B[S + "Leg"], 0, -0.112, 0);
    });

    var C = spec;
    var mSkin = mat(C.skin), mHair = mat(C.hairColor, { roughness: 0.9 }), mJacket = mat(C.jacket), mJD = mat(C.jacketDark);
    var mInner = mat(C.inner), mPants = mat(C.pants), mBoot = mat(C.boots), mSole = mat(C.sole), mDark = mat(0x3a2418, { roughness: 0.6 });
    var mPack = mat(C.pack), mPackD = mat(C.packDark), mRoll = mat(C.roll), mStrap = mat(C.strap);
    var mCheek = mat(C.cheek, { transparent: true, opacity: 0.55, bumpMap: null, emissive: new THREE.Color(0) });
    var mEye = new THREE.MeshStandardMaterial({ color: new THREE.Color(C.eye).convertSRGBToLinear(), roughness: 0.35 });

    /* ---------- 身體 ---------- */
    mesh(lathe([[0, -0.07], [0.12, -0.065], [0.142, -0.03], [0.14, 0.03], [0.118, 0.05], [0, 0.055]]), mPants, B.Hips, 0, 0, 0, 1, 1, 0.8);
    var jacket = lathe([[0, -0.145], [0.142, -0.14], [0.152, -0.11], [0.15, -0.02], [0.145, 0.05], [0.13, 0.095], [0.09, 0.118], [0, 0.124]]);
    mesh(jacket, mJacket, B.Spine1, 0, 0, 0, 1, 1, 0.78);
    mesh(rbox(0.07, 0.2, 0.02, 0.008), mInner, B.Spine1, 0, -0.035, 0.112, 1, 1, 1, -0.04);              // 內搭
    [-1, 1].forEach(function (k) {
      mesh(rbox(0.03, 0.22, 0.03, 0.012), mJD, B.Spine1, 0.05 * k, -0.035, 0.11, 1, 1, 1, -0.04, 0, 0.03 * k);   // 外套前襟
    });
    mesh(new THREE.TorusGeometry(0.068, 0.024, 10, 24), C.hoodie ? mJacket : mJD, B.Spine1, 0, 0.11, 0.004, 1, 1, 0.85, Math.PI / 2); // 領口
    if (C.hoodie) {
      mesh(sphere(0.07), mJacket, B.Spine1, 0, 0.12, -0.075, 1.5, 0.75, 0.9);                            // 帽兜
      [-1, 1].forEach(function (k) {
        mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 6), mat(0xf2ecdf), B.Spine1, 0.03 * k, 0.04, 0.122, 1, 1, 1, -0.05);
        mesh(sphere(0.007, 8), mat(0xf2ecdf), B.Spine1, 0.03 * k, 0.003, 0.124);
      });
    }
    mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.05, 14), mSkin, B.Neck, 0, 0.0, 0);

    /* ---------- 手臂 ---------- */
    ["Left", "Right"].forEach(function (S) {
      var k = S === "Left" ? 1 : -1;
      mesh(sphere(0.05), mJacket, B[S + "Arm"], 0, -0.005, 0);                                           // 肩
      mesh(capsule(0.043, 0.09), mJacket, B[S + "Arm"], 0, -0.065, 0);
      mesh(capsule(0.041, 0.075), mJacket, B[S + "ForeArm"], 0, -0.055, 0);
      mesh(new THREE.TorusGeometry(0.038, 0.012, 8, 18), mJD, B[S + "ForeArm"], 0, -0.1, 0, 1, 1, 1, Math.PI / 2);   // 袖口
      mesh(sphere(0.042), mSkin, B[S + "Hand"], 0, -0.035, 0.004, 0.8, 1.12, 0.62);                      // 手掌
      mesh(sphere(0.018), mSkin, B[S + "Hand"], -0.026 * k * -1, -0.024, 0.022, 0.9, 1.3, 0.9, 0.4);     // 拇指
    });

    /* ---------- 腿與靴子 ---------- */
    ["Left", "Right"].forEach(function (S) {
      mesh(capsule(0.06, 0.09), mPants, B[S + "UpLeg"], 0, -0.07, 0);
      mesh(capsule(0.053, 0.07), mPants, B[S + "Leg"], 0, -0.05, 0);
      if (C.cuffs) mesh(new THREE.TorusGeometry(0.052, 0.022, 10, 20), mat(new THREE.Color(C.pants).multiplyScalar(1.08).getHex()), B[S + "Leg"], 0, -0.085, 0, 1, 1, 1, Math.PI / 2);
      if (C.socks) mesh(new THREE.CylinderGeometry(0.042, 0.044, 0.035, 14), mat(C.socks), B[S + "Foot"], 0, 0.012, 0);
      mesh(rbox(0.1, 0.075, 0.155, 0.032), mBoot, B[S + "Foot"], 0, -0.03, 0.028);
      mesh(rbox(0.106, 0.018, 0.162, 0.008), mSole, B[S + "Foot"], 0, -0.062, 0.028);
      for (var i = 0; i < 3; i++) mesh(rbox(0.05, 0.007, 0.012, 0.003), mDark, B[S + "Foot"], 0, 0.002 - i * 0.012, 0.072 + i * 0.012, 1, 1, 1, -0.75);   // 鞋帶
    });

    /* ---------- 頭部與五官 ---------- */
    var R = 0.19, HX = R * 1.05, HY = R * 0.98, HZ = R * 0.95, HC = 0.17;
    mesh(sphere(R, 40), mSkin, B.Head, 0, HC, 0, 1.05, 0.98, 0.95);
    function onFace(x, y, push) {                                           // 讓五官貼合臉部曲面
      var dy = y - HC, t = 1 - (x / HX) * (x / HX) - (dy / HY) * (dy / HY);
      return HZ * Math.sqrt(Math.max(0, t)) + (push || 0);
    }
    [-1, 1].forEach(function (k) {
      var ex = 0.066 * k, ey = 0.16;
      var eye = new THREE.Group(); eye.name = (k > 0 ? "EyeL" : "EyeR"); eye.position.set(ex, ey, onFace(ex, ey, -0.004)); B.Head.add(eye);
      var em = mesh(sphere(0.019, 14), mEye, eye, 0, 0, 0, 0.82, 1.18, 0.5); em.castShadow = false;
      mesh(capsule(0.0065, 0.034, 8), mHair, B.Head, 0.07 * k, 0.215, onFace(0.07 * k, 0.215, 0.002), 1, 1, 0.7, 0, 0, Math.PI / 2 + 0.12 * k);   // 眉毛
      mesh(sphere(0.03, 14), mCheek, B.Head, 0.108 * k, 0.11, onFace(0.108 * k, 0.11, -0.012), 1.1, 0.7, 0.35).castShadow = false;           // 腮紅
      mesh(sphere(0.042), mSkin, B.Head, 0.196 * k, 0.15, -0.005, 0.55, 1, 0.8);                                                              // 耳朵
    });
    mesh(sphere(0.022, 14), mat(new THREE.Color(C.skin).multiplyScalar(0.97).getHex()), B.Head, 0, 0.128, onFace(0, 0.128, -0.006), 1, 0.9, 1);   // 鼻子
    mesh(new THREE.TorusGeometry(0.021, 0.0048, 6, 16, Math.PI * 0.75), mDark, B.Head, 0, 0.097, onFace(0, 0.097, -0.002), 1, 1, 0.6, 0, 0, Math.PI + Math.PI * 0.125);   // 微笑

    /* ---------- 頭髮 ---------- */
    var cap = new THREE.SphereGeometry(R * 1.08, 36, 24, 0, Math.PI * 2, 0, C.hair === "long" ? 2.05 : 1.95);
    mesh(cap, mHair, B.Head, 0, HC + 0.006, -0.008, 1.06, 1.0, 1.0, -0.62);
    if (C.hair === "short") {
      mesh(sphere(0.07), mHair, B.Head, 0.035, 0.345, 0.07, 1.6, 0.8, 1.15, 0.35, 0, -0.35);           // 前額蓬鬆的頭髮
      mesh(sphere(0.06), mHair, B.Head, -0.05, 0.33, 0.085, 1.4, 0.75, 1.0, 0.5, 0, 0.25);
      mesh(sphere(0.05), mHair, B.Head, 0.11, 0.33, 0.035, 1.2, 0.75, 1.0, 0.2, 0, -0.7);
      mesh(sphere(0.045), mHair, B.Head, -0.12, 0.24, 0.06, 0.8, 1.6, 0.9, 0.2, 0, 0.25);              // 鬢角
      mesh(sphere(0.045), mHair, B.Head, 0.125, 0.24, 0.05, 0.8, 1.6, 0.9, 0.2, 0, -0.25);
      mesh(sphere(0.07), mHair, B.Head, 0, 0.16, -0.14, 1.9, 1.5, 0.9);                                  // 後腦
    } else {
      mesh(sphere(0.06), mHair, B.Head, -0.06, 0.29, 0.12, 1.5, 0.65, 0.8, 0.6, 0, 0.35);               // 瀏海
      mesh(sphere(0.06), mHair, B.Head, 0.055, 0.285, 0.125, 1.5, 0.6, 0.8, 0.6, 0, -0.45);
      mesh(sphere(0.05), mHair, B.Head, 0.14, 0.21, 0.08, 0.7, 1.9, 0.9, 0.15, 0, -0.18);               // 兩側
      mesh(sphere(0.05), mHair, B.Head, -0.14, 0.21, 0.08, 0.7, 1.9, 0.9, 0.15, 0, 0.18);
      mesh(sphere(0.1), mHair, B.Head, 0, 0.07, -0.1, 1.95, 1.75, 0.95);                                 // 後方長髮
      mesh(sphere(0.06), mHair, B.Head, 0.15, 0.04, -0.03, 0.9, 1.8, 1.1, 0, 0, -0.12);
      mesh(sphere(0.06), mHair, B.Head, -0.15, 0.04, -0.03, 0.9, 1.8, 1.1, 0, 0, 0.12);
    }

    /* ---------- 背包 ---------- */
    if (C.pack !== null) {
      var P = new THREE.Group(); P.name = "Backpack"; P.position.set(0, -0.01, -0.105); B.Spine1.add(P);
      mesh(rbox(0.25, 0.29, 0.13, 0.05), mPack, P, 0, -0.02, -0.065);
      mesh(rbox(0.16, 0.095, 0.045, 0.02), mPackD, P, 0, -0.085, -0.135);                               // 前口袋
      mesh(rbox(0.17, 0.05, 0.03, 0.012), mPack, P, 0, -0.035, -0.14, 1, 1, 1, 0.15);                    // 口袋蓋
      [-1, 1].forEach(function (k) {
        mesh(rbox(0.05, 0.11, 0.08, 0.02), mPackD, P, 0.135 * k, -0.07, -0.06);                         // 側袋
        mesh(rbox(0.022, 0.15, 0.012, 0.005), mStrap, P, 0.045 * k, 0.04, -0.132);                       // 前方扣帶
        mesh(rbox(0.026, 0.02, 0.008, 0.003), mat(0xc79d5b, { metalness: 0.3, roughness: 0.5 }), P, 0.045 * k, 0.0, -0.138);
        // 肩帶：繞過肩膀到胸前
        var st = mesh(new THREE.TorusGeometry(0.085, 0.013, 8, 20, Math.PI * 1.15), mStrap, B.Spine1, 0.085 * k, 0.03, 0.0, 1, 1.15, 1.25, 0, Math.PI / 2, Math.PI * 0.5 - 0.1);
        st.scale.set(1, 1.2, 1);
      });
      var roll = new THREE.Group(); roll.position.set(0, 0.155, -0.07); P.add(roll);
      mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.3, 24), mRoll, roll, 0, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2);
      [-1, 1].forEach(function (k) {
        mesh(new THREE.TorusGeometry(0.034, 0.008, 8, 20), mat(new THREE.Color(C.roll).multiplyScalar(0.88).getHex()), roll, 0.151 * k, 0, 0, 1, 1, 1, 0, Math.PI / 2);
        mesh(new THREE.TorusGeometry(0.016, 0.006, 8, 16), mat(new THREE.Color(C.roll).multiplyScalar(0.88).getHex()), roll, 0.152 * k, 0, 0, 1, 1, 1, 0, Math.PI / 2);
        mesh(new THREE.TorusGeometry(0.06, 0.009, 8, 24), mStrap, roll, 0.085 * k, 0, 0, 1, 1, 1, 0, Math.PI / 2);   // 捆帶
      });
    }

    /* ---------- 骨架登記與 socket ---------- */
    root.updateMatrixWorld(true);
    var rest = {};
    BONES.forEach(function (n) { rest[n] = { q: B[n].quaternion.clone(), p: B[n].position.clone() }; });
    var rig = {
      THREE: THREE, root: root, bones: B, rest: rest, boneNames: BONES, prefix: PREFIX, spec: spec,
      eyes: [B.Head.getObjectByName("EyeL"), B.Head.getObjectByName("EyeR")],
      sockets: {},
      dispose: function () { geos.forEach(function (g) { g.dispose(); }); Object.keys(mats).forEach(function (k) { mats[k].dispose(); }); mEye.dispose(); }
    };
    return rig;
  }

  NS.ClayCharacterFactory = { create: create, PRESETS: PRESETS, OUTFITS: OUTFITS, BONES: BONES, PREFIX: PREFIX };
})(window);
