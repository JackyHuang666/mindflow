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
