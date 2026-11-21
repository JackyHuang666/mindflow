/*! SWT MindFlow 角色動畫與互動控制系統 v1.2.0 — 合併版（需先載入 three.js r128；讀取 .glb 角色另需 GLTFLoader） */
/*!
 * SWT MindFlow 角色動畫與互動控制系統 — core
 * 共用命名空間、事件、數學工具與裝置判斷。所有模組都掛在 window.MFChar 底下，
 * 以一般 <script> 載入即可（與 mindflow-sdk.js 相同的使用方式），不需要打包工具。
 */
(function (w) {
  "use strict";
  var NS = w.MFChar = w.MFChar || {};
  NS.version = "1.0.0";

  /* ---------- 簡易事件 ---------- */
  function Emitter() { this._ev = {}; }
  Emitter.prototype.on = function (t, fn) { (this._ev[t] = this._ev[t] || []).push(fn); return this; };
  Emitter.prototype.off = function (t, fn) {
    var a = this._ev[t]; if (!a) return this;
    var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); return this;
  };
  Emitter.prototype.emit = function (t, d) {
    var a = this._ev[t]; if (!a) return;
    a.slice().forEach(function (fn) { try { fn(d); } catch (e) { console.error("[MFChar] " + t, e); } });
  };
  Emitter.mixin = function (obj) { Emitter.call(obj); ["on", "off", "emit"].forEach(function (k) { obj[k] = Emitter.prototype[k]; }); return obj; };
  NS.Emitter = Emitter;

  /* ---------- 數學工具（不依賴 THREE，方便在任何遊戲或測試中使用） ---------- */
  var M = NS.math = {
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    /** 與幀率無關的平滑趨近：rate 越大越快 */
    damp: function (a, b, rate, dt) { return b + (a - b) * Math.exp(-rate * dt); },
    /** 角度差，回傳 -PI..PI */
    angleDiff: function (a, b) { var d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; },
    dampAngle: function (a, b, rate, dt) { return a + M.angleDiff(a, b) * (1 - Math.exp(-rate * dt)); },
    len2: function (x, z) { return Math.sqrt(x * x + z * z); },
    /** 以等速趨近目標（加速度／減速度） */
    approach: function (v, target, maxDelta) { return v < target ? Math.min(v + maxDelta, target) : Math.max(v - maxDelta, target); }
  };

  /* ---------- 裝置判斷 ---------- */
  NS.DeviceProfile = {
    detect: function () {
      var q = {}; try { q = Object.fromEntries(new URLSearchParams(w.location.search)); } catch (e) {}
      var mm = function (s) { try { return w.matchMedia(s).matches; } catch (e) { return false; } };
      var tp = navigator.maxTouchPoints || 0;
      var ua = navigator.userAgent || "";
      var iPadOS = /Macintosh/.test(ua) && tp > 1;                  // iPadOS 13+ 會偽裝成 Mac
      var coarse = mm("(pointer:coarse)") || mm("(any-pointer:coarse)") && mm("(hover:none)");
      var touch = coarse || iPadOS || /Android|iPhone|iPad|iPod|Mobile/i.test(ua) && tp > 0;
      if (q.ui === "touch") touch = true;
      if (q.ui === "desktop") touch = false;
      var sw = Math.min(w.screen.width, w.screen.height), vw = Math.min(w.innerWidth, w.innerHeight);
      var shortSide = Math.min(sw || vw, vw || sw);
      var kind = !touch ? "desktop" : (iPadOS || /iPad|Tablet/i.test(ua) || shortSide >= 600) ? "tablet" : "phone";
      if (touch && (q.device === "phone" || q.device === "tablet")) kind = q.device;   // 裝置預覽模式指定
      return {
        touch: touch, kind: kind, iOS: /iPhone|iPad|iPod/.test(ua) || iPadOS, android: /Android/i.test(ua),
        portrait: w.innerHeight > w.innerWidth, dpr: w.devicePixelRatio || 1, forced: q.ui || null
      };
    }
  };

  /* ---------- 瀏覽器手勢防護：避免捲動、縮放、長按選單干擾遊戲 ---------- */
  NS.lockBrowserGestures = function (root) {
    var d = w.document;
    var stop = function (e) { e.preventDefault(); };
    ["gesturestart", "gesturechange", "gestureend"].forEach(function (t) { d.addEventListener(t, stop, { passive: false }); });   // iOS 雙指縮放
    d.addEventListener("dblclick", stop, { passive: false });                                                                   // 雙擊放大
    (root || d).addEventListener("touchmove", function (e) { if (e.cancelable && !(e.target.closest && e.target.closest("[data-mfc-scroll]"))) e.preventDefault(); }, { passive: false });   // 拉動捲頁（可捲動面板除外）
    (root || d).addEventListener("contextmenu", stop);                                                                          // 長按選單
    (root || d).addEventListener("selectstart", stop);
    var last = 0;                                                                                                                // iOS 快速兩下放大
    d.addEventListener("touchend", function (e) { var n = Date.now(); if (n - last < 300 && e.cancelable && e.target.closest && e.target.closest(".mfc-ui")) e.preventDefault(); last = n; }, { passive: false });
  };
})(window);

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

/*!
 * VirtualJoystick — 左手虛擬方向搖桿
 * - 平常停在螢幕左下角；手指按在左半邊任何位置，搖桿會移到手指下方（浮動式，拇指不必找準位置）。
 * - 360 度自由方向、斜向移動、類比力道（推越遠走越快）、中央死區。
 * - 放開後數值立刻歸零（角色停止），搖桿頭以彈簧動畫回彈到中心。
 * 輸出 value = { x: -1..1（右為正）, y: -1..1（上＝向前為正）, mag: 0..1, active: bool }
 */
(function (w) {
  "use strict";
  var NS = w.MFChar, M = NS.math;

  function VirtualJoystick(mt, parent, opts) {
    NS.Emitter.call(this);
    opts = opts || {};
    this.mt = mt;
    this.deadZone = opts.deadZone != null ? opts.deadZone : 0.14;
    this.zoneRatio = opts.zoneRatio || 0.5;      // 左半邊都是搖桿區
    this.value = { x: 0, y: 0, mag: 0, active: false };
    this.pointerId = null;
    this.knob = { x: 0, y: 0, vx: 0, vy: 0 };   // 搖桿頭位移（px），放開後做彈簧回彈

    var el = this.el = w.document.createElement("div");
    el.className = "mfc-joy mfc-ui";
    el.innerHTML = '<div class="mfc-joy-base"><i class="mfc-joy-arrow u"></i><i class="mfc-joy-arrow r"></i><i class="mfc-joy-arrow d"></i><i class="mfc-joy-arrow l"></i><div class="mfc-joy-knob"></div></div>';
    parent.appendChild(el);
    this.base = el.firstChild;
    this.knobEl = el.querySelector(".mfc-joy-knob");

    var self = this;
    this.handler = {
      name: "joystick", priority: 1,
      zone: function (x, y) { return x < w.innerWidth * self.zoneRatio && y > w.innerHeight * 0.18 && self.enabled !== false; },
      onDown: function (p) { self._start(p); },
      onMove: function (p) { self._drag(p); },
      onUp: function (p, cancelled) { self._end(cancelled); }
    };
    this.unregister = mt.register(this.handler);
  }
  VirtualJoystick.prototype = Object.create(NS.Emitter.prototype);

  VirtualJoystick.prototype.radius = function () { return this.base.offsetWidth * 0.5 || 60; };

  /** 搖桿平常停放的中心（依 CSS 排版決定，含 Safe Area） */
  VirtualJoystick.prototype.restCenter = function () {
    var r = this.el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  VirtualJoystick.prototype._start = function (p) {
    var rest = this.restCenter(), R = this.radius();
    // 手指落點離預設位置太遠時，把搖桿底座移到手指下（不超出畫面）
    var cx = M.clamp(p.x, R + 8, w.innerWidth * this.zoneRatio - R * 0.3);
    var cy = M.clamp(p.y, R + 8, w.innerHeight - R - 8);
    var near = Math.hypot(p.x - rest.x, p.y - rest.y) < R * 1.1;
    this.center = near ? rest : { x: cx, y: cy };
    this.base.style.transform = near ? "" : "translate(" + (this.center.x - rest.x) + "px," + (this.center.y - rest.y) + "px)";
    this.el.classList.add("on");
    this.pointerId = p.id;
    this.value.active = true;
    this._drag(p);
    this.emit("start", this.value);
  };

  VirtualJoystick.prototype._drag = function (p) {
    var R = this.radius();
    var dx = p.x - this.center.x, dy = p.y - this.center.y;
    var d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; d = R; }
    this.knob.x = dx; this.knob.y = dy; this.knob.vx = this.knob.vy = 0;
    var n = d / R, mag = n < this.deadZone ? 0 : (n - this.deadZone) / (1 - this.deadZone);
    this.value.mag = mag;
    this.value.x = d ? dx / d * mag : 0;
    this.value.y = d ? -dy / d * mag : 0;        // 螢幕往上 = 向前
    this._render();
    this.emit("move", this.value);
  };

  VirtualJoystick.prototype._end = function (cancelled) {
    this.pointerId = null;
    this.value.x = this.value.y = this.value.mag = 0;   // 放開立刻停止
    this.value.active = false;
    this.el.classList.remove("on");
    this.base.style.transform = "";
    this.emit("end", { cancelled: cancelled });
  };

  /** 每幀呼叫：放開後搖桿頭的彈簧回彈（與幀率無關） */
  VirtualJoystick.prototype.update = function (dt) {
    if (this.value.active) return;
    var k = this.knob;
    if (Math.abs(k.x) < 0.2 && Math.abs(k.y) < 0.2 && Math.abs(k.vx) < 1 && Math.abs(k.vy) < 1) {
      if (k.x || k.y) { k.x = k.y = k.vx = k.vy = 0; this._render(); }
      return;
    }
    var stiff = 520, damp = 22, steps = Math.ceil(dt / 0.008), h = dt / steps;
    for (var i = 0; i < steps; i++) {
      k.vx += (-stiff * k.x - damp * k.vx) * h; k.vy += (-stiff * k.y - damp * k.vy) * h;
      k.x += k.vx * h; k.y += k.vy * h;
    }
    this._render();
  };

  VirtualJoystick.prototype._render = function () {
    this.knobEl.style.transform = "translate(-50%,-50%) translate(" + this.knob.x.toFixed(1) + "px," + this.knob.y.toFixed(1) + "px)";
    var v = this.value, arrows = this.el.querySelectorAll(".mfc-joy-arrow");
    arrows[0].classList.toggle("lit", v.y > 0.35); arrows[1].classList.toggle("lit", v.x > 0.35);
    arrows[2].classList.toggle("lit", v.y < -0.35); arrows[3].classList.toggle("lit", v.x < -0.35);
  };

  VirtualJoystick.prototype.setVisible = function (on) { this.el.style.display = on ? "" : "none"; this.enabled = on; if (!on) this.mt.releaseOwner(this.handler); };

  NS.VirtualJoystick = VirtualJoystick;
})(window);

/*!
 * MobileActionController — 右手技能按鈕
 * 預設按鈕：衝刺（按住）、跳躍（點擊）、抓取／放下（同一顆，依持有狀態自動切換）。
 * 另外保留技能欄位（slot），之後新增技能只要 addButton() 即可，例如測試場中的「慶祝」。
 *
 * 每顆按鈕都透過 MultiTouchManager 獨立認領手指，所以可以：左手推搖桿＋右手按住衝刺＋再用另一指點跳躍。
 */
(function (w) {
  "use strict";
  var NS = w.MFChar;

  // 按鈕位置：以右下角主按鈕（跳躍）為圓心排成弧形。slot 0 為主按鈕。
  var SLOTS = [
    { r: 0, a: 0, main: true },      // 0 跳躍（主按鈕，右下角）
    { r: 1, a: 180 },                // 1 左：衝刺
    { r: 1, a: 128 },                // 2 左上：抓取/放下
    { r: 1, a: 76 },                 // 3 上：預留技能（測試場放「慶祝」）
    { r: 1.9, a: 154 },              // 4 外圈：預留技能
    { r: 1.9, a: 104 }               // 5 外圈：預留技能
  ];

  function MobileActionController(mt, parent, opts) {
    NS.Emitter.call(this);
    opts = opts || {};
    this.mt = mt;
    this.buttons = {};
    this.held = {};
    var el = this.el = w.document.createElement("div");
    el.className = "mfc-actions mfc-ui";
    parent.appendChild(el);
    this.addButton({ id: "jump", label: "跳躍", icon: "⤒", mode: "tap", slot: 0 });
    this.addButton({ id: "sprint", label: "衝刺", icon: "»", mode: "hold", slot: 1 });
    this.addButton({ id: "action", label: "抓取", icon: "✋", mode: "tap", slot: 2 });
    this.setActionMode({ mode: "grab", hasTarget: false });
  }
  MobileActionController.prototype = Object.create(NS.Emitter.prototype);

  /** 新增技能按鈕。def = { id, label, icon, mode: 'tap'|'hold', slot } */
  MobileActionController.prototype.addButton = function (def) {
    var self = this, s = SLOTS[def.slot] || SLOTS[3];
    var b = w.document.createElement("button");
    b.type = "button";
    b.className = "mfc-btn" + (s.main ? " main" : "") + " id-" + def.id;
    b.setAttribute("aria-label", def.label);
    b.innerHTML = '<span class="mfc-btn-ic">' + def.icon + '</span><span class="mfc-btn-lb">' + def.label + "</span>";
    var rad = s.a * Math.PI / 180;
    b.style.setProperty("--dx", (Math.cos(rad) * s.r).toFixed(4)); b.style.setProperty("--dy", (-Math.sin(rad) * s.r).toFixed(4));
    this.el.appendChild(b);
    var h = {
      name: def.id, el: b, priority: 10,
      onDown: function () {
        if (b.disabled || b.classList.contains("locked")) { self.emit("blocked", def.id); b.classList.add("shake"); setTimeout(function () { b.classList.remove("shake"); }, 300); return; }
        b.classList.add("pressed");
        self.held[def.id] = true;
        if (w.navigator.vibrate && self.haptics !== false) try { w.navigator.vibrate(8); } catch (e) {}
        self.emit("press", def.id);
      },
      onUp: function (p, cancelled) {
        b.classList.remove("pressed");
        if (!self.held[def.id]) return;
        self.held[def.id] = false;
        self.emit("release", { id: def.id, cancelled: cancelled });
      }
    };
    this.buttons[def.id] = { def: def, el: b, handler: h, unregister: this.mt.register(h) };
    return b;
  };

  MobileActionController.prototype.isHeld = function (id) { return !!this.held[id]; };

  /**
   * 核心二的介面：依物品持有狀態切換「抓取／放下」。
   * st = { mode: 'grab'|'release'|'busy', hasTarget, itemIcon, itemName }
   */
  MobileActionController.prototype.setActionMode = function (st) {
    var b = this.buttons.action; if (!b) return;
    var key = st.mode + "|" + !!st.hasTarget + "|" + (st.itemIcon || "") + "|" + !!st.disabled;
    if (key === this._actKey) return;
    this._actKey = key;
    var el = b.el, ic = el.querySelector(".mfc-btn-ic"), lb = el.querySelector(".mfc-btn-lb");
    el.classList.toggle("mode-release", st.mode === "release");
    el.classList.toggle("mode-grab", st.mode === "grab");
    el.classList.toggle("locked", st.mode === "busy" || !!st.disabled);
    el.classList.toggle("ready", st.mode === "grab" && !!st.hasTarget);
    el.classList.toggle("dim", st.mode === "grab" && !st.hasTarget);
    if (st.mode === "release") { ic.textContent = st.itemIcon || "📦"; lb.textContent = "放下"; el.setAttribute("aria-label", "放下" + (st.itemName || "")); }
    else if (st.mode === "grab") { ic.textContent = "✋"; lb.textContent = "抓取"; el.setAttribute("aria-label", "抓取"); }
    else { lb.textContent = st.label || "…"; }
  };

  MobileActionController.prototype.setLocked = function (id, on) { var b = this.buttons[id]; if (b) b.el.classList.toggle("locked", !!on); };

  MobileActionController.prototype.setVisible = function (on) {
    this.el.style.display = on ? "" : "none";
    var self = this;
    Object.keys(this.buttons).forEach(function (k) { var b = self.buttons[k]; b.handler.enabled = on; if (!on) self.mt.releaseOwner(b.handler); });
  };

  NS.MobileActionController = MobileActionController;
})(window);

/*!
 * InputManager — 跨裝置輸入管理
 * 把「鍵盤＋滑鼠」與「觸控搖桿＋技能鈕」整合成同一份輸入狀態，角色系統只讀這一份，
 * 所以電腦與手機共用同一套角色動畫、狀態管理與互動系統。
 *
 *   電腦：↑/W 前、↓/S 後、←/A 左、→/D 右、Shift 按住衝刺、Space 跳躍、E 抓取／放下（＋自訂按鍵）
 *   手機／平板：左手搖桿、右手技能鈕；右半邊空白處拖曳可轉動鏡頭
 *
 * 每幀：var s = input.sample();  →  { moveX, moveY, mag, sprint, actions: ['jump', ...], cameraDelta, source }
 */
(function (w) {
  "use strict";
  var NS = w.MFChar, M = NS.math;

  var KEYMAP = {
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
    ShiftLeft: "sprint", ShiftRight: "sprint"
  };
  var ACTION_KEYS = { Space: "jump", KeyE: "action" };

  function InputManager(opts) {
    NS.Emitter.call(this);
    opts = opts || {};
    this.root = opts.root || w.document.body;
    this.uiParent = opts.uiParent || this.root;
    this.device = NS.DeviceProfile.detect();
    this.keys = {};
    this.queue = [];
    this.camDelta = 0;
    this.lastSource = this.device.touch ? "touch" : "keyboard";
    this.actionKeys = Object.assign({}, ACTION_KEYS, opts.actionKeys || {});
    this.enabled = true;

    // 觸控層：一律建立（電腦也能在偵測到觸控時切換），依裝置決定是否顯示
    this.mt = new NS.MultiTouchManager(this.root, { allowMouse: true });
    this.joystick = new NS.VirtualJoystick(this.mt, this.uiParent, opts.joystick);
    this.actions = new NS.MobileActionController(this.mt, this.uiParent, opts.actions);
    var self = this;
    this.actions.on("press", function (id) {
      self.lastSource = "touch";
      if (id !== "sprint") self.push(id, "touch");
      self.emit("press", id);
    });
    this.actions.on("blocked", function (id) { self.emit("blocked", id); });

    // 右半邊空白處：拖曳轉動鏡頭（不會搶走技能鈕或搖桿的手指）
    this.camHandler = {
      name: "camera", priority: 0,
      zone: function (x, y, e) { return (e.target === self.root || e.target.tagName === "CANVAS") && (self.touchUI ? x >= w.innerWidth * 0.5 : true); },
      onDown: function (p) { this._lx = p.x; },
      onMove: function (p) { self.camDelta += (p.x - this._lx); this._lx = p.x; },
      onUp: function () {}
    };
    this.mt.register(this.camHandler);

    // 鍵盤
    this._kd = function (e) {
      if (!self.enabled || e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      var k = KEYMAP[e.code], a = self.actionKeys[e.code];
      if (k || a) e.preventDefault();
      if (k) self.keys[k] = true;
      if (a && !e.repeat) self.push(a, "keyboard");                         // 按住不放不會連續觸發
      if (k || a) self.lastSource = "keyboard";
    };
    this._ku = function (e) { var k = KEYMAP[e.code]; if (k) self.keys[k] = false; };
    this._blur = function () { self.keys = {}; };                            // 視窗失焦：放開所有按鍵
    w.addEventListener("keydown", this._kd);
    w.addEventListener("keyup", this._ku);
    w.addEventListener("blur", this._blur);

    // 混合裝置（觸控筆電）：第一次碰到觸控就切換成觸控介面
    this._firstTouch = function (e) { if (e.pointerType === "touch" && !self.touchUI && !self.device.forced) self.setTouchUI(true); };
    w.addEventListener("pointerdown", this._firstTouch, true);

    this.setTouchUI(this.device.touch);
    this.mt.on("cancel", function (d) { self.emit("touchcancel", d); });
  }
  InputManager.prototype = Object.create(NS.Emitter.prototype);

  InputManager.prototype.setTouchUI = function (on) {
    this.touchUI = !!on;
    this.joystick.setVisible(on);
    this.actions.setVisible(on);
    w.document.documentElement.classList.toggle("mfc-touch", !!on);
    w.document.documentElement.setAttribute("data-mfc-device", on ? this.device.kind === "desktop" ? "tablet" : this.device.kind : "desktop");
    this.emit("ui", on);
  };

  InputManager.prototype.push = function (action, source) {
    if (!this.enabled) return;
    this.queue.push({ type: action, source: source, t: performance.now(), moving: this.isMoving() });
  };

  InputManager.prototype.isMoving = function () {
    var j = this.joystick.value;
    return j.active && j.mag > 0 || !!(this.keys.up || this.keys.down || this.keys.left || this.keys.right);
  };

  /** 取得本幀輸入（會清空動作佇列） */
  InputManager.prototype.sample = function (dt) {
    this.joystick.update(dt || 0.016);
    var x = 0, y = 0, mag = 0, src = this.lastSource;
    var j = this.joystick.value;
    if (j.active && j.mag > 0) { x = j.x; y = j.y; mag = j.mag; src = "touch"; }
    else {
      var kx = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
      var ky = (this.keys.up ? 1 : 0) - (this.keys.down ? 1 : 0);
      if (kx || ky) { var l = Math.hypot(kx, ky); x = kx / l; y = ky / l; mag = 1; src = "keyboard"; }   // 斜向正規化，不會比較快
    }
    var out = {
      moveX: x, moveY: y, mag: mag,
      sprint: !!this.keys.sprint || this.actions.isHeld("sprint"),
      joystickActive: j.active,
      actions: this.queue.splice(0),
      cameraDelta: this.camDelta,
      pointers: this.mt.owners.size,
      source: src
    };
    this.camDelta = 0;
    if (!this.enabled) { out.moveX = out.moveY = out.mag = 0; out.sprint = false; out.actions = []; }
    return out;
  };

  InputManager.prototype.destroy = function () {
    this.mt.destroy();
    w.removeEventListener("keydown", this._kd); w.removeEventListener("keyup", this._ku);
    w.removeEventListener("blur", this._blur); w.removeEventListener("pointerdown", this._firstTouch, true);
  };

  NS.InputManager = InputManager;
})(window);

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

/*!
 * CharacterStateMachine — 角色狀態管理系統（核心三）
 *
 * 三種狀態分開管理：
 *   角色移動狀態 → CharacterController（速度、地面、跳躍階段）
 *   物品持有狀態 → InteractionManager（held / busy / target）
 *   角色動畫狀態 → 本狀態機決定，交給 CharacterAnimationManager 平滑切換
 *
 * 狀態：IDLE WALK RUN JUMP GRAB CARRY RELEASE CELEBRATE
 * 每個狀態都有 enter / update / exit，以及明確的結束條件與下一個有效狀態。
 */
(function (w) {
  "use strict";
  var NS = w.MFChar, M = NS.math;

  var S = { IDLE: "IDLE", WALK: "WALK", RUN: "RUN", JUMP: "JUMP", GRAB: "GRAB", CARRY: "CARRY", RELEASE: "RELEASE", CELEBRATE: "CELEBRATE" };
  var LOCO = [S.IDLE, S.WALK, S.RUN, S.CARRY];

  // 動作優先權（數字大者可以中斷小者；同時只會有一個主要狀態，所以不會有互相衝突的動畫）
  var PRIORITY = { IDLE: 0, WALK: 0, RUN: 0, CARRY: 0, JUMP: 2, CELEBRATE: 3, GRAB: 4, RELEASE: 4 };

  function CharacterStateMachine(ctx, opts) {
    NS.Emitter.call(this);
    this.ctrl = ctx.controller;
    this.inter = ctx.interaction;
    this.anim = ctx.animation;          // { play(name, opts), setArms(on, fade), setTimeScale(s), duration(name), strideSpeed(name) }
    this.opt = Object.assign({ moveThreshold: 0.12, jumpBuffer: 0.22, grabContact: 0.42, releaseContact: 0.45 }, opts || {});
    this.state = null;
    this.t = 0;
    this.sub = null;                    // 狀態內的動畫子階段（例如跳躍的起跳／滯空／落地）
    this.buffer = null;                 // 輸入緩衝（落地瞬間按跳躍）
    this.queued = null;                 // 排隊中的下一個狀態（例如放到目標後慶祝）
    this.history = [];
    this.go(S.IDLE);
  }
  CharacterStateMachine.prototype = Object.create(NS.Emitter.prototype);
  CharacterStateMachine.STATES = S;
  CharacterStateMachine.PRIORITY = PRIORITY;

  /* ---------- 狀態定義 ---------- */
  var defs = {};

  defs.IDLE = {
    enter: function (sm) { sm.ctrl.moveScale = 1; sm.playLoco("idle", 0.25); },
    update: function (sm) {
      var n = sm.locomotion(); if (n !== S.IDLE) return n;
      // 原地轉身（轉身測試或停下時方向還沒轉完）：踏步補間，不瞬間切換
      var turning = sm.ctrl.turnError() > 0.3;
      sm.playLoco(turning ? "turn" : "idle", 0.22);
    }
  };
  defs.WALK = {
    enter: function (sm) { sm.ctrl.moveScale = 1; sm.playLoco("walk", 0.22); },
    update: function (sm) { var n = sm.locomotion(); if (n !== S.WALK) return n; sm.syncStride("walk"); }
  };
  defs.RUN = {
    enter: function (sm) { sm.ctrl.moveScale = 1; sm.playLoco("run", 0.2); },
    update: function (sm) { var n = sm.locomotion(); if (n !== S.RUN) return n; sm.syncStride("run"); }
  };
  defs.CARRY = {
    enter: function (sm) { sm.ctrl.moveScale = 1; sm.carryLoco(true); },
    update: function (sm) { var n = sm.locomotion(); if (n !== S.CARRY) return n; sm.carryLoco(false); }
  };
  defs.JUMP = {
    enter: function (sm) { sm.ctrl.moveScale = 1; sm.sub = "start"; sm.anim.play("jumpStart", { fade: 0.08, once: true }); },
    update: function (sm) {
      var c = sm.ctrl;
      if (c.jumpPhase === "air" && sm.sub === "start" && (c.vel.y < 1.2 || c.phaseT > 0.25)) { sm.sub = "air"; sm.anim.play("jumpAir", { fade: 0.18 }); }
      if (c.jumpPhase === "land" && sm.sub !== "land") { sm.sub = "land"; sm.anim.play("jumpLand", { fade: 0.06, once: true }); }
      if (c.jumpPhase === "none") return sm.locomotion();                     // 落地緩衝結束 → 回到移動狀態
    }
  };
  defs.GRAB = {
    enter: function (sm, d) {
      sm.ctrl.moveScale = 0;
      var it = d.item, P = sm.ctrl.pos;
      sm.ctrl.faceTo(Math.atan2(it.pos.x - P.x, it.pos.z - P.z));           // 轉向目標物品
      sm.dur = sm.anim.duration("grab") || 1;
      sm.anim.play("grab", { fade: 0.12, once: true });
    },
    update: function (sm) {
      if (sm.t >= sm.dur * sm.opt.grabContact) sm.inter.attachPending();      // 手掌接觸物品
      if (sm.t >= sm.dur) { sm.inter.finishGrab(); sm.ctrl.faceOverride = null; return S.CARRY; }   // 動作完成才更新持有狀態
    },
    exit: function (sm, next) { if (sm.inter.busy === "grab") sm.inter.cancelGrab(); }
  };
  defs.RELEASE = {
    enter: function (sm) {
      sm.ctrl.moveScale = 0;
      sm.dur = sm.anim.duration("release") || 0.9;
      sm.anim.setArms(false, 0.15);
      sm.anim.play("release", { fade: 0.15, once: true });
    },
    update: function (sm) {
      if (sm.t >= sm.dur * sm.opt.releaseContact) sm.inter.detachPending();   // 物品脫離手部
      if (sm.t >= sm.dur) {
        var r = sm.inter.finishRelease();
        if (r && sm.queued) { var q = sm.queued; sm.queued = null; return q; }
        return sm.locomotion();
      }
    }
  };
  defs.CELEBRATE = {
    enter: function (sm) { sm.ctrl.moveScale = 0; sm.dur = sm.anim.duration("celebrate") || 1.6; sm.anim.play("celebrate", { fade: 0.15, once: true }); },
    update: function (sm) { if (sm.t >= sm.dur) return sm.locomotion(); }
  };

  /* ---------- 核心流程 ---------- */
  CharacterStateMachine.prototype.go = function (next, data) {
    if (!defs[next]) throw new Error("Unknown state " + next);
    var prev = this.state;
    if (prev && defs[prev].exit) defs[prev].exit(this, next);
    this.state = next; this.t = 0; this.sub = null; this.locoClip = null;
    this.history.push(next); if (this.history.length > 40) this.history.shift();
    defs[next].enter(this, data || {});
    this.emit("state", { from: prev, to: next });
  };

  /** 依移動狀態與持有狀態決定下一個移動類狀態（所有動作結束後都回到這裡） */
  CharacterStateMachine.prototype.locomotion = function () {
    var c = this.ctrl;
    if (!c.grounded || c.jumpPhase === "windup" || c.jumpPhase === "air") return S.JUMP;
    if (this.inter.held) return S.CARRY;
    var moving = c.speed() > this.opt.moveThreshold || c.inputDir.mag > 0.05;
    if (!moving) return S.IDLE;
    return c.sprinting && c.speed() > c.p.walkSpeed * 1.08 ? S.RUN : S.WALK;
  };

  CharacterStateMachine.prototype.playLoco = function (clip, fade) {
    if (this.locoClip === clip) return;
    this.locoClip = clip;
    this.anim.play(clip, { fade: fade });
  };
  CharacterStateMachine.prototype.syncStride = function (clip) {
    // 腳步頻率與實際移動速度同步，避免腳底滑動
    var s = this.anim.strideSpeed ? this.anim.strideSpeed(clip) : 0;
    if (s) this.anim.setTimeScale(M.clamp(this.ctrl.speed() / s, 0.45, 2.2));
  };
  CharacterStateMachine.prototype.carryLoco = function (force) {
    var c = this.ctrl, moving = c.speed() > this.opt.moveThreshold || c.inputDir.mag > 0.05;
    var clip = !moving ? "idle" : c.sprinting && c.speed() > c.p.walkSpeed * 1.05 ? "run" : "walk";
    if (force) this.locoClip = null;
    this.playLoco(clip, 0.22);
    if (clip !== "idle") this.syncStride(clip);
  };

  /** 處理玩家動作請求。回傳 { ok, reason, message } */
  CharacterStateMachine.prototype.request = function (action) {
    var st = this.state, c = this.ctrl, it = this.inter;
    var free = LOCO.indexOf(st) >= 0, grounded = c.grounded && c.jumpPhase === "none";
    var r;
    if (action === "jump") {
      if (st === S.JUMP) { if (c.jumpPhase === "land") { this.buffer = { a: "jump", t: this.opt.jumpBuffer }; return { ok: false, reason: "buffered" }; } return { ok: false, reason: "airborne", message: null }; }
      if (!free) return { ok: false, reason: "locked", message: null };
      if (!c.requestJump()) return { ok: false, reason: "cannot" };
      this.go(S.JUMP); return { ok: true };
    }
    if (action === "action") action = it.held ? "release" : "grab";            // 同一顆鈕自動判斷
    if (action === "grab") {
      if (it.busy || st === S.GRAB) return { ok: false, reason: "busy" };
      if (it.held) return { ok: false, reason: "holding" };
      if (!free || !grounded) return { ok: false, reason: "locked", message: st === S.JUMP ? "落地後才能抓取" : null };
      r = it.beginGrab();
      if (!r.ok) return r;
      this.go(S.GRAB, { item: r.item }); return { ok: true, item: r.item };
    }
    if (action === "release") {
      if (it.busy || st === S.RELEASE) return { ok: false, reason: "busy" };
      if (!it.held) return { ok: false, reason: "empty" };
      if (!free || !grounded) return { ok: false, reason: "locked", message: st === S.JUMP ? "落地後才能放下" : null };
      r = it.beginRelease(c.pos, c.yaw);
      if (!r.ok) return r;
      if (r.place.kind === "goal") this.queued = S.CELEBRATE;                  // 放到目標上 → 自動慶祝
      this.go(S.RELEASE, r); return { ok: true, item: r.item };
    }
    if (action === "celebrate") {
      if (it.held) return { ok: false, reason: "holding", message: "先把物品放下再慶祝" };
      if (!free || !grounded) return { ok: false, reason: "locked" };
      this.go(S.CELEBRATE); return { ok: true };
    }
    return { ok: false, reason: "unknown" };
  };

  CharacterStateMachine.prototype.update = function (dt) {
    this.t += dt;
    var next = defs[this.state].update(this, dt);
    if (next && next !== this.state) this.go(next);
    if (this.buffer) {
      this.buffer.t -= dt;
      if (LOCO.indexOf(this.state) >= 0) { var b = this.buffer; this.buffer = null; this.request(b.a); }
      else if (this.buffer.t <= 0) this.buffer = null;
    }
    // 持有物品時（抓取／放下動畫以外）雙手維持抱持姿勢，與走路、跳躍上下半身分層
    var arms = !!this.inter.held && this.state !== S.GRAB && this.state !== S.RELEASE;
    this.anim.setArms(arms, 0.2);
  };

  CharacterStateMachine.prototype.isLocked = function () { return PRIORITY[this.state] >= 3; };

  NS.CharacterStateMachine = CharacterStateMachine;
})(window);

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

/*!
 * CharacterAnimationManager — 角色動畫管理（角色動畫狀態的執行端）
 * AnimationMixer + AnimationAction + CrossFade：
 *   - 主層：一次只播放一個主要動作（idle / walk / run / jump… ），切換一律 crossFadeTo 平滑過渡
 *   - 上半身層：持有物品時淡入 carryArms，主層同時換成「不含手臂」的版本 → 抱著東西也能走、跑、跳
 *   - 眨眼層：永遠播放，不受其他動作影響
 * 狀態機只呼叫 play() / setArms() / setTimeScale()，不直接碰 Three.js。
 */
(function (w) {
  "use strict";
  var NS = w.MFChar;

  function CharacterAnimationManager(rig, lib) {
    NS.Emitter.call(this);
    var THREE = this.THREE = rig.THREE;
    this.rig = rig; this.lib = lib;
    this.mixer = new THREE.AnimationMixer(rig.root);
    this.actions = {};
    this.cur = null; this.curAction = null; this.curOpts = {};
    this.armsOn = false;
    this.blink = this.action("blink"); this.blink.play();
    this.arms = this.action("carryArms"); this.arms.setEffectiveWeight(0);
    var self = this;
    this.mixer.addEventListener("finished", function (e) { self.emit("finished", e.action.getClip().name.replace("_noArms", "")); });
  }
  CharacterAnimationManager.prototype = Object.create(NS.Emitter.prototype);

  CharacterAnimationManager.prototype.action = function (clipName) {
    if (!this.actions[clipName]) {
      var clip = this.lib.clips[clipName];
      if (!clip) throw new Error("Missing clip " + clipName);
      this.actions[clipName] = this.mixer.clipAction(clip);
    }
    return this.actions[clipName];
  };

  CharacterAnimationManager.prototype.variant = function (name, armsOn) {
    return armsOn && this.lib.clips[name + "_noArms"] ? name + "_noArms" : name;
  };

  CharacterAnimationManager.prototype._setup = function (a, o) {
    var THREE = this.THREE;
    a.enabled = true;
    a.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = !!o.once;
    a.timeScale = o.timeScale || 1;
    a.setEffectiveWeight(1);
  };

  /** 播放主要動作。opts = { fade, once, timeScale, restart } */
  CharacterAnimationManager.prototype.play = function (name, opts) {
    var o = Object.assign({ fade: 0.2 }, opts || {});
    var a = this.action(this.variant(name, this.armsOn));
    if (a === this.curAction && !o.restart && !o.once) { this.cur = name; return a; }
    var prev = this.curAction;
    a.stop(); this._setup(a, o); a.play();
    if (prev && prev !== a) prev.crossFadeTo(a, o.fade, false);
    else if (!prev) a.fadeIn(o.fade);
    this.cur = name; this.curAction = a; this.curOpts = o;
    this.emit("play", name);
    return a;
  };

  /** 上半身抱持層的開關；主層換成對應版本並保留播放進度，避免動作跳動 */
  CharacterAnimationManager.prototype.setArms = function (on, fade) {
    on = !!on; if (on === this.armsOn) return;
    this.armsOn = on; fade = fade || 0.2;
    if (on) { this.arms.stop(); this.arms.enabled = true; this.arms.setEffectiveWeight(1); this.arms.play(); this.arms.fadeIn(fade); }
    else this.arms.fadeOut(fade);
    if (!this.cur) return;
    var target = this.action(this.variant(this.cur, on)), prev = this.curAction;
    if (target === prev) return;
    var t = prev.time, ts = prev.timeScale;
    target.stop(); this._setup(target, this.curOpts); target.time = t; target.timeScale = ts; target.play();
    prev.crossFadeTo(target, fade, false);
    this.curAction = target;
  };

  CharacterAnimationManager.prototype.setTimeScale = function (s) { if (this.curAction) this.curAction.timeScale = s; };
  CharacterAnimationManager.prototype.duration = function (name) { var c = this.lib.clips[name]; return c ? c.duration : 0; };
  CharacterAnimationManager.prototype.strideSpeed = function (name) { return this.lib.stride[name] || 0; };
  CharacterAnimationManager.prototype.update = function (dt) { this.mixer.update(dt); };
  CharacterAnimationManager.prototype.dispose = function () { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.rig.root); };

  NS.CharacterAnimationManager = CharacterAnimationManager;
})(window);

/*!
 * CharacterSystem — 把各模組組裝成「一個可操作的玩家角色」，給所有 SWT MindFlow 遊戲共用
 *
 *   var player = MFChar.createPlayer({ THREE, scene, character: "boy", input, interaction, controller: {...} });
 *   每幀：player.update(dt, cameraYaw);
 *
 * 模組分工：
 *   InputManager（輸入）→ CharacterController（移動狀態）
 *                       → CharacterStateMachine（動作請求、狀態與優先權）→ CharacterAnimationManager（動畫）
 *                       → InteractionManager（物品持有狀態）→ 本檔負責物品與手部的 3D 掛載與座標轉換
 */
(function (w) {
  "use strict";
  var NS = w.MFChar, M = NS.math;

  function Player(o) {
    NS.Emitter.call(this);
    var THREE = this.THREE = o.THREE;
    this.scene = o.scene;
    this.input = o.input || null;
    this.interaction = o.interaction || new NS.InteractionManager();
    this.controller = new NS.CharacterController(o.controller);
    this.controller.obstacles = this.interaction.obstacles;
    this.interaction.charRadius = this.controller.p.radius;
    this.object = new THREE.Group(); this.object.name = "Player";
    this.scene.add(this.object);
    this.tweens = [];
    this.setCharacter(o.character || "boy");
    this._bindInteraction();
  }
  Player.prototype = Object.create(NS.Emitter.prototype);

  /** 換角色或換裝：骨架與動畫共用，控制狀態保留 */
  Player.prototype.setCharacter = function (spec) {
    var THREE = this.THREE, held = this.interaction.held, heldObj = held && held.obj;
    if (heldObj) this.scene.attach(heldObj);
    if (this.rig) { this.object.remove(this.rig.root); this.anim.dispose(); if (!this.rig.keep) this.rig.dispose(); }
    this.rig = spec && spec.rig ? spec.rig : NS.ClayCharacterFactory.create(THREE, spec);   // 可直接傳入 GLBCharacterLoader 讀好的模型
    this.lib = NS.AnimationLibrary.build(this.rig);
    NS.AnimationLibrary.carrySocket(this.rig);
    this.object.add(this.rig.root);
    this.anim = new NS.CharacterAnimationManager(this.rig, this.lib);
    var prevState = this.sm && this.sm.state;
    this.sm = new NS.CharacterStateMachine({ controller: this.controller, interaction: this.interaction, animation: this.anim });
    var self = this;
    this.sm.on("state", function (e) { self.emit("state", e); });
    if (heldObj) { this.rig.sockets.hand.add(heldObj); heldObj.position.set(0, -held.height * 0.5, this.holdForward(held)); heldObj.quaternion.identity(); }
    if (prevState === "CARRY" || held) this.sm.go("CARRY");
    this.emit("character", this.rig.spec);
  };

  Player.prototype.holdForward = function (it) { return Math.max(0.02, it.radius - (this.rig.handGap || 0.2) * 0.42); };

  Player.prototype._bindInteraction = function () {
    var self = this, I = this.interaction, THREE = this.THREE;
    I.on("attach", function (it) {
      // 手部座標轉換：attach() 保留世界座標掛到手上，再補間到抱持位置，物品不會瞬移
      var sock = self.rig.sockets.hand;
      sock.attach(it.obj);
      self.tween(it.obj, { pos: new THREE.Vector3(0, -it.height * 0.5, self.holdForward(it)), quat: new THREE.Quaternion() }, 0.22);
    });
    I.on("detach", function (e) {
      var it = e.item, pl = e.place;
      self.scene.attach(it.obj);
      var yaw = self.controller.yaw;
      self.tween(it.obj, { pos: new THREE.Vector3(pl.x, pl.y, pl.z), quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), arc: 0.02, floor: pl.y }, 0.26);
    });
  };

  /** 簡易補間（物品掛上手、放到地上）；floor 保證不穿透放置面 */
  Player.prototype.tween = function (obj, to, dur) {
    this.tweens = this.tweens.filter(function (t) { return t.obj !== obj; });
    this.tweens.push({ obj: obj, p0: obj.position.clone(), q0: obj.quaternion.clone(), to: to, t: 0, dur: dur });
  };
  Player.prototype._updateTweens = function (dt) {
    for (var i = this.tweens.length - 1; i >= 0; i--) {
      var tw = this.tweens[i]; tw.t += dt;
      var u = M.clamp(tw.t / tw.dur, 0, 1), e = u * u * (3 - 2 * u);
      tw.obj.position.lerpVectors(tw.p0, tw.to.pos, e);
      if (tw.to.arc) tw.obj.position.y += Math.sin(u * Math.PI) * tw.to.arc;
      if (tw.to.floor != null && tw.obj.position.y < tw.to.floor) tw.obj.position.y = tw.to.floor;
      tw.obj.quaternion.copy(tw.q0).slerp(tw.to.quat, e);
      if (u >= 1) this.tweens.splice(i, 1);
    }
  };

  /** 處理一個動作（來自 InputManager 的 actions），回傳結果 */
  Player.prototype.act = function (type, meta) {
    var r = this.sm.request(type);
    this.emit("action", { type: type, result: r, meta: meta || {} });
    return r;
  };

  /**
   * 每幀更新。cameraYaw：鏡頭繞角色的水平角度，搖桿方向會依鏡頭換算成世界方向。
   * sample：可傳入 input.sample() 的結果；省略時自動讀取 this.input。
   */
  Player.prototype.update = function (dt, cameraYaw, sample) {
    dt = Math.min(dt, 0.05);                                 // 分頁切回來時避免大跳
    var s = sample || (this.input ? this.input.sample(dt) : null), c = this.controller;
    if (s) {
      var cy = cameraYaw || 0, fx = -Math.sin(cy), fz = -Math.cos(cy), rx = -fz, rz = fx;
      c.setMoveInput(rx * s.moveX + fx * s.moveY, rz * s.moveX + fz * s.moveY, s.mag, s.sprint);
      var heavy = this.interaction.held ? this.interaction.held.weight : 0;
      c.speedScale = heavy ? c.p.carrySpeedScale * (1 - Math.min(0.3, (heavy - 1) * 0.1)) : 1;
      for (var i = 0; i < s.actions.length; i++) this.act(s.actions[i].type, s.actions[i]);
    }
    c.update(dt);
    this.sm.update(dt);
    this.interaction.scan(c.pos, c.yaw);
    this.anim.update(dt);
    this.object.position.set(c.pos.x, c.pos.y, c.pos.z);
    this.object.rotation.y = c.yaw;
    this._updateTweens(dt);
    var held = this.interaction.held || this.interaction.pending;
    if (held && held.obj && held.attached) { var v = held.obj.getWorldPosition(this._v || (this._v = new this.THREE.Vector3())); held.pos.x = v.x; held.pos.y = v.y; held.pos.z = v.z; }
    if (this.input && this.input.actions) this.input.actions.setActionMode(this.interaction.uiState());
    return s;
  };

  NS.Player = Player;
  NS.createPlayer = function (o) { return new Player(o); };
})(window);

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

