/* SWT MindFlow 身心智慧學院 — 閃退紀錄（MFDiag）
 * 記錄玩家裝置上的 JS 錯誤、3D 繪圖被系統回收、記憶體偏高，以及「疑似閃退」（頁面在使用中被系統關掉、下次開啟才發現）。
 * - 每筆紀錄附上裝置資訊、記憶體與最近 15 個操作（麵包屑），方便找出是哪個畫面出問題
 * - 紀錄先存在這台裝置（swt-diag-log，不是 mf- 開頭，不會進雲端存檔），有 Supabase crash_logs 資料表時自動上傳
 * - 最高管理者在「遊戲授權中心 → 🩺 閃退紀錄」查看
 */
(function () {
  "use strict";
  var VER = "v112", KEY = "swt-diag-log", HB = "swt-diag-hb", MAX = 60;
  var sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  var crashedLast = false, crumbs = [], memWarned = false, upState = "idle", upErr = "", upTimer = 0;
  var ls = null; try { ls = window.localStorage; } catch (e) {}

  function env() {
    var m = performance.memory;
    return { ua: navigator.userAgent.slice(0, 200), dm: navigator.deviceMemory || null, scr: screen.width + "x" + screen.height,
      vp: innerWidth + "x" + innerHeight, dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
      heap: m ? Math.round(m.usedJSHeapSize / 1e6) : null, heapMax: m ? Math.round(m.jsHeapSizeLimit / 1e6) : null,
      up: Math.round(performance.now() / 1000), ver: VER, tier: window.MF_TIER || "", touch: navigator.maxTouchPoints || 0 };
  }
  function player() { try { return (window.MFDiagPlayer && window.MFDiagPlayer()) || (ls && ls.getItem("mf-user")) || ""; } catch (e) { return ""; } }
  function load() { try { return JSON.parse((ls && ls.getItem(KEY)) || "[]") || []; } catch (e) { return []; } }
  function save(a) { if (!ls) return; a = a.slice(-MAX); for (var k = 0; k < 3; k++) { try { ls.setItem(KEY, JSON.stringify(a)); return; } catch (e) { a = a.slice(Math.ceil(a.length / 2)); } } }

  function log(kind, msg, extra, at) {
    var a = load(), rec = { id: sid + "-" + a.length + "-" + Date.now().toString(36), t: at || Date.now(), sid: sid, kind: kind, msg: String(msg || "").slice(0, 500),
      p: player(), env: env(), crumbs: crumbs.slice(-15), x: extra || null, up: 0 };
    var last = a[a.length - 1];
    if (last && last.kind === kind && last.msg === rec.msg && rec.t - last.t < 10000) { last.n = (last.n || 1) + 1; save(a); return; }   // 同一個錯誤連續發生只記一筆
    a.push(rec); save(a); scheduleUpload();
  }
  function crumb(s) {
    var d = new Date(); crumbs.push(("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ":" + ("0" + d.getSeconds()).slice(-2) + " " + String(s).slice(0, 80));
    if (crumbs.length > 30) crumbs.shift();
  }

  // ---- 心跳：使用中被系統關掉（iOS 記憶體不足、Android 分頁當掉）不會觸發 pagehide，下次開啟時就能發現 ----
  var hb = { sid: sid, t: Date.now(), vis: document.visibilityState === "visible", clean: false };
  function beat() {
    hb.t = Date.now(); hb.vis = document.visibilityState === "visible"; hb.crumbs = crumbs.slice(-15); hb.env = env(); hb.p = player();
    try { ls && ls.setItem(HB, JSON.stringify(hb)); } catch (e) {}
    var m = performance.memory;
    if (m && !memWarned && m.usedJSHeapSize > m.jsHeapSizeLimit * 0.8) { memWarned = true; log("mem", "JS 記憶體使用超過 80%（" + Math.round(m.usedJSHeapSize / 1e6) + " / " + Math.round(m.jsHeapSizeLimit / 1e6) + " MB）"); }
  }
  try {
    var prev = JSON.parse((ls && ls.getItem(HB)) || "null");
    if (prev && prev.sid && !prev.clean && prev.vis && Date.now() - prev.t < 10 * 60000) {
      crumbs = (prev.crumbs || []).slice();
      var a0 = load(), r0 = { id: prev.sid + "-crash", t: prev.t, sid: prev.sid, kind: "crash", msg: "疑似閃退：上次使用中頁面突然關閉（最後操作後 " + Math.max(0, Math.round((Date.now() - prev.t) / 1000)) + " 秒才重新開啟）",
        p: prev.p || player(), env: prev.env || env(), crumbs: crumbs.slice(-15), x: null, up: 0 };
      if (!a0.some(function (r) { return r.id === r0.id; })) { a0.push(r0); save(a0); }
      crashedLast = true;
      crumbs = [];
    }
  } catch (e) {}
  crumb("開啟頁面");
  beat(); setInterval(beat, 5000);
  addEventListener("pagehide", function () { hb.clean = true; beat(); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") { hb.clean = false; crumb("回到頁面"); } else crumb("切到背景"); beat(); });

  // ---- 錯誤 ----
  addEventListener("error", function (e) {
    if (e.target && e.target !== window && e.target.tagName) return;   // 圖片、腳本載入失敗另有處理
    var where = e.filename ? String(e.filename).replace(location.origin, "").split("?")[0] + ":" + e.lineno : "";
    log("error", (e.message || "未知錯誤") + (where ? "（" + where + "）" : ""), e.error && e.error.stack ? { stack: String(e.error.stack).slice(0, 800) } : null);
  }, true);
  addEventListener("unhandledrejection", function (e) {
    var r = e.reason, m = r && r.message ? r.message : String(r);
    if (/Failed to fetch|NetworkError|Load failed|網路/.test(m)) return;   // 斷網不算閃退
    log("rejection", m, r && r.stack ? { stack: String(r.stack).slice(0, 800) } : null);
  });
  // 遊戲覆蓋層（iframe）裡的錯誤與繪圖回收由 character/gl-guard.js 轉傳過來
  addEventListener("message", function (e) {
    var d = e.data; if (!d || d.type !== "mf-diag" || e.origin !== location.origin) return;
    log(d.kind === "gl-lost" ? "gl-lost" : "error", String(d.msg || "").slice(0, 400), { where: String(d.where || "").slice(0, 80) });
  });
  // 點擊麵包屑
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest("button,a,[data-tab],[data-go],[role=tab],.station,.plate") : null; if (!el) return;
    var name = el.id ? "#" + el.id : el.getAttribute("data-tab") ? "分頁:" + el.getAttribute("data-tab") : el.getAttribute("data-go") ? "選單:" + el.getAttribute("data-go") : "";
    var txt = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 18);
    crumb("點 " + (name ? name + " " : "") + txt);
  }, true);

  // ---- 上傳到 Supabase（public.crash_logs） ----
  function scheduleUpload() { clearTimeout(upTimer); upTimer = setTimeout(upload, 3000); }
  function upload() {
    if (upState === "no-table" || !window.MFCloud || !MFCloud.sbPost) return;
    var a = load(), rows = a.filter(function (r) { return !r.up; }).slice(-20); if (!rows.length) return;
    upState = "sending";
    MFCloud.sbPost("/rest/v1/crash_logs", rows.map(function (r) {
      return { created_at: new Date(r.t).toISOString(), sid: r.sid, player: (r.p || "").slice(0, 40), kind: r.kind, msg: r.msg.slice(0, 500), info: { env: r.env, crumbs: r.crumbs, x: r.x, n: r.n || 1, rid: r.id } };
    })).then(function () {
      var ids = {}; rows.forEach(function (r) { ids[r.id] = 1; }); var b = load(); b.forEach(function (r) { if (ids[r.id]) r.up = 1; }); save(b); upState = "ok"; upErr = "";
    }).catch(function (e) { upErr = e && e.message || String(e); upState = /crash_logs|relation|schema cache|404/i.test(upErr) ? "no-table" : "err"; });
  }
  setTimeout(upload, 8000);

  // ---- 遊戲授權中心「🩺 閃退紀錄」 ----
  var SQL = [
    "-- 身心智慧學院：閃退紀錄資料表（在 Supabase → SQL Editor 貼上執行一次）",
    "create table if not exists public.crash_logs (",
    "  id bigint generated always as identity primary key,",
    "  created_at timestamptz not null default now(),",
    "  user_id uuid default auth.uid(),",
    "  sid text, player text, kind text,",
    "  msg text check (char_length(msg) <= 600),",
    "  info jsonb check (pg_column_size(info) < 16000)",
    ");",
    "alter table public.crash_logs enable row level security;",
    "drop policy if exists \"crash insert\" on public.crash_logs;",
    "create policy \"crash insert\" on public.crash_logs for insert to anon, authenticated with check (true);",
    "drop policy if exists \"crash read\" on public.crash_logs;",
    "create policy \"crash read\" on public.crash_logs for select to authenticated",
    "  using (exists (select 1 from public.members m where m.user_id = auth.uid() and m.role = 'SUPER_ADMIN'));",
    "drop policy if exists \"crash delete\" on public.crash_logs;",
    "create policy \"crash delete\" on public.crash_logs for delete to authenticated",
    "  using (exists (select 1 from public.members m where m.user_id = auth.uid() and m.role = 'SUPER_ADMIN'));"
  ].join("\n");
  var KIND = { crash: ["💥", "疑似閃退"], "gl-lost": ["🖼️", "3D 畫面被系統回收"], error: ["⚠️", "程式錯誤"], rejection: ["⚠️", "程式錯誤"], mem: ["🧠", "記憶體偏高"], test: ["🧪", "測試紀錄"] };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function devName(ua, e) {
    ua = ua || ""; var d = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) || (/Macintosh/.test(ua) && e && e.touch > 1) ? "iPad" : /Android.+Mobile/.test(ua) ? "Android 手機" : /Android/.test(ua) ? "Android 平板" : "電腦";
    var b = /CriOS|Chrome\//.test(ua) && !/Edg/.test(ua) ? "Chrome" : /Edg/.test(ua) ? "Edge" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "";
    return d + (b ? "・" + b : "");
  }
  function fmtT(t) { var d = new Date(t); return (d.getMonth() + 1) + "/" + d.getDate() + " " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  function norm(r, cloud) {   // 雲端與本機紀錄轉成同一種格式
    if (cloud) { var i = r.info || {}; return { t: new Date(r.created_at).getTime(), kind: r.kind, msg: r.msg, p: r.player, env: i.env || {}, crumbs: i.crumbs || [], x: i.x, n: i.n || 1, cloud: 1, cid: r.id }; }
    return r;
  }
  var view = { rows: null, src: "local", err: "", filter: "all" };
  function fetchCloud(el) {
    if (!window.MFCloud || !MFCloud.user || !MFCloud.user() || !MFCloud.sbGet) { view.src = "local"; view.err = "尚未登入雲端，只顯示這台裝置的紀錄。"; return draw(el); }
    view.err = "讀取中……"; draw(el);
    MFCloud.sbGet("/rest/v1/crash_logs?select=*&order=created_at.desc&limit=300").then(function (rows) {
      view.rows = (rows || []).map(function (r) { return norm(r, true); }); view.src = "cloud"; view.err = ""; upState = upState === "no-table" ? "idle" : upState; draw(el);
    }).catch(function (e) {
      var m = e && e.message || String(e); view.src = "local";
      view.err = /crash_logs|relation|schema cache|404/i.test(m) ? "雲端還沒有 crash_logs 資料表：請複製下方 SQL，到 Supabase → SQL Editor 執行一次。現在先顯示這台裝置的紀錄。" : "讀取雲端失敗：" + m;
      draw(el);
    });
  }
  function draw(el) {
    var rows = view.src === "cloud" && view.rows ? view.rows : load().slice().reverse().map(function (r) { return norm(r); });
    var week = Date.now() - 7 * 864e5, cnt = {}, devs = {};
    rows.forEach(function (r) { if (r.t < week) return; cnt[r.kind] = (cnt[r.kind] || 0) + (r.n || 1); var dn = devName(r.env && r.env.ua, r.env).split("・")[0]; devs[dn] = (devs[dn] || 0) + (r.n || 1); });
    var shown = rows.filter(function (r) { return view.filter === "all" || r.kind === view.filter || (view.filter === "error" && r.kind === "rejection"); }).slice(0, 150);
    var h = '<div class="cert-head"><h3>🩺 閃退紀錄</h3><p class="muted small">自動記錄玩家裝置上的疑似閃退、3D 畫面被系統回收、程式錯誤與記憶體偏高，每筆都附上裝置、記憶體和閃退前的最後操作。紀錄會從玩家裝置上傳到雲端（需要先建立資料表），這裡只有最高管理者看得到。</p></div>';
    h += '<div class="rw-sec"><h4>近 7 天概況　<small class="muted">' + (view.src === "cloud" ? "雲端・全體玩家" : "只有這台裝置") + "</small></h4>" +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0">' +
      ["crash", "gl-lost", "error", "mem"].map(function (k) { var n = (cnt[k] || 0) + (k === "error" ? cnt.rejection || 0 : 0); return '<button class="a-btn sm" data-dg-f="' + k + '"' + (view.filter === k ? ' style="outline:2px solid var(--gold)"' : "") + ">" + KIND[k][0] + " " + KIND[k][1] + " <b>" + n + "</b></button>"; }).join("") +
      '<button class="a-btn sm" data-dg-f="all"' + (view.filter === "all" ? ' style="outline:2px solid var(--gold)"' : "") + ">全部</button></div>" +
      '<p class="muted small">裝置：' + (Object.keys(devs).map(function (k) { return esc(k) + " " + devs[k]; }).join("、") || "近 7 天沒有紀錄 🎉") + "</p>" +
      (view.err ? '<p class="small" style="color:#ffd27a">' + esc(view.err) + "</p>" : "") +
      '<div style="display:flex;flex-wrap:wrap;gap:8px"><button class="a-btn sm" data-dg="reload">🔄 重新整理</button><button class="a-btn sm" data-dg="sql">📋 複製建表 SQL</button><button class="a-btn sm" data-dg="test">🧪 寫一筆測試紀錄</button><button class="a-btn sm" data-dg="clear">🧹 清除這台裝置的紀錄</button>' +
      (view.src === "cloud" ? '<button class="a-btn sm" data-dg="purge">🗑️ 刪除雲端 30 天前的紀錄</button>' : "") + "</div></div>";
    h += '<div class="rw-sec"><h4>紀錄（最新在上，最多 150 筆）</h4>' + (shown.length ? shown.map(function (r, i) {
      var k = KIND[r.kind] || ["•", r.kind], e = r.env || {};
      return '<details style="margin:6px 0;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.06)"><summary style="cursor:pointer;line-height:1.5">' + k[0] + " <b>" + esc(k[1]) + "</b>" + (r.n > 1 ? " ×" + r.n : "") + '　<span class="muted small">' + fmtT(r.t) + "・" + esc(r.p || "未命名") + "・" + esc(devName(e.ua, e)) + (e.heap ? "・JS " + e.heap + "MB" : "") + (e.dm ? "・記憶體 " + e.dm + "GB" : "") + "</span><br><span class=\"small\">" + esc(r.msg) + "</span></summary>" +
        '<div class="small muted" style="margin-top:6px;white-space:pre-wrap;word-break:break-all">' +
        "版本 " + esc(e.ver || "") + "　畫質分級 " + esc(e.tier || "-") + "　螢幕 " + esc(e.scr || "") + " @" + esc(e.dpr || "") + "x　視窗 " + esc(e.vp || "") + "　開啟 " + (e.up != null ? Math.round(e.up / 60) + " 分鐘" : "-") + "\n" +
        (r.x && r.x.where ? "位置：" + esc(r.x.where) + "\n" : "") +
        "最後操作：\n" + (r.crumbs && r.crumbs.length ? esc(r.crumbs.join("\n")) : "（無）") +
        (r.x && r.x.stack ? "\n\n" + esc(r.x.stack) : "") + "\n\n" + esc(e.ua || "") + "</div></details>";
    }).join("") : '<p class="muted">沒有紀錄。</p>') + "</div>";
    el.innerHTML = h;
  }
  function renderAdmin(el) {
    if (!el) return;
    if (!el.__dg) {
      el.__dg = 1;
      el.addEventListener("click", function (e) {
        var f = e.target.closest("[data-dg-f]"), b = e.target.closest("[data-dg]"); if (!f && !b) return;
        e.stopPropagation();
        if (f) { view.filter = f.getAttribute("data-dg-f"); return draw(el); }
        var c = b.getAttribute("data-dg");
        if (c === "reload") { upState = "idle"; upload(); fetchCloud(el); }
        else if (c === "sql") { var done = function () { b.textContent = "✅ 已複製"; }; if (navigator.clipboard) navigator.clipboard.writeText(SQL).then(done, function () { prompt("複製這段 SQL：", SQL); }); else prompt("複製這段 SQL：", SQL); }
        else if (c === "test") { log("test", "最高管理者寫入的測試紀錄"); upState = "idle"; setTimeout(function () { upload(); setTimeout(function () { fetchCloud(el); }, 1500); }, 200); }
        else if (c === "clear") { if (confirm("清除這台裝置上的閃退紀錄？（雲端的不受影響）")) { save([]); draw(el); } }
        else if (c === "purge") {
          if (!confirm("刪除雲端 30 天前的閃退紀錄？")) return;
          MFCloud.sbDelete("/rest/v1/crash_logs?created_at=lt." + new Date(Date.now() - 30 * 864e5).toISOString()).then(function () { fetchCloud(el); }, function (er) { alert("刪除失敗：" + (er && er.message || er)); });
        }
      });
    }
    draw(el); fetchCloud(el);
  }

  window.MFDiag = { crashedLastTime: function () { return crashedLast; }, log: log, crumb: crumb, list: load, renderAdmin: renderAdmin, upload: upload, sql: SQL, state: function () { return { up: upState, err: upErr, sid: sid }; } };
})();
