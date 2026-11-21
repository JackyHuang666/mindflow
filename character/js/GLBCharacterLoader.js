/*!
 * GLBCharacterLoader — 讀取綁好骨架的 .glb 角色（Tripo／Meshy／Mixamo 等），轉成與程式角色相同的 rig 結構
 *
 *   MFChar.GLBCharacterLoader.load(THREE, "models/boy.glb", { height: 1 }).then(function (rig) {
 *     player.setCharacter({ rig: rig });
 *   });
 *
 * 做的事：
 *   1. 找出人形骨頭（支援 mixamorig:Hips、mixamorigHips、Hips 等命名），統一改成 mixamorigXXX
 *   2. 把角色縮放到指定身高、腳底貼齊地面、面向 +Z
 *   3. 站姿校正：T-pose 的手臂轉成和程式角色相同的 A 字站姿，動畫才能共用
 *   4. 記錄每根骨頭的站姿（rest），AnimationLibrary 會把動作換算到這副骨架的骨頭座標
 * 需要 THREE.GLTFLoader（three r128 examples/js/loaders/GLTFLoader.js）。
 */
(function (w) {
  "use strict";
  var NS = w.MFChar;
  var NAMES = NS.ClayCharacterFactory.BONES;      // 標準骨頭名稱（不含 mixamorig 前綴）
  var ALIAS = { Spine1: ["Spine1", "Spine2", "Chest", "UpperChest"], Neck: ["Neck", "Neck1"] };

  function findBones(root) {
    var all = {};
    root.traverse(function (o) { if (o.isBone) all[o.name] = o; });
    var map = {};
    var norm = function (n) { return n.replace(/^mixamorig[:_]?/i, "").replace(/^.*[:|]/, "").replace(/[\s_.-]/g, "").toLowerCase(); };
    var byNorm = {};
    Object.keys(all).forEach(function (n) { byNorm[norm(n)] = all[n]; });
    NAMES.forEach(function (n) {
      var cands = ALIAS[n] || [n];
      for (var i = 0; i < cands.length; i++) { var b = byNorm[cands[i].toLowerCase()]; if (b && Object.values(map).indexOf(b) < 0) { map[n] = b; break; } }
    });
    return map;
  }

  /** 讓一根骨頭（往子骨頭的方向）轉到指定方向（角色座標），子骨頭跟著轉 */
  function aim(THREE, root, bone, child, dir) {
    root.updateMatrixWorld(true);
    var a = new THREE.Vector3(), b = new THREE.Vector3();
    bone.getWorldPosition(a); child.getWorldPosition(b);
    var inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    a.applyMatrix4(inv); b.applyMatrix4(inv);
    var cur = b.sub(a).normalize();
    if (cur.lengthSq() < 1e-8) return;
    var C = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize());   // 角色座標中的修正
    var rootQ = new THREE.Quaternion(); root.getWorldQuaternion(rootQ);
    var Cw = rootQ.clone().multiply(C).multiply(rootQ.clone().invert());               // 轉成世界座標
    var bw = new THREE.Quaternion(); bone.getWorldQuaternion(bw);
    var pw = new THREE.Quaternion(); bone.parent.getWorldQuaternion(pw);
    bone.quaternion.copy(pw.invert().multiply(Cw.multiply(bw)));
  }

  function load(THREE, url, opts) {
    opts = opts || {};
    if (!THREE.GLTFLoader) return Promise.reject(new Error("缺少 THREE.GLTFLoader"));
    return new Promise(function (resolve, reject) {
      new THREE.GLTFLoader().load(url, function (gltf) {
        try { resolve(build(THREE, gltf, opts)); } catch (e) { reject(e); }
      }, opts.onProgress, reject);
    });
  }

  function build(THREE, gltf, opts) {
    var model = gltf.scene;
    var root = new THREE.Group(); root.name = "GLBCharacter";
    var holder = new THREE.Group(); holder.add(model); root.add(holder);
    var B = findBones(model);
    if (!B.Hips) throw new Error("模型沒有人形骨架（找不到 Hips）");
    NAMES.forEach(function (n) { if (B[n]) B[n].name = "mixamorig" + n; });

    // 面向：以左右手的位置判斷，讓角色面向 +Z（左手在 +X）
    root.updateMatrixWorld(true);
    if (B.LeftArm && B.RightArm) {
      var l = new THREE.Vector3(), r = new THREE.Vector3(); B.LeftArm.getWorldPosition(l); B.RightArm.getWorldPosition(r);
      var side = l.sub(r); side.y = 0;
      if (side.lengthSq() > 1e-8) holder.rotation.y = -Math.atan2(-side.z, side.x);
    }
    if (opts.yaw) holder.rotation.y += opts.yaw;
    root.updateMatrixWorld(true);

    // 縮放到指定身高、腳底貼地、置中
    var box = new THREE.Box3().setFromObject(model);
    var size = box.getSize(new THREE.Vector3());
    var s = (opts.height || 1) / Math.max(1e-6, size.y);
    holder.scale.setScalar(s);
    root.updateMatrixWorld(true);
    box.setFromObject(model);
    var c = box.getCenter(new THREE.Vector3());
    holder.position.set(-c.x, -box.min.y, -c.z);
    root.updateMatrixWorld(true);

    // 站姿校正：手臂往下（與程式角色一致的 A 字站姿），前臂、腿保持直線
    if (opts.normalizePose !== false) {
      [["Left", 1], ["Right", -1]].forEach(function (sd) {
        var S = sd[0], k = sd[1];
        var arm = opts.armAngle != null ? opts.armAngle : 0.2;          // 手臂張開角度（弧度），設定圖約 0.35
        if (B[S + "Arm"] && B[S + "ForeArm"]) aim(THREE, root, B[S + "Arm"], B[S + "ForeArm"], new THREE.Vector3(Math.sin(arm) * k, -Math.cos(arm), 0));
        if (B[S + "ForeArm"] && B[S + "Hand"]) aim(THREE, root, B[S + "ForeArm"], B[S + "Hand"], new THREE.Vector3(Math.sin(arm + 0.08) * k, -Math.cos(arm + 0.08), 0.1));
        if (B[S + "UpLeg"] && B[S + "Leg"]) aim(THREE, root, B[S + "UpLeg"], B[S + "Leg"], new THREE.Vector3(0, -1, 0));
        if (B[S + "Leg"] && B[S + "Foot"]) aim(THREE, root, B[S + "Leg"], B[S + "Foot"], new THREE.Vector3(0, -1, 0));
      });
      root.updateMatrixWorld(true);
    }

    // Q 版比例微調：頭放大、大腿縮短（腳掌反向補償，靴子不變形），再把整個角色往下貼回地面
    if (opts.headScale && B.Head) B.Head.scale.setScalar(opts.headScale);
    if (opts.legScale && opts.legScale !== 1) {
      var drop = 0;
      ["Left", "Right"].forEach(function (S) {
        var up = B[S + "UpLeg"], lg = B[S + "Leg"], ft = B[S + "Foot"];
        if (!up || !lg) return;
        var a = new THREE.Vector3(), b = new THREE.Vector3(); up.getWorldPosition(a); lg.getWorldPosition(b);
        drop = Math.max(drop, a.distanceTo(b) * (1 - opts.legScale));
        up.scale.set(1, opts.legScale, 1);
        if (ft) ft.scale.set(1, 1 / opts.legScale, 1);
      });
      holder.position.y -= drop;
    }
    root.updateMatrixWorld(true);

    var meshes = [];
    model.traverse(function (o) {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; meshes.push(o);
        if (o.isSkinnedMesh) o.frustumCulled = false;           // 骨架動畫會超出原本的包圍盒
        var ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(function (m) {
          if (!m) return;
          if (m.map) m.map.anisotropy = 4;
          if (opts.clay !== false && "roughness" in m) {
            // 黏土公仔質感：霧面、不帶金屬反光（AI 貼圖的金屬度會讓手、靴子出現灰斑）
            m.metalness = 0; m.metalnessMap = null;
            m.roughness = opts.roughness != null ? opts.roughness : 0.78; m.roughnessMap = null;
            if (m.normalScale) m.normalScale.set(0.7, 0.7);
            m.needsUpdate = true;
          }
        });
      }
    });

    // 站姿紀錄：local 站姿、相對角色根節點的世界站姿（動作換算用）
    var rest = {}, names = [];
    var rootQ = new THREE.Quaternion(); root.getWorldQuaternion(rootQ); var rootQi = rootQ.clone().invert();
    NAMES.forEach(function (n) {
      var b = B[n]; if (!b) return;
      names.push(n);
      var wq = new THREE.Quaternion(); b.getWorldQuaternion(wq);
      var pwm = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(b.parent.matrixWorld);   // 父骨頭 → 角色座標
      rest[n] = { q: b.quaternion.clone(), p: b.position.clone(), world: rootQi.clone().multiply(wq), parentInv: new THREE.Matrix3().setFromMatrix4(pwm).invert() };
    });

    return {
      THREE: THREE, root: root, bones: B, rest: rest, boneNames: names, prefix: "mixamorig", spec: { name: opts.name || "AI 模型", glb: true },
      retarget: true, eyes: [], sockets: {}, meshes: meshes, gltf: gltf,
      dispose: function () {
        model.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          var ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
          ms.forEach(function (m) { Object.keys(m).forEach(function (k) { if (m[k] && m[k].isTexture) m[k].dispose(); }); m.dispose(); });
        });
      }
    };
  }

  NS.GLBCharacterLoader = { load: load, build: build, findBones: findBones };
})(window);
