/*!
 * CharacterController — 人物移動控制（角色移動狀態）
 * 只負責物理：位置、速度、加減速、轉向、重力、跳躍階段、碰撞。不碰動畫，也不碰物品。
 * 全部以 deltaTime 計算，30 FPS 與 60 FPS 的移動距離、跳躍高度一致。
 * 座標：Y 軸向上，地面在 XZ 平面；yaw = 0 時角色面向 +Z。
 */
(function (w) {
  "use strict";
  var NS = w.MFChar, M = NS.math;

  var DEFAULTS = {
    walkSpeed: 1.25,        // m/s（角色身高約 1m 的 Q 版比例）
    runSpeed: 3.1,
    carrySpeedScale: 0.82,  // 持有物品時的速度倍率（再乘上物品重量影響）
    accel: 9,               // 加速度 m/s²
    decel: 14,              // 減速度 m/s²
    airControl: 0.6,        // 空中可控程度
    turnRate: 13,           // 轉向平滑度
    gravity: 24,
    jumpHeight: 0.75,       // 跳躍高度（m），可調整
    jumpWindup: 0.1,        // 起跳前下蹲時間（s）
    landRecover: 0.16,      // 落地緩衝（s），期間不能再跳
    radius: 0.24,           // 碰撞半徑
    bounds: 14              // 場地半徑
  };

  function CharacterController(opts) {
    NS.Emitter.call(this);
    this.p = Object.assign({}, DEFAULTS, opts || {});
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.targetYaw = 0;
    this.grounded = true;
    this.jumpPhase = "none";   // none | windup | air | land
    this.phaseT = 0;
    this.moveScale = 1;        // 由狀態機設定（例如抓取時 0）
    this.speedScale = 1;       // 物品重量等外部倍率
    this.sprinting = false;
    this.inputDir = { x: 0, z: 0, mag: 0 };
    this.faceOverride = null;  // 轉身測試用：指定面向
    this.obstacles = [];       // [{x, z, r}]
  }
  CharacterController.prototype = Object.create(NS.Emitter.prototype);

  CharacterController.prototype.speed = function () { return M.len2(this.vel.x, this.vel.z); };

  /** 設定本幀移動意圖（世界座標方向，mag 0..1） */
  CharacterController.prototype.setMoveInput = function (dx, dz, mag, sprint) {
    var l = M.len2(dx, dz);
    this.inputDir.x = l ? dx / l : 0; this.inputDir.z = l ? dz / l : 0;
    this.inputDir.mag = l ? M.clamp(mag, 0, 1) : 0;
    this.sprinting = !!sprint && this.inputDir.mag > 0;
    if (this.inputDir.mag > 0 && this.moveScale > 0) this.faceOverride = null;
  };

  CharacterController.prototype.canJump = function () { return this.grounded && this.jumpPhase === "none"; };

  /** 請求跳躍：只有在地面且不在跳躍流程中才會成功（不可無限連跳） */
  CharacterController.prototype.requestJump = function () {
    if (!this.canJump()) return false;
    this.jumpPhase = "windup"; this.phaseT = 0;
    this.emit("jumpWindup");
    return true;
  };

  CharacterController.prototype.faceTo = function (yaw) { this.faceOverride = yaw; };

  CharacterController.prototype.maxSpeed = function () {
    var p = this.p;
    var base = this.sprinting ? p.runSpeed : p.walkSpeed;
    return base * this.speedScale * this.inputDir.mag;
  };

  CharacterController.prototype.update = function (dt) {
    var p = this.p, v = this.vel;
    this.phaseT += dt;

    /* --- 水平速度：加速／減速 --- */
    var air = !this.grounded || this.jumpPhase === "windup" ? (this.jumpPhase === "windup" ? 0.35 : p.airControl) : 1;
    var top = this.maxSpeed() * this.moveScale;
    var tx = this.inputDir.x * top, tz = this.inputDir.z * top;
    var dvx = tx - v.x, dvz = tz - v.z, dl = M.len2(dvx, dvz);
    if (dl > 1e-5) {
      var speeding = M.len2(tx, tz) >= this.speed() - 1e-3 && top > 0;
      var rate = (speeding ? p.accel : p.decel) * air * dt;
      var k = Math.min(1, rate / dl);
      v.x += dvx * k; v.z += dvz * k;
    }

    /* --- 跳躍流程：下蹲 → 起跳 → 滯空 → 落地緩衝 --- */
    if (this.jumpPhase === "windup" && this.phaseT >= p.jumpWindup) {
      v.y = Math.sqrt(2 * p.gravity * p.jumpHeight);
      this.grounded = false; this.jumpPhase = "air"; this.phaseT = 0;
      this.emit("takeoff");
    }
    if (!this.grounded) {
      this.pos.y += v.y * dt - 0.5 * p.gravity * dt * dt;          // 等加速度解析積分：任何幀率跳躍高度都一樣
      v.y -= p.gravity * dt;
      if (this.pos.y <= 0 && v.y <= 0) {
        this.pos.y = 0; v.y = 0; this.grounded = true;
        this.jumpPhase = "land"; this.phaseT = 0;
        this.emit("land");
      }
    } else if (this.jumpPhase === "land" && this.phaseT >= p.landRecover) {
      this.jumpPhase = "none"; this.phaseT = 0;
      this.emit("recovered");
    }

    /* --- 位置與碰撞 --- */
    this.pos.x += v.x * dt; this.pos.z += v.z * dt;
    this.resolveCollisions();

    /* --- 面向：人物朝向與移動方向一致，平滑轉身（不瞬間切換） --- */
    if (this.faceOverride != null) this.targetYaw = this.faceOverride;
    else if (this.inputDir.mag > 0.05 && this.moveScale > 0) this.targetYaw = Math.atan2(this.inputDir.x, this.inputDir.z);
    var rate2 = this.grounded ? p.turnRate : p.turnRate * 0.6;
    if (this.faceOverride != null) rate2 = 5.5;                      // 原地轉身慢一點，方便觀察
    this.yaw = M.dampAngle(this.yaw, this.targetYaw, rate2, dt);
  };

  CharacterController.prototype.turnError = function () { return Math.abs(M.angleDiff(this.yaw, this.targetYaw)); };

  CharacterController.prototype.resolveCollisions = function () {
    var r = this.p.radius, P = this.pos, v = this.vel;
    for (var i = 0; i < this.obstacles.length; i++) {
      var o = this.obstacles[i];
      if (o.h != null && P.y > o.h) continue;                       // 跳得比障礙物高就能越過
      var dx = P.x - o.x, dz = P.z - o.z, d = M.len2(dx, dz), min = r + o.r;
      if (d < min && d > 1e-6) {
        var nx = dx / d, nz = dz / d;
        P.x = o.x + nx * min; P.z = o.z + nz * min;
        var vn = v.x * nx + v.z * nz;                               // 去掉撞牆方向的速度，沿著障礙物滑開
        if (vn < 0) { v.x -= vn * nx; v.z -= vn * nz; }
      }
    }
    if (this.collider) this.collider(P, v, r);                       // 外部碰撞（例如迷宮的格狀牆壁）
    var b = this.p.bounds, dd = M.len2(P.x, P.z);
    if (dd > b) { P.x *= b / dd; P.z *= b / dd; }
  };

  NS.CharacterController = CharacterController;
})(window);
