/* SWT MindFlow — 遊戲頁的 3D 防護（v112）
 * MFGLGuard.watch(renderer)：
 *   - 3D 被系統回收（記憶體不足）時顯示提示，系統還回來時 three.js 自己重建畫面，提示自動消失；等太久可以按「重新載入」
 *   - 離開頁面（返回學院、再玩一次、下一關）時立刻釋放 3D 繪圖，不用等瀏覽器慢慢回收
 * 另外把頁面上的 JS 錯誤轉傳給學院（diag.js 的閃退紀錄）。直接開啟遊戲網頁時只是不轉傳，其他照常。
 */
(function () {
  "use strict";
  var inFrame = false; try { inFrame = window.parent !== window; } catch (e) {}
  function tell(kind, msg) {
    if (!inFrame) return;
    try { window.parent.postMessage({ type: "mf-diag", kind: kind, msg: String(msg || "").slice(0, 400), where: location.pathname.split("/").slice(-2).join("/") + location.search }, location.origin); } catch (e) {}
  }
  addEventListener("error", function (e) {
    if (e.target && e.target !== window && e.target.tagName) return;
    tell("error", (e.message || "未知錯誤") + (e.filename ? "（" + String(e.filename).split("/").pop().split("?")[0] + ":" + e.lineno + "）" : ""));
  }, true);
  addEventListener("unhandledrejection", function (e) { var r = e.reason, m = r && r.message ? r.message : String(r); if (!/Failed to fetch|NetworkError|Load failed/.test(m)) tell("error", m); });

  var leaving = false;
  function watch(renderer) {
    if (!renderer || !renderer.domElement) return;
    var cv = renderer.domElement, box = null, timer = 0;
    addEventListener("pagehide", function () { leaving = true; try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) {} });
    cv.addEventListener("webglcontextlost", function (e) {
      e.preventDefault(); if (leaving) return;
      tell("gl-lost", "遊戲 3D 被系統回收");
      if (box) return;
      box = document.createElement("div");
      box.setAttribute("style", "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(16,26,40,.84);color:#fff;font:16px/1.7 system-ui,sans-serif;text-align:center;padding:24px");
      box.innerHTML = '<div><div style="font-size:34px">🧠</div><b>裝置記憶體不足，3D 畫面被系統暫停了</b><br>正在等待恢復……進度不會遺失。<br><small style="opacity:.8">建議關掉其他 App 或分頁</small><br><br>' +
        '<button type="button" style="font:inherit;padding:10px 20px;border:0;border-radius:12px;background:#f4cf73;color:#3a2a00;font-weight:700;display:none">重新載入</button></div>';
      document.body.appendChild(box);
      var btn = box.querySelector("button"); btn.onclick = function () { location.reload(); };
      clearTimeout(timer); timer = setTimeout(function () { if (box) btn.style.display = ""; }, 4000);
    });
    cv.addEventListener("webglcontextrestored", function () { clearTimeout(timer); if (box) { box.remove(); box = null; } });
  }
  window.MFGLGuard = { watch: watch, tell: tell };
})();
