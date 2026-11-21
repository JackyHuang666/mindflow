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
