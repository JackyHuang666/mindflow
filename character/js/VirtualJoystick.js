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
