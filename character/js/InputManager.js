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
