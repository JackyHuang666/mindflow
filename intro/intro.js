/*
 * SWT MindFlow 身心智慧學院 — 15 秒開場序章（登入前）
 *
 * 什麼時候播：每次進入遊戲都先播（不論是否已登入）：
 *   ・每開一次遊戲（新的瀏覽器分頁／App 啟動）播一次 → 播完接登入畫面；已登入學員、訪客則接遊戲主畫面
 *   ・登出後回到登入畫面時再播一次
 *   ・同一次使用中的自動重新整理（雲端存檔載入、版本更新、畫面恢復）、Google 登入回來或取消時不重播
 *   網址加 ?intro=1 可強制播放（測試用）。
 * 畫面：預先渲染好的 MP4（intro-1080.mp4 / 手機與省流量用 intro-720.mp4），
 *   上面疊一層很輕的 Three.js 粒子（金色光塵、轉場爆發、品牌段五色光環），省電保護 2 級以上不載入。
 * 聲音：瀏覽器不允許自動有聲播放，所以先出現「開啟序章」按鈕，點一下才開始（同時解鎖聲音與旁白）。
 * 旁白：字幕＋裝置內建的中文語音（Web Speech API，可在右上角關閉）。沒有中文語音的裝置只顯示字幕。
 * 重播：登入畫面右上角「🎬 重播序章」；其他程式可呼叫 MFIntro.play()。
 * 這支程式只新增 #mf-intro、#mf-intro-replay 兩個元素，不修改登入、遊戲授權等既有功能。
 */
(function () {
  "use strict";
  var BASE = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^/]*$/, "") : "intro/"; })();
  var VER = "3";
  var K_SEEN = "swt-intro-seen", K_VOICE = "swt-intro-voice", K_MUTE = "swt-intro-mute", K_SUB = "swt-intro-sub";   // 不以 mf- 開頭：只存在這台裝置，不同步雲端
  var DUR = 15;
  // 字幕：[開始秒, 結束秒, 文字]。配合畫面分段，轉場閃光時字幕先淡出。
  var LINES = [
    [0.45, 2.8, "天地初開，｜女媧以五色泥土創造生命。"],          // 女媧造人
    [3.2, 5.85, "五色能量修補天地，｜喚醒沉睡的智慧。"],          // 五色補天
    [6.35, 10.3, "如今，五大元素匯聚，｜開啟一座全新的智慧學院。"], // 學院誕生
    [10.45, 12.75, "這一次，換你創造自己，｜探索無限可能！"],      // 學院全景
    [12.9, 16.0, "歡迎來到｜SWT MindFlow 身心智慧學院。"]        // 品牌（影片結束後畫面停 1 秒）
  ];
  var USE_TTS = false;     // 裝置語音旁白：目前關閉（之後若有配音檔會直接混進影片）
  var END_HOLD = 1000;     // 影片播完後停在最後畫面的毫秒數，讓最後一句字幕看得完
  var BEATS = [2.99, 5.36, 8.05, 11.0];

  var ls = null; try { ls = window.localStorage; } catch (e) {}
  function get(k) { try { return ls ? ls.getItem(k) : null; } catch (e) { return null; } }
  function put(k, v) { try { if (ls) ls.setItem(k, v); } catch (e) {} }
  var forced = /[?&]intro=1(&|$)/.test(location.search);

  var el = null, video = null, subEl = null, fx = null, state = "idle", raf = 0, spoken = -1, subIdx = -1;
  var voiceOn = get(K_VOICE) !== "0", muted = get(K_MUTE) === "1", subOn = get(K_SUB) !== "0";
  var lastT = -1, stallAt = 0, endWait = 0, closing = false;

  function isPhone() {
    var ua = navigator.userAgent || "";
    if (/iPhone|iPod|Android.+Mobile|Windows Phone/i.test(ua)) return true;
    var touch = (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
    return touch && Math.min(screen.width, screen.height) < 600;
  }
  function pickSrc() {
    var c = navigator.connection || {}, px = Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1);
    var small = c.saveData || /(^|-)2g$/.test(c.effectiveType || "") || isPhone() || px < 1400;
    return BASE + (small ? "intro-720.mp4" : "intro-1080.mp4") + "?v=" + VER;
  }
  function gateOpen() { return !!document.getElementById("mf-gate"); }

  // ---------- 旁白（裝置語音）----------
  var TTS = window.speechSynthesis || null, zhVoice = null;
  function pickVoice() {
    if (!TTS) return null;
    var vs = TTS.getVoices() || [], best = null, score = -1;
    vs.forEach(function (v) {
      var l = (v.lang || "").toLowerCase().replace("_", "-"), s = -1;
      if (l === "zh-tw" || l.indexOf("zh-hant") === 0) s = 5; else if (l === "zh-hk") s = 3; else if (l.indexOf("zh") === 0 || l.indexOf("cmn") === 0) s = 2;
      if (s >= 0 && /Mei-Jia|美佳|Hanhan|HsiaoChen|曉臻|Google 國語|Yating/i.test(v.name)) s += 2;
      if (s > score) { score = s; best = v; }
    });
    return best;
  }
  if (TTS) { zhVoice = pickVoice(); try { TTS.addEventListener("voiceschanged", function () { zhVoice = pickVoice(); }); } catch (e) {} }
  function speak(i) {
    if (!USE_TTS || !TTS || !voiceOn || muted) return;
    if (!zhVoice) zhVoice = pickVoice();
    if (!zhVoice) return;   // 沒有中文語音：只顯示字幕
    try {
      var u = new SpeechSynthesisUtterance(LINES[i][2].replace("｜", "").replace("SWT MindFlow", "S W T Mind Flow"));
      u.voice = zhVoice; u.lang = zhVoice.lang || "zh-TW"; u.rate = 1.14; u.pitch = 1.0; u.volume = 1;
      TTS.speak(u);
    } catch (e) {}
  }
  function hush() { try { if (TTS) TTS.cancel(); } catch (e) {} }

  // ---------- 版面：直式畫面用完整顯示（不裁掉品牌字），橫式鋪滿 ----------
  function layout() {
    if (!el) return;
    var w = window.innerWidth, h = window.innerHeight, contain = w / h < 1.25;
    el.classList.toggle("it-contain", contain);
    var vh = contain ? w * 9 / 16 : h, bar = contain ? Math.max(0, (h - vh) / 2) : 0;
    el.style.setProperty("--it-bar", bar + "px");
    // 字幕：直式放在影片下方的空白處；橫式放在畫面下方
    var b = contain ? (bar > 110 ? Math.max(14, bar / 2 - 28) : bar + vh * 0.06) : h * 0.075;
    el.style.setProperty("--it-sub-b", Math.round(b) + "px");
    if (fx) fx.resize(w, h, contain ? vh / h : 1);
  }

  // ---------- Three.js 粒子層（輕量，GPU 計算位置）----------
  function loadThree(cb) {
    if ((window.MF_SAFE || 0) >= 2) return;
    if (window.THREE) return cb();
    var src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    var old = document.querySelector('script[src="' + src + '"]');
    if (old) { old.addEventListener("load", cb); return; }
    var s = document.createElement("script"); s.src = src; s.async = true; s.onload = cb; s.onerror = function () {}; document.head.appendChild(s);
  }
  function makeFx(canvas) {
    var T = window.THREE; if (!T || !canvas) return null;
    var r;
    try { r = new T.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false, powerPreference: "low-power" }); } catch (e) { return null; }
    var dpr = Math.min(window.devicePixelRatio || 1, isPhone() ? 1.5 : 2);
    r.setPixelRatio(dpr); r.setClearColor(0x000000, 0);
    var n = isPhone() ? 260 : (Math.min(screen.width, screen.height) < 900 ? 420 : 650);
    var g = new T.BufferGeometry(), seed = new Float32Array(n * 4), col = new Float32Array(n * 3), pos = new Float32Array(n * 3);
    var pal = [[1, .8, .45], [1, .86, .6], [.6, .85, 1], [.75, .6, 1], [.18, .88, .81], [1, .29, .23], [1, .78, .23], [1, 1, 1], [.54, .36, 1]];
    for (var i = 0; i < n; i++) { for (var j = 0; j < 4; j++) seed[i * 4 + j] = Math.random(); var p = pal[i % 4 === 0 ? 4 + (i >> 2) % 5 : (i % 4) - 1]; col[i * 3] = p[0]; col[i * 3 + 1] = p[1]; col[i * 3 + 2] = p[2]; }
    g.setAttribute("position", new T.BufferAttribute(pos, 3)); g.setAttribute("aSeed", new T.BufferAttribute(seed, 4)); g.setAttribute("aCol", new T.BufferAttribute(col, 3));
    var U = { uClock: { value: 0 }, uBurst: { value: 0 }, uRing: { value: 0 }, uAspect: { value: 1 }, uPx: { value: dpr }, uBox: { value: new T.Vector3(1, 1, 0) }, uMouse: { value: new T.Vector2() }, uOn: { value: 0 } };
    var m = new T.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending,
      vertexShader: "attribute vec4 aSeed;attribute vec3 aCol;uniform float uClock,uBurst,uRing,uAspect,uPx,uOn;uniform vec3 uBox;uniform vec2 uMouse;varying vec3 vC;varying float vA;" +
        "void main(){float s1=aSeed.x,s2=aSeed.y,s3=aSeed.z,s4=aSeed.w;" +
        "float y=mod(s2*2.2+uClock*(.015+.04*s3),2.2)-1.1;float x=(s1*2.-1.)*1.1+sin(uClock*.35+s4*6.283)*.04;vec2 p=vec2(x,y);" +
        "vec2 d=p/(length(p)+.05);p+=d*uBurst*(.12+.3*s3);" +
        "float a=s4*6.2831+uClock*(.22+.1*s2);vec2 ring=vec2(cos(a)*.62*uBox.x,uBox.z+sin(a)*.3*uBox.y);float inR=step(.55,s3);p=mix(p,ring+vec2(0.,(s2-.5)*.03),uRing*inR);" +
        "p+=uMouse*.025*(s3-.4);gl_Position=vec4(p,0.,1.);" +
        "gl_PointSize=uPx*(1.6+4.2*s3*s3)*(1.+uBurst*.9+uRing*inR*.6);vC=aCol;" +
        "vA=uOn*(.25+.6*s1)*(.55+.45*sin(uClock*(1.+3.*s2)+s4*20.))*(1.+uBurst*1.5)*(1.-.5*uRing*(1.-inR));}",
      fragmentShader: "varying vec3 vC;varying float vA;void main(){vec2 c=gl_PointCoord-.5;float d=length(c)*2.;if(d>1.)discard;float a=exp(-d*d*4.)*.85+exp(-d*d*30.)*.5;gl_FragColor=vec4(vC*a*vA,1.);}"
    });
    var pts = new T.Points(g, m); pts.frustumCulled = false;
    var scene = new T.Scene(); scene.add(pts); var cam = new T.Camera();
    var mouse = { x: 0, y: 0 };
    function mv(e) { var p = e.touches ? e.touches[0] : e; if (!p) return; mouse.x = p.clientX / window.innerWidth * 2 - 1; mouse.y = -(p.clientY / window.innerHeight * 2 - 1); }
    window.addEventListener("pointermove", mv, { passive: true });
    return {
      resize: function (w, h, boxH) { r.setSize(w, h, false); U.uAspect.value = w / h; U.uBox.value.set(1, boxH, (0.5 - 0.39) * 2 * boxH); },
      frame: function (t, clock) {
        var b = 0; BEATS.forEach(function (x) { if (t >= x) b += Math.exp(-(t - x) * 3.2); });
        U.uBurst.value = Math.min(1.2, b); U.uClock.value = clock;
        var rr = (t - 11.2) / 1.2; rr = rr < 0 ? 0 : rr > 1 ? 1 : rr; U.uRing.value = rr * rr * (3 - 2 * rr);
        U.uOn.value = Math.min(1, U.uOn.value + 0.03);
        U.uMouse.value.x += (mouse.x - U.uMouse.value.x) * 0.05; U.uMouse.value.y += (mouse.y - U.uMouse.value.y) * 0.05;
        r.render(scene, cam);
      },
      dispose: function () { window.removeEventListener("pointermove", mv); try { g.dispose(); m.dispose(); r.dispose(); r.forceContextLoss(); } catch (e) {} }
    };
  }

  // ---------- 播放器 ----------
  function btnLabels() {
    if (!el) return;
    var bm = el.querySelector('[data-it="mute"]'), bv = el.querySelector('[data-it="voice"]'), bs = el.querySelector('[data-it="sub"]');
    bs.textContent = subOn ? "字幕 開" : "字幕 關"; bs.setAttribute("aria-pressed", subOn ? "true" : "false"); bs.title = subOn ? "關閉字幕" : "開啟字幕"; bs.style.opacity = subOn ? "1" : ".6";
    el.classList.toggle("it-nosub", !subOn); bv.hidden = !USE_TTS;
    bm.textContent = muted ? "🔇" : "🔊"; bm.setAttribute("aria-label", muted ? "開啟聲音" : "關閉聲音"); bm.title = bm.getAttribute("aria-label");
    bv.textContent = voiceOn ? "💬 旁白" : "💬 旁白關"; bv.setAttribute("aria-pressed", voiceOn ? "true" : "false"); bv.title = voiceOn ? "關閉旁白語音（字幕保留）" : "開啟旁白語音"; bv.style.opacity = voiceOn ? "1" : ".6";
  }
  function open(autoPlay) {
    if (el) return;
    markSession();
    closing = false; state = "ready"; spoken = -1; subIdx = -1; lastT = -1; endWait = 0;
    el = document.createElement("div"); el.id = "mf-intro"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "SWT MindFlow 序章動畫");
    el.className = "it-ready";
    el.innerHTML = '<video playsinline webkit-playsinline preload="auto" disablepictureinpicture disableremoteplayback poster="' + BASE + 'poster.jpg?v=' + VER + '"></video>' +
      '<canvas class="it-fx" aria-hidden="true"></canvas><div class="it-sub" aria-live="polite"></div>' +
      '<div class="it-start"><div class="it-kicker">SWT MINDFLOW ・ 序章</div><button class="it-go" type="button" data-it="go" aria-label="開啟序章動畫"></button>' +
      '<div class="it-title">天地初開・智慧學院誕生</div><div class="it-hint">🔊 建議開啟聲音・約 15 秒</div></div>' +
      '<div class="it-bar"><button type="button" data-it="mute"></button><button type="button" data-it="voice"></button><button type="button" data-it="sub"></button><button type="button" class="it-skip" data-it="skip">略過動畫 ⏭</button></div>';
    document.body.appendChild(el);
    video = el.querySelector("video"); subEl = el.querySelector(".it-sub");
    video.muted = muted; video.src = pickSrc();
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", function () { close(); });
    el.addEventListener("click", onClick);
    btnLabels(); layout(); replayBtn();
    loadThree(function () { if (!el || fx) return; fx = makeFx(el.querySelector(".it-fx")); layout(); });
    if (autoPlay) play(); else { try { video.load(); } catch (e) {} setTimeout(function () { var g = el && el.querySelector(".it-go"); if (g) try { g.focus({ preventScroll: true }); } catch (e) {} }, 300); }
  }
  function onClick(e) {
    var b = e.target.closest ? e.target.closest("[data-it]") : null, act = b ? b.getAttribute("data-it") : "";
    if (act === "skip") { e.stopPropagation(); return close(); }
    if (act === "mute") { muted = !muted; put(K_MUTE, muted ? "1" : "0"); if (video) video.muted = muted; if (muted) hush(); btnLabels(); return; }
    if (act === "sub") { subOn = !subOn; put(K_SUB, subOn ? "1" : "0"); btnLabels(); return; }
    if (act === "voice") { voiceOn = !voiceOn; put(K_VOICE, voiceOn ? "1" : "0"); if (!voiceOn) hush(); btnLabels(); return; }
    if (state === "ready") play();   // 開始畫面任何地方都能開始
  }
  function play() {
    if (!el || state === "playing") return;
    state = "playing"; el.classList.remove("it-ready"); el.classList.add("it-playing");
    try { video.currentTime = 0; } catch (e) {}
    var p = video.play();
    if (p && p.catch) p.catch(function () {   // 有聲播放被擋 → 改靜音播放
      video.muted = true; muted = true; btnLabels();
      var p2 = video.play(); if (p2 && p2.catch) p2.catch(function () { close(); });
    });
    // 在點擊當下就說第一句，iOS 才允許語音
    hush(); spoken = 0; speak(0);
    stallAt = performance.now();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    if (!el) return;
    raf = requestAnimationFrame(tick);
    var t = video.currentTime || 0;
    if (state === "playing") {
      if (t !== lastT) { lastT = t; stallAt = now; }
      else if (now - stallAt > 9000 && !video.paused) { close(); return; }   // 網路卡住太久就直接進登入，不擋住玩家
      for (var i = spoken + 1; i < LINES.length; i++) { if (t >= LINES[i][0]) { spoken = i; speak(i); } else break; }
      showSub(t);
    }
    if (fx) fx.frame(state === "ending" ? DUR : t, now / 1000);
  }
  function showSub(t) {
    var si = -1; for (var k = 0; k < LINES.length; k++) if (t >= LINES[k][0] && t < LINES[k][1]) si = k;
    if (si === subIdx) return;
    subIdx = si; subEl.classList.remove("on");
    if (si >= 0) {
      // 「｜」是窄螢幕的換行點：寬螢幕一行顯示；放不下時在逗號處換行，不會只剩一兩個字掉到第二行
      var parts = LINES[si][2].split("｜"); subEl.innerHTML = "";
      parts.forEach(function (p, i) { var sp = document.createElement("span"); sp.textContent = p; if (i) sp.className = "it-br"; subEl.appendChild(sp); });
      subEl.classList.toggle("it-wrap", subEl.scrollWidth > subEl.parentNode.clientWidth * 0.92 || window.innerWidth < 600 && LINES[si][2].length > 17);
      void subEl.offsetWidth; subEl.classList.add("on");
    }
  }
  function onEnded() {
    if (state !== "playing") return;
    state = "ending"; put(K_SEEN, String(Date.now()));
    // 最後一句旁白說完再進登入（最多等 3.5 秒）
    var t0 = Date.now();
    (function wait() {
      if (!el || closing) return;
      var talking = USE_TTS && TTS && voiceOn && !muted && (TTS.speaking || TTS.pending);
      if ((talking && Date.now() - t0 < 3500) || Date.now() - t0 < END_HOLD) { endWait = setTimeout(wait, 100); return; }
      close();
    })();
  }
  function close() {
    if (!el || closing) return;
    closing = true; clearTimeout(endWait); hush(); put(K_SEEN, String(Date.now()));
    var node = el; node.classList.add("it-out");
    try { video.pause(); } catch (e) {}
    setTimeout(function () {
      cancelAnimationFrame(raf);
      if (fx) { fx.dispose(); fx = null; }
      try { video.removeAttribute("src"); video.load(); } catch (e) {}
      if (node.parentNode) node.parentNode.removeChild(node);
      if (el === node) { el = null; video = null; subEl = null; }
      state = "idle"; closing = false; replayBtn();
      var f = document.querySelector("#mf-gate input, #mf-gate button"); if (f) try { f.focus({ preventScroll: true }); } catch (e) {}
    }, 820);
  }

  // ---------- 登入畫面上的「重播序章」 ----------
  var rb = null;
  function replayBtn() {
    if (!document.body) return;
    if (!rb) {
      rb = document.createElement("button"); rb.id = "mf-intro-replay"; rb.type = "button"; rb.textContent = "🎬 重播序章"; rb.setAttribute("aria-label", "重新播放序章動畫");
      rb.addEventListener("click", function () { open(true); });
      document.body.appendChild(rb);
    }
    rb.classList.toggle("on", gateOpen() && !el);
  }

  document.addEventListener("keydown", function (e) {
    if (!el) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if ((e.key === "Enter" || e.key === " ") && state === "ready" && (!document.activeElement || document.activeElement === document.body || document.activeElement.getAttribute("data-it") === "go")) { e.preventDefault(); play(); }
  });
  document.addEventListener("visibilitychange", function () {
    if (!el || state !== "playing") return;
    if (document.hidden) { try { video.pause(); if (TTS) TTS.pause(); } catch (e) {} }
    else { try { var p = video.play(); if (p && p.catch) p.catch(function () {}); if (TTS) TTS.resume(); } catch (e) {} stallAt = performance.now(); }
  });
  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", function () { setTimeout(layout, 250); });

  var SS_KEY = "swt-intro-session";   // sessionStorage：這次使用（分頁／App 啟動）是否已播過
  function sessionPlayed() { try { return sessionStorage.getItem(SS_KEY) === "1"; } catch (e) { return false; } }
  function markSession() { try { sessionStorage.setItem(SS_KEY, "1"); } catch (e) {} }
  // 記住上一個畫面是在遊戲裡（in）還是在登入畫面（out）：從 in 變成登入畫面＝登出，要再播
  var AUTH_KEY = "swt-intro-where";
  function where() { try { return sessionStorage.getItem(AUTH_KEY) || ""; } catch (e) { return ""; } }
  function noteWhere() { try { sessionStorage.setItem(AUTH_KEY, gateOpen() ? "out" : "in"); } catch (e) {} }
  function boot() {
    replayBtn();
    var oauth = /access_token=|error=/.test(location.hash);
    var loggedOut = gateOpen() && where() === "in";
    if (forced || (!oauth && (!sessionPlayed() || loggedOut))) open(false);
    noteWhere();
    // 開場入口之後才出現或被移除時（登入、訪客進入、登出），同步「重播序章」按鈕與目前位置
    try { new MutationObserver(function () { replayBtn(); noteWhere(); }).observe(document.body, { childList: true }); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 0); });
  else setTimeout(boot, 0);

  window.MFIntro = { play: function () { if (el) { if (state === "ready") play(); } else open(true); }, close: close, isOpen: function () { return !!el; } };
})();
