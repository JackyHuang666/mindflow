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
