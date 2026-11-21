/*!
 * InteractionManager — 物品互動管理（物品持有狀態）＋ 核心二：Grab / Release 自動切換
 *
 * 持有狀態：
 *   A. 沒有持有物品  → 動作鈕顯示「抓取」，持續搜尋附近可抓取物品（優先面向方向、需在互動距離內）
 *   B. 已持有物品    → 動作鈕自動變成「放下」，並顯示持有物品
 *   C. 正在抓取／放下 → busy，鎖定重複觸發；動畫的「接觸點」才把物品掛到手上／放開，
 *                      動畫「完成」後才更新持有狀態（held），避免物品重複、消失或位置錯亂
 *
 * 這個模組只管邏輯與資料；3D 的掛載（手部座標轉換）由場景透過事件處理：
 *   attach(item)          → 物品掛到手部 socket（使用 Object3D.attach 保留世界座標再補間）
 *   detach(item, place)   → 物品回到場景，補間到 place（地面或指定平台上，不穿透）
 *
 * item = { id, name, icon, radius, height, weight, pos:{x,y,z}, state, grabbable }
 */
(function (w) {
  "use strict";
  var NS = w.MFChar, M = NS.math;

  var DEFAULTS = {
    grabRange: 0.95,          // 角色碰撞邊緣到物品邊緣的最大距離
    facingMinDot: -0.15,      // 面向判斷：太後面的不抓（近身時例外）
    closeRange: 0.38,         // 非常近時，不論方向都可以抓
    dropDistances: [0.62, 0.5, 0.78, 0.4, 0.9],
    dropAngles: [0, 0.35, -0.35, 0.7, -0.7],
    maxHeld: 1
  };

  function InteractionManager(opts) {
    NS.Emitter.call(this);
    this.p = Object.assign({}, DEFAULTS, opts || {});
    this.items = [];
    this.surfaces = [];       // 可放置平台 { id, x, z, r, h, kind }
    this.obstacles = [];      // 與 CharacterController 共用 [{x,z,r,h}]
    this.bounds = 13.5;
    this.held = null;         // 目前持有的 item（只有在動作完成後才會設定）
    this.busy = null;         // null | 'grab' | 'release'
    this.pending = null;      // 進行中的物品
    this.target = null;       // 目前偵測到、可以抓的物品
    this.charRadius = 0.24;
  }
  InteractionManager.prototype = Object.create(NS.Emitter.prototype);

  InteractionManager.prototype.addItem = function (it) {
    it.state = "free"; it.grabbable = it.grabbable !== false;
    it.weight = it.weight || 1; it.radius = it.radius || 0.15; it.height = it.height || it.radius * 2;
    it.pos = it.pos || { x: 0, y: 0, z: 0 };
    this.items.push(it);
    return it;
  };

  /** 狀態 A/B/C 給 UI 使用 */
  InteractionManager.prototype.uiState = function () {
    if (this.busy) return { mode: "busy", label: this.busy === "grab" ? "抓取中" : "放下中" };
    if (this.held) return { mode: "release", itemIcon: this.held.icon, itemName: this.held.name };
    return { mode: "grab", hasTarget: !!this.target };
  };

  /** 每幀搜尋可抓取目標（優先面向方向） */
  InteractionManager.prototype.scan = function (pos, yaw) {
    var best = null;
    if (!this.held && !this.busy) {
      var fx = Math.sin(yaw), fz = Math.cos(yaw), bestScore = Infinity, p = this.p;
      for (var i = 0; i < this.items.length; i++) {
        var it = this.items[i];
        if (it.state !== "free" || !it.grabbable) continue;
        if (Math.abs(it.pos.y - pos.y) > 0.9) continue;                         // 高度差太多（例如在高台上）
        var dx = it.pos.x - pos.x, dz = it.pos.z - pos.z, d = M.len2(dx, dz);
        var gap = d - this.charRadius - it.radius;
        if (gap > p.grabRange) continue;
        var dot = d > 1e-4 ? (dx * fx + dz * fz) / d : 1;
        if (dot < p.facingMinDot && gap > p.closeRange) continue;
        var score = gap + (1 - dot) * 0.55;                                      // 距離＋面向加權
        if (score < bestScore) { bestScore = score; best = it; }
      }
    }
    if (best !== this.target) { var old = this.target; this.target = best; this.emit("target", { item: best, prev: old }); }
    return best;
  };

  /* ---------------- 抓取 ---------------- */
  InteractionManager.prototype.canGrab = function () { return !this.busy && !this.held && !!this.target; };

  InteractionManager.prototype.beginGrab = function () {
    if (this.busy) return { ok: false, reason: "busy" };
    if (this.held) return { ok: false, reason: "holding" };
    var it = this.target;
    if (!it) return { ok: false, reason: "none", message: "附近沒有可以抓取的物品" };
    this.busy = "grab"; this.pending = it; it.state = "grabbing";
    this.target = null; this.emit("target", { item: null, prev: it });
    this.emit("grabStart", it);
    return { ok: true, item: it };
  };
  /** 動畫的手部接觸點：物品開始跟著手 */
  InteractionManager.prototype.attachPending = function () {
    var it = this.pending; if (!it || this.busy !== "grab" || it.attached) return;
    it.attached = true;
    this.emit("attach", it);
  };
  /** 動畫完成：正式成為持有狀態 */
  InteractionManager.prototype.finishGrab = function () {
    var it = this.pending; if (!it || this.busy !== "grab") return null;
    if (!it.attached) this.attachPending();
    it.state = "held"; this.held = it; this.pending = null; this.busy = null;
    this.emit("grabDone", it);
    return it;
  };
  /** 被打斷（理論上狀態機不允許，保留作為安全機制） */
  InteractionManager.prototype.cancelGrab = function () {
    var it = this.pending; if (!it || this.busy !== "grab") return;
    if (it.attached) { it.attached = false; this.emit("detach", { item: it, place: this.findDropPoint(it.pos, 0, it, true) || { x: it.pos.x, y: 0, z: it.pos.z } }); }
    it.state = "free"; this.pending = null; this.busy = null;
    this.emit("grabCancel", it);
  };

  /* ---------------- 放下 ---------------- */
  InteractionManager.prototype.beginRelease = function (pos, yaw) {
    if (this.busy) return { ok: false, reason: "busy" };
    var it = this.held;
    if (!it) return { ok: false, reason: "empty" };
    var place = this.findDropPoint(pos, yaw, it);
    if (!place) return { ok: false, reason: "blocked", message: "前方空間不足，換個位置再放下" };
    this.busy = "release"; this.pending = it; this.place = place; it.state = "releasing";
    this.emit("releaseStart", { item: it, place: place });
    return { ok: true, item: it, place: place };
  };
  /** 動畫的放開點：物品脫離手部，平順落到放置點 */
  InteractionManager.prototype.detachPending = function () {
    var it = this.pending; if (!it || this.busy !== "release" || !it.attached) return;
    it.attached = false;
    it.pos = { x: this.place.x, y: this.place.y, z: this.place.z };
    this.emit("detach", { item: it, place: this.place });
  };
  InteractionManager.prototype.finishRelease = function () {
    var it = this.pending; if (!it || this.busy !== "release") return null;
    if (it.attached) this.detachPending();
    var place = this.place;
    it.state = "free"; it.surface = place.surface || null;
    this.held = null; this.pending = null; this.busy = null; this.place = null;
    this.emit("placed", { item: it, place: place });
    return it;
  };

  /** 找角色前方可以放的位置：不能穿透地面、障礙物或其他物品 */
  InteractionManager.prototype.findDropPoint = function (pos, yaw, it, anyDir) {
    var p = this.p, angles = anyDir ? [0, 1.57, 3.14, -1.57] : p.dropAngles;
    for (var a = 0; a < angles.length; a++) {
      for (var d = 0; d < p.dropDistances.length; d++) {
        var ang = yaw + angles[a], dist = p.dropDistances[d] + it.radius * 0.6;
        var x = pos.x + Math.sin(ang) * dist, z = pos.z + Math.cos(ang) * dist;
        var r = this.testPlace(x, z, it);
        if (r) return r;
      }
    }
    return null;
  };

  InteractionManager.prototype.testPlace = function (x, z, it) {
    if (M.len2(x, z) > this.bounds - it.radius) return null;
    if (this.placeFilter && !this.placeFilter(x, z, it)) return null;   // 外部放置限制（例如不能放進牆裡）
    var surface = null, y = 0, i;
    for (i = 0; i < this.surfaces.length; i++) {
      var s = this.surfaces[i], ds = M.len2(x - s.x, z - s.z);
      if (s.h > 0) {
        if (ds <= s.r - it.radius * 0.5) { surface = s; y = s.h; break; }       // 完整放在平台上
        if (ds < s.r + it.radius) return null;                                   // 卡在平台邊緣：不允許
      } else if (ds <= s.r) { surface = s; }
    }
    for (i = 0; i < this.obstacles.length; i++) {
      var o = this.obstacles[i];
      if (surface && o.surfaceId === surface.id) continue;
      if (M.len2(x - o.x, z - o.z) < o.r + it.radius + 0.02) return null;
    }
    for (i = 0; i < this.items.length; i++) {
      var o2 = this.items[i];
      if (o2 === it || o2.state === "held" || o2.state === "grabbing") continue;
      if (Math.abs(o2.pos.y - y) > 0.3) continue;
      if (M.len2(x - o2.pos.x, z - o2.pos.z) < o2.radius + it.radius + 0.03) return null;
    }
    return { x: x, y: y, z: z, surface: surface ? surface.id : null, kind: surface ? surface.kind : "ground" };
  };

  NS.InteractionManager = InteractionManager;
})(window);
