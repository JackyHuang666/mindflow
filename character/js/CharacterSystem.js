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
