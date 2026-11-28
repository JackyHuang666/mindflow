/*
 * 自動更新：發現網站有新版本時，自動重新載入成最新版。
 *
 * 怎麼判斷：
 *   index.html 的 <meta name="app-version"> 是這個畫面的版本；根目錄的 version.json 是網站上最新的版本。
 *   兩者不同就代表網站已經更新。每次部署新版時，兩個地方要寫成同一個新值（Claude 工作區用 tools/stamp-version.py 一次改好）。
 *
 * 什麼時候檢查：開啟網頁 3 秒後、從背景切回 App（或分頁）時、每 5 分鐘一次。
 *
 * 不打斷玩家：
 *   ・遊戲覆蓋層（#mfc-lab，迷宮、記憶星球等）開著時先不重新載入，等關閉後下次檢查再更新。
 *   ・正在輸入文字時也先等一下。
 *   ・遊戲進度存在本機（saveP 是即時寫入），重新載入不會遺失。
 *
 * 避免無限重新載入：網址加上 ?_v=新版本 讓瀏覽器略過舊快取；同一個版本在這次使用中只嘗試一次。
 */
(function () {
  var meta = document.querySelector('meta[name="app-version"]');
  var CUR = meta ? meta.getAttribute("content") : "";
  if (!CUR || !window.fetch) return;
  var BASE = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^/]*$/, "") : "./"; })();
  var TRY_KEY = "mf-upd-try", DONE_KEY = "mf-upd-done";
  var busy = false, lastCheck = 0;

  // 重新載入後：把網址上的 ?_v= 拿掉，並提示已更新
  try {
    var u = new URL(location.href);
    if (u.searchParams.has("_v")) { u.searchParams.delete("_v"); history.replaceState(history.state, "", u.pathname + (u.search || "") + u.hash); }
    if (sessionStorage.getItem(DONE_KEY) === CUR) {
      sessionStorage.removeItem(DONE_KEY);
      window.addEventListener("load", function () {
        setTimeout(function () {
          var t = document.getElementById("toast");
          if (t) { t.textContent = "✨ 已更新到最新版本"; t.classList.add("show"); setTimeout(function () { t.classList.remove("show"); }, 3000); }
        }, 1200);
      });
    }
  } catch (e) {}

  function playing() {
    if (document.getElementById("mfc-lab")) return true;   // 遊戲覆蓋層開著
    if (document.getElementById("mf-intro")) return true;  // 序章動畫播放中
    var a = document.activeElement;
    return !!(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable));
  }
  function reloadTo(v) {
    try { sessionStorage.setItem(TRY_KEY, v); sessionStorage.setItem(DONE_KEY, v); } catch (e) {}
    var u = new URL(location.href); u.searchParams.set("_v", v);
    location.replace(u.pathname + u.search + u.hash);
  }
  function check(force) {
    if (busy || document.hidden) return;
    var now = Date.now(); if (!force && now - lastCheck < 30000) return;
    busy = true; lastCheck = now;
    fetch(BASE + "version.json?t=" + now, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      busy = false;
      var v = j && j.v ? String(j.v) : ""; if (!v || v === CUR) return;
      var tried = ""; try { tried = sessionStorage.getItem(TRY_KEY) || ""; } catch (e) {}
      if (tried === v) return;            // 這個版本已經試過一次（網站快取還沒換好），這次使用中不再重試
      if (playing()) return;              // 玩遊戲或輸入中，下次檢查再更新
      reloadTo(v);
    }, function () { busy = false; });
  }
  setTimeout(function () { check(true); }, 3000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) check(true); });
  window.addEventListener("pageshow", function (e) { if (e.persisted) check(true); });
  window.addEventListener("focus", function () { check(false); });
  setInterval(function () { check(false); }, 5 * 60 * 1000);
  window.MFUpdate = { version: CUR, check: function () { check(true); } };
})();
