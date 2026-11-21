/*!
 * MindFlow 遊戲成績回報 SDK v1
 * 讓部署在 GitHub Pages、Render 的遊戲，把成績回傳給「SWT MindFlow 身心智慧學院」，換成經驗值與智慧幣。
 *
 * 使用方式（在遊戲的 HTML 加一行）：
 *   <script src="https://jackyhuang666.github.io/222/mindflow-sdk.js"></script>
 *
 * 遊戲結束時呼叫：
 *   MindFlow.finish({ score: 85, maxScore: 100, completed: true });
 *     score / maxScore：分數與滿分（平台用比例計算獎勵）
 *     completed      ：是否完成這一關
 *     durationSec    ：遊玩秒數（可省略，SDK 會從頁面開啟時自動計時）
 *     accuracy       ：正確率 0–1（沒有分數概念的遊戲可改用這個）
 *     level          ：達到第幾小關（選填）
 *
 * 結算畫面的「返回學院」按鈕：
 *   MindFlow.backToAcademy();      // 自己的按鈕呼叫這個
 *   MindFlow.showReturnButton();   // 或讓 SDK 自動在畫面右下角放一顆按鈕
 *
 * 其他：
 *   MindFlow.fromAcademy  → 是否從學院開啟（直接打開遊戲網址時為 false，finish 不會有任何作用，遊戲照常可玩）
 *   MindFlow.start()      → 重新開始計時（例如按下「再玩一次」時）
 */
(function (w) {
  "use strict";
  var KEY = "mf-sdk-ctx-v1", q, ctx = null;
  try { q = new URLSearchParams(w.location.search); } catch (e) { q = null; }
  if (q && q.get("mf_ticket")) {
    ctx = { game: +q.get("mf_game") || null, ticket: q.get("mf_ticket"), ret: q.get("mf_return") || "" };
    try { w.sessionStorage.setItem(KEY, JSON.stringify(ctx)); } catch (e) {}
  } else {
    try { ctx = JSON.parse(w.sessionStorage.getItem(KEY) || "null"); } catch (e) { ctx = null; }   // 遊戲內換頁後仍記得
  }
  var t0 = Date.now(), last = null;

  function b64(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function opener() { try { return w.opener && !w.opener.closed ? w.opener : null; } catch (e) { return null; } }

  function finish(r) {
    r = r || {};
    if (!ctx) return { fromAcademy: false, sent: false };
    last = {
      type: "mindflow:result", v: 1, game: ctx.game, ticket: ctx.ticket,
      score: +r.score || 0, maxScore: +r.maxScore || 0, completed: !!r.completed,
      durationSec: r.durationSec != null ? Math.round(+r.durationSec) : Math.round((Date.now() - t0) / 1000),
      accuracy: r.accuracy != null ? Math.max(0, Math.min(1, +r.accuracy)) : null,
      level: r.level != null ? r.level : null
    };
    var o = opener(), sent = false;
    if (o) { try { o.postMessage(last, "*"); sent = true; } catch (e) {} }
    return { fromAcademy: true, sent: sent };
  }

  function backToAcademy() {
    var o = opener();
    if (o) { try { o.focus(); } catch (e) {} w.close(); return true; }   // 學院頁面還開著：關掉遊戲分頁，回到學院
    if (ctx && ctx.ret) {                                                  // 學院頁面已關閉：帶著成績回到學院
      w.location.href = ctx.ret.split("#")[0] + (last ? "#mf-result=" + b64(JSON.stringify(last)) : "");
      return true;
    }
    return false;
  }

  function showReturnButton(label) {
    if (!ctx || w.document.getElementById("mf-return-btn")) return;
    var b = w.document.createElement("button");
    b.id = "mf-return-btn"; b.type = "button"; b.textContent = label || "返回學院領取獎勵";
    b.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:12px 20px;border-radius:999px;border:1px solid #ffe7a6;" +
      "background:linear-gradient(180deg,#ffe08a,#f2b33d);color:#3a2300;font:700 16px/1 'Noto Sans TC',sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35);cursor:pointer";
    b.onclick = backToAcademy;
    w.document.body.appendChild(b);
  }

  w.MindFlow = {
    version: 1,
    fromAcademy: !!ctx,
    game: ctx ? ctx.game : null,
    start: function () { t0 = Date.now(); last = null; },
    finish: finish,
    backToAcademy: backToAcademy,
    showReturnButton: showReturnButton
  };
})(window);
