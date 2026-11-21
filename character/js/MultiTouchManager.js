/*!
 * MultiTouchManager — 多點觸控同步系統（核心一）
 *
 * 每一根手指（pointerId）在按下的那一刻就被「認領」給一個控制元件（搖桿、技能鈕、鏡頭區…），
 * 之後這根手指的移動與放開只會送到它的擁有者，所以：
 *   - 左手搖桿和右手技能鈕永遠互不干擾，不會因為一隻手在操作就鎖住另一隻手。
 *   - 支援任意數量的手指同時操作（至少兩指，實際上不設上限）。
 *   - 手指離開畫面、系統打斷（來電、切換 App、通知列）時，所有擁有者都會收到 cancel，安全解除。
 *
 * 用法：
 *   var mt = new MFChar.MultiTouchManager(rootEl);
 *   mt.register({ el: buttonEl, priority: 10, onDown(p){}, onMove(p){}, onUp(p, cancelled){} });
 *   mt.register({ zone(x, y){ return x < innerWidth/2; }, priority: 1, ... });   // 以座標判斷的區域
 */
(function (w) {
  "use strict";
  var NS = w.MFChar;

  function MultiTouchManager(root, opts) {
    NS.Emitter.call(this);
    opts = opts || {};
    this.root = root;
    this.handlers = [];
    this.owners = new Map();          // pointerId -> { h, startX, startY, x, y, type, t0 }
    this.allowMouse = opts.allowMouse !== false;
    this.stats = { maxSimultaneous: 0, cancels: 0 };
    root.style.touchAction = "none";
    var self = this;
    this._down = function (e) { self.onDown(e); };
    this._move = function (e) { self.onMove(e); };
    this._up = function (e) { self.onUp(e, false); };
    this._cancel = function (e) { self.onUp(e, true); };
    this._lost = function (e) { if (self.owners.has(e.pointerId)) self.onUp(e, true); };
    this._blur = function () { self.releaseAll("blur"); };
    this._vis = function () { if (w.document.hidden) self.releaseAll("hidden"); };
    root.addEventListener("pointerdown", this._down, { passive: false });
    root.addEventListener("pointermove", this._move, { passive: false });
    root.addEventListener("pointerup", this._up, { passive: false });
    root.addEventListener("pointercancel", this._cancel, { passive: false });
    root.addEventListener("lostpointercapture", this._lost);
    w.addEventListener("pointerup", this._up);              // 手指在 root 以外放開（少數瀏覽器不支援 capture 時的保險）
    w.addEventListener("pointercancel", this._cancel);
    w.addEventListener("blur", this._blur);
    w.document.addEventListener("visibilitychange", this._vis);
    w.addEventListener("orientationchange", this._blur);
  }
  MultiTouchManager.prototype = Object.create(NS.Emitter.prototype);

  /** 註冊控制元件。el 與 zone 至少要有一個；priority 越大越先判斷。回傳取消註冊的函式。 */
  MultiTouchManager.prototype.register = function (h) {
    h.priority = h.priority || 0;
    h.enabled = h.enabled !== false;
    h.multi = !!h.multi;              // 同一個元件可否被多根手指同時認領（預設否）
    this.handlers.push(h);
    this.handlers.sort(function (a, b) { return b.priority - a.priority; });
    var self = this;
    return function () { self.releaseOwner(h); var i = self.handlers.indexOf(h); if (i >= 0) self.handlers.splice(i, 1); };
  };

  MultiTouchManager.prototype._find = function (e) {
    var t = e.target;
    for (var i = 0; i < this.handlers.length; i++) {
      var h = this.handlers[i];
      if (!h.enabled) continue;
      if (!h.multi && this.isOwned(h)) continue;
      if (h.el) { if (h.el === t || h.el.contains(t)) return h; continue; }
      // 一般的介面按鈕（選單、設定等）不屬於任何區域，讓它們照常被點擊
      if (t && t.closest && t.closest("button,a,input,select,textarea,label,[data-mfc-pass]")) return null;
      if (h.zone && h.zone(e.clientX, e.clientY, e)) return h;
    }
    return null;
  };

  MultiTouchManager.prototype.isOwned = function (h) {
    var it = this.owners.values(), n;
    while (!(n = it.next()).done) if (n.value.h === h) return true;
    return false;
  };

  MultiTouchManager.prototype.onDown = function (e) {
    if (e.pointerType === "mouse" && (!this.allowMouse || e.button !== 0)) return;
    if (this.owners.has(e.pointerId)) this.onUp(e, true);           // 同一個 id 重複按下（理論上不會）：先安全解除
    var h = this._find(e);
    if (!h) return;
    if (e.cancelable) e.preventDefault();
    var p = { id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, t0: performance.now() };
    this.owners.set(e.pointerId, { h: h, p: p });
    try { this.root.setPointerCapture(e.pointerId); } catch (err) {}  // 手指滑出元件也持續追蹤
    this.stats.maxSimultaneous = Math.max(this.stats.maxSimultaneous, this.owners.size);
    if (h.onDown) h.onDown(p, e);
    this.emit("change", this.snapshot());
  };

  MultiTouchManager.prototype.onMove = function (e) {
    var o = this.owners.get(e.pointerId);
    if (!o) return;
    if (e.cancelable) e.preventDefault();
    var p = o.p;
    p.x = e.clientX; p.y = e.clientY; p.dx = p.x - p.startX; p.dy = p.y - p.startY;
    if (o.h.onMove) o.h.onMove(p, e);
  };

  MultiTouchManager.prototype.onUp = function (e, cancelled) {
    var o = this.owners.get(e.pointerId);
    if (!o) return;
    this.owners.delete(e.pointerId);
    try { if (this.root.hasPointerCapture && this.root.hasPointerCapture(e.pointerId)) this.root.releasePointerCapture(e.pointerId); } catch (err) {}
    if (cancelled) this.stats.cancels++;
    if (e.clientX != null) { o.p.x = e.clientX; o.p.y = e.clientY; }
    if (o.h.onUp) o.h.onUp(o.p, !!cancelled, e);
    this.emit(cancelled ? "cancel" : "change", this.snapshot());
  };

  /** 釋放某個元件持有的所有手指 */
  MultiTouchManager.prototype.releaseOwner = function (h) {
    var self = this;
    Array.from(this.owners.entries()).forEach(function (kv) {
      if (kv[1].h !== h) return;
      self.owners.delete(kv[0]);
      if (h.onUp) h.onUp(kv[1].p, true);
    });
  };

  /** 觸控中斷（切換 App、來電、轉向）時安全解除全部操作 */
  MultiTouchManager.prototype.releaseAll = function (reason) {
    if (!this.owners.size) return;
    var list = Array.from(this.owners.values());
    this.owners.clear();
    this.stats.cancels += list.length;
    list.forEach(function (o) { if (o.h.onUp) o.h.onUp(o.p, true); });
    this.emit("cancel", { reason: reason, list: this.snapshot() });
  };

  MultiTouchManager.prototype.snapshot = function () {
    return Array.from(this.owners.entries()).map(function (kv) { return { id: kv[0], name: kv[1].h.name || "?", type: kv[1].p.type }; });
  };

  MultiTouchManager.prototype.destroy = function () {
    this.releaseAll("destroy");
    var r = this.root;
    r.removeEventListener("pointerdown", this._down); r.removeEventListener("pointermove", this._move);
    r.removeEventListener("pointerup", this._up); r.removeEventListener("pointercancel", this._cancel);
    r.removeEventListener("lostpointercapture", this._lost);
    w.removeEventListener("pointerup", this._up); w.removeEventListener("pointercancel", this._cancel);
    w.removeEventListener("blur", this._blur); w.document.removeEventListener("visibilitychange", this._vis);
    w.removeEventListener("orientationchange", this._blur);
  };

  NS.MultiTouchManager = MultiTouchManager;
})(window);
