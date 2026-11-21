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
