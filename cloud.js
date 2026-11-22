/* SWT MindFlow 身心智慧學院 — 雲端存檔（Supabase）
 * 登入後，把這台裝置上的學院進度（localStorage 裡 mf- 開頭的資料）存到雲端，換裝置登入就能接著玩。
 * - 只用 Supabase REST API，不需額外函式庫
 * - 資料表：public.saves(user_id, data, updated_at)，RLS 限定每個人只能讀寫自己的那一列
 * - 規則：登入時雲端有存檔 → 以雲端為準；雲端沒有 → 上傳這台裝置的進度
 */
(function () {
  "use strict";
  var SB_URL = "https://dphmvbgkvwnuyhznofav.supabase.co";
  var SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwaG12YmdrdndudXloem5vZmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5MTI0NjQsImV4cCI6MjExMDQ4ODQ2NH0.ok96ObLiWAQglToVBCRn13yv4fsV7RiFgwJ1lTXfCV0";
  var SESS_KEY = "mf-cloud-session", META_KEY = "mf-cloud-meta";
  var LOCAL_ONLY = { "mf-gfx": 1, "mf-hud-hidden": 1, "mf-minipet-pos": 1, "mf-floatbtn-pos": 1, "mf-auth-v1": 1 };   // 和裝置有關的設定不上雲端；學院身分與授權（mf-auth-v1）另外由 MFOrg 同步到共用資料表
  var ls = window.localStorage, rawSet = ls.setItem.bind(ls), rawRemove = ls.removeItem.bind(ls);

  function synced(k) { return typeof k === "string" && k.indexOf("mf-") === 0 && k.indexOf("mf-cloud-") !== 0 && !LOCAL_ONLY[k]; }
  function readJSON(k) { try { return JSON.parse(ls.getItem(k) || "null"); } catch (e) { return null; } }
  function writeJSON(k, v) { try { rawSet(k, JSON.stringify(v)); } catch (e) {} }
  function snapshot() { var o = {}; for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (synced(k)) o[k] = ls.getItem(k); } return o; }
  function applySnapshot(o) {
    var drop = []; for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (synced(k)) drop.push(k); }
    drop.forEach(function (k) { rawRemove(k); });
    Object.keys(o || {}).forEach(function (k) { if (synced(k)) try { rawSet(k, o[k]); } catch (e) {} });
  }

  var sess = readJSON(SESS_KEY), meta = readJSON(META_KEY) || {}, state = "idle", lastErr = "";

  // ---- Supabase REST ----
  function api(path, opt) {
    opt = opt || {}; var h = { apikey: SB_KEY, "Content-Type": "application/json" };
    if (opt.auth && sess) h.Authorization = "Bearer " + sess.access_token;
    Object.keys(opt.headers || {}).forEach(function (k) { h[k] = opt.headers[k]; });
    return fetch(SB_URL + path, { method: opt.method || "GET", headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined, keepalive: !!opt.keepalive })
      .then(function (r) { return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {} if (!r.ok) { var m = (j && (j.msg || j.error_description || j.message || j.error)) || ("HTTP " + r.status); throw new Error(m); } return j; }); });
  }
  function keepSession(j) {
    if (!j || !j.access_token) return false;
    sess = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, user: { id: j.user.id, email: j.user.email } };
    writeJSON(SESS_KEY, sess); return true;
  }
  function fresh() {
    if (!sess) return Promise.reject(new Error("未登入"));
    if (Date.now() < sess.expires_at - 60000) return Promise.resolve();
    return api("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: sess.refresh_token } })
      .then(keepSession).catch(function (e) { if (/invalid|not found|expired/i.test(e.message)) dropSession(); throw e; });
  }
  function dropSession() { sess = null; rawRemove(SESS_KEY); }

  // ---- 同步 ----
  var pushTimer = 0, pushing = false, again = false;
  function schedulePush() { if (!sess || meta.pulling) return; clearTimeout(pushTimer); pushTimer = setTimeout(push, 2500); setState("dirty"); }
  function push(keepalive) {
    if (!sess) return Promise.resolve();
    if (pushing) { again = true; return Promise.resolve(); }
    pushing = true; clearTimeout(pushTimer);
    var now = new Date().toISOString();
    return fresh().then(function () {
      return api("/rest/v1/saves", { method: "POST", auth: true, keepalive: keepalive, headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: { user_id: sess.user.id, data: snapshot(), updated_at: now } });
    }).then(function () { meta = { uid: sess.user.id, syncedAt: now }; writeJSON(META_KEY, meta); setState("ok"); })
      .catch(function (e) { lastErr = e.message; setState("err"); })
      .then(function () { pushing = false; if (again) { again = false; schedulePush(); } });
  }
  function pull(firstLogin) {
    return fresh().then(function () {
      return api("/rest/v1/saves?select=data,updated_at&user_id=eq." + sess.user.id, { auth: true });
    }).then(function (rows) {
      var row = rows && rows[0];
      if (!row) return push();                                    // 雲端還沒有存檔：上傳這台裝置的進度
      var newer = !meta.syncedAt || meta.uid !== sess.user.id || new Date(row.updated_at) > new Date(meta.syncedAt);
      if (firstLogin || newer) {                                  // 雲端比較新：換成雲端進度後重新整理
        applySnapshot(row.data);
        meta = { uid: sess.user.id, syncedAt: row.updated_at }; writeJSON(META_KEY, meta);
        rawSet("mf-cloud-note", "已載入雲端存檔");
        location.reload(); return;
      }
      setState("ok");
    }).catch(function (e) { lastErr = e.message; setState("err"); });
  }

  // 攔截寫入：學院的資料一變動，就排程上傳
  ls.setItem = function (k, v) { rawSet(k, v); if (synced(k)) schedulePush(); };
  ls.removeItem = function (k) { rawRemove(k); if (synced(k)) schedulePush(); };
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden" && state === "dirty") push(true); });
  window.addEventListener("pagehide", function () { if (state === "dirty") push(true); });

  // ---- 登入／註冊／登出 ----
  function login(email, pw) {
    setState("busy");
    return api("/auth/v1/token?grant_type=password", { method: "POST", body: { email: email, password: pw } })
      .then(function (j) { keepSession(j); return pull(true); }).then(function () { return pullOrg(); })
      .catch(function (e) { lastErr = zh(e.message); setState("err"); throw e; });
  }
  function signup(email, pw) {
    setState("busy");
    return api("/auth/v1/signup", { method: "POST", body: { email: email, password: pw } }).then(function (j) {
      if (keepSession(j)) return pull(true).then(function () { return pullOrg(); });
      lastErr = ""; setState("confirm");                          // 需要到信箱點確認連結
    }).catch(function (e) { lastErr = zh(e.message); setState("err"); throw e; });
  }
  function logout() {
    var done = function () {
      if (sess) api("/auth/v1/logout", { method: "POST", auth: true }).catch(function () {});
      dropSession(); rawRemove(META_KEY);
      applySnapshot({});                                          // 清掉這台裝置上的進度，避免下一位使用者看到
      rawRemove("mf-auth-v1");
      location.reload();
    };
    return push().then(done, done);
  }
  function zh(m) {
    if (/Invalid login credentials/i.test(m)) return "Email 或密碼不正確";
    if (/Email not confirmed/i.test(m)) return "這個帳號還沒到信箱完成確認";
    if (/already registered|already been registered/i.test(m)) return "這個 Email 已經註冊過，請直接登入";
    if (/Password should be at least/i.test(m)) return "密碼至少要 6 個字";
    if (/rate limit/i.test(m)) return "嘗試太多次，請稍後再試";
    if (/Failed to fetch|NetworkError/i.test(m)) return "連不上雲端，請檢查網路";
    if (/row-level security|permission denied/i.test(m)) return "權限不足";
    return m;
  }

  // ---- 確認信連結回來時（網址 #access_token=...）自動登入 ----
  (function () {
    var h = location.hash; if (h.indexOf("access_token=") < 0) return;
    var q = {}; h.slice(1).split("&").forEach(function (s) { var p = s.split("="); q[p[0]] = decodeURIComponent(p[1] || ""); });
    history.replaceState(null, "", location.pathname + location.search);
    sess = { access_token: q.access_token, refresh_token: q.refresh_token, expires_at: Date.now() + (+q.expires_in || 3600) * 1000, user: null };
    api("/auth/v1/user", { auth: true }).then(function (u) { sess.user = { id: u.id, email: u.email }; writeJSON(SESS_KEY, sess); pull(true); })
      .catch(function (e) { dropSession(); lastErr = zh(e.message); setState("err"); });
  })();

  // ---- 介面（設定 → 遊戲登出/登入 裡的 #cloud-box）----
  var css = document.createElement("style");
  css.textContent = ".cl-box{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:12px 14px;margin:10px 0}" +
    ".cl-box h5{margin:0 0 6px;font-size:15px}.cl-box p{margin:4px 0;font-size:13px;opacity:.85}#cloud-box .cl-box input{width:100%;height:auto;accent-color:auto;box-sizing:border-box;margin:4px 0;padding:9px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.25);color:inherit;font-size:14px}" +
    ".cl-row{display:flex;gap:8px;margin-top:6px}.cl-row button{flex:1;padding:9px;border-radius:10px;border:0;font-weight:700;cursor:pointer;background:#f3c969;color:#3a2a10}.cl-row button.sec{background:rgba(255,255,255,.18);color:inherit}" +
    ".cl-pw{position:relative}#cloud-box .cl-pw input{padding-right:44px}#cloud-box .cl-eye{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:36px;height:36px;margin:0;padding:0;border:0;background:none;color:inherit;opacity:.75;cursor:pointer;display:flex;align-items:center;justify-content:center}#cloud-box .cl-eye:hover{opacity:1}#cloud-box .cl-eye svg{width:20px;height:20px}.cl-err{color:#ffb4a8}.cl-ok{color:#bfe8a8}.adm-code{display:block;font-size:11px;color:#f3c969;margin-top:2px}.adm-code b{letter-spacing:1px}";
  document.head.appendChild(css);
  var STATE_TXT = { idle: "", busy: "連線中…", dirty: "有新的進度，稍後自動上傳…", ok: "☁️ 已同步到雲端", confirm: "註冊成功！請到信箱點確認連結，再回來登入。" };
  function setState(s) { state = s; render(); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function render() {
    var box = document.getElementById("cloud-box"); if (!box) return;
    var msg = state === "err" ? '<p class="cl-err">⚠️ ' + esc(lastErr || "發生錯誤") + "</p>" : STATE_TXT[state] ? '<p class="cl-ok">' + STATE_TXT[state] + "</p>" : "";
    if (sess && sess.user) {
      var om = typeof org === "object" && org ? org : {}; var who = om.me ? "<p>學院身分：<b>" + esc(om.me.name) + "</b>（" + ROLE_ZH[om.me.role] + "）</p>"
        : om.loaded ? '<p>還沒有學院身分。請輸入老師給你的加入碼：</p><input id="cl-code" placeholder="加入碼（6 碼）" maxlength="12" autocapitalize="characters"><div class="cl-row"><button data-cl="claim">綁定身分</button></div>' : "";
      box.innerHTML = '<div class="cl-box"><h5>☁️ 雲端帳號</h5><p>已登入：<b>' + esc(sess.user.email) + "</b></p>" + who + msg +
        '<div class="cl-row"><button data-cl="sync">立即同步</button><button class="sec" data-cl="out">登出雲端帳號</button></div></div>';
    } else {
      box.innerHTML = '<div class="cl-box"><h5>☁️ 雲端存檔</h5><p>登入後進度會存到雲端，換手機、平板或電腦都能接著玩。</p>' +
        '<input id="cl-mail" type="email" placeholder="Email" autocomplete="username"><div class="cl-pw"><input id="cl-pw" type="password" placeholder="密碼（至少 6 個字）" autocomplete="current-password"><button type="button" class="cl-eye" data-eye aria-label="顯示密碼" title="顯示密碼">' + EYE[0] + "</button></div>" + msg +
        '<div class="cl-row"><button data-cl="in">登入</button><button class="sec" data-cl="up">註冊新帳號</button></div></div>';
    }
  }
  var EYE = ['<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>'];
  document.addEventListener("click", function (e) {
    var ey = e.target.closest && e.target.closest("[data-eye]");
    if (ey) { var pw = document.getElementById("cl-pw"), show = pw.type === "password"; pw.type = show ? "text" : "password"; ey.innerHTML = EYE[show ? 1 : 0]; ey.title = ey.ariaLabel = show ? "隱藏密碼" : "顯示密碼"; pw.focus(); return; }
    var b = e.target.closest && e.target.closest("[data-cl]"); if (!b) return;
    var act = b.dataset.cl;
    if (act === "sync") { pullOrg(); return push(); }
    if (act === "claim") { var cd = ((document.getElementById("cl-code") || {}).value || "").trim(); if (!cd) { lastErr = "請輸入加入碼"; return setState("err"); } return claim(cd); }
    if (act === "out") { if (confirm("登出後，這台裝置上的進度會清除（雲端存檔會保留）。確定登出？")) logout(); return; }
    var mail = (document.getElementById("cl-mail") || {}).value || "", pw = (document.getElementById("cl-pw") || {}).value || "";
    mail = mail.trim(); if (!mail || !pw) { lastErr = "請輸入 Email 和密碼"; return setState("err"); }
    (act === "in" ? login : signup)(mail, pw).catch(function () {});
  });


  // ================= 學院身分與授權（共用資料表）=================
  var ROLE_ZH = { SUPER_ADMIN: "最高管理者", ACADEMY_ADMIN: "學院管理者", INSTRUCTOR: "講師", STUDENT: "學員", GUEST: "訪客" };
  var ACAD_IDS = ["earth", "water", "fire", "wind", "light"];
  var org = { loaded: false, me: null, base: null, applying: false, timer: 0, busy: false, again: false };
  function B() { return window.MFAppBridge; }
  function say(m) { var b = B(); if (b) b.toast(m); }
  function newCode() { var c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = "", a = new Uint32Array(6); crypto.getRandomValues(a); for (var i = 0; i < 6; i++) s += c[a[i] % c.length]; return s; }
  function mapMember(r) { var x = { id: r.id, name: r.name, email: r.email || "", role: r.role, academy: r.academy, code: r.code || "", linked: !!r.user_id, createdAt: r.created_at }; if (r.parent) x.parent = r.parent; return x; }
  function memberRow(x) { return { name: x.name, email: x.email || null, role: x.role, academy: x.academy || null, parent: x.parent || null, code: x.code || null }; }
  function mapGrant(r) { return { id: r.id, adminId: r.admin_id, mode: r.mode, games: r.games || [], cats: r.cats || [], start: r.start_date || "", end: r.end_date || "", status: r.status, grantedBy: r.granted_by, updatedAt: r.updated_at }; }
  function grantRow(g) { return { id: g.id, admin_id: g.adminId, mode: g.mode, games: g.games || [], cats: g.cats || [], start_date: g.start || "", end_date: g.end || "", status: g.status || "active", granted_by: g.grantedBy || null, updated_at: g.updatedAt || new Date().toISOString() }; }
  function mapComment(r) { return { id: r.id, to: r.to_id, by: r.by_id, byName: r.by_name, roleName: r.role_name, text: r.text, at: r.at }; }
  function commentRow(c) { return { id: c.id, to_id: c.to, by_id: c.by, by_name: c.byName || null, role_name: c.roleName || null, text: c.text, at: c.at }; }
  function mapLog(r) { return { at: r.at, actor: r.actor, actorId: r.actor_id, role: r.role, academy: r.academy, action: r.action, game: r.game, detail: r.detail }; }
  function logRow(l) { return { at: l.at, actor: l.actor || null, actor_id: l.actorId || null, role: l.role || null, academy: l.academy || null, action: l.action || null, game: l.game || null, detail: l.detail || null }; }
  function logKey(l) { return [l.at, l.action, l.actor, l.detail].join("|"); }
  function byKey(arr, key, fn) { var o = {}; (arr || []).forEach(function (x) { o[x[key]] = JSON.stringify(fn(x)); }); return o; }
  function pick(DB) {
    var st = {}; Object.keys(DB.status || {}).forEach(function (a) { Object.keys(DB.status[a] || {}).forEach(function (n) { st[a + "|" + n] = DB.status[a][n]; }); });
    var lg = {}; (DB.logs || []).forEach(function (l) { lg[logKey(l)] = 1; });
    return { games: JSON.stringify(DB.games || []), rw: JSON.stringify(DB.rw || null), status: st, admins: byKey(DB.admins, "id", memberRow),
      grants: byKey(DB.grants, "adminId", function (g) { var r = grantRow(g); delete r.updated_at; return r; }), comments: byKey(DB.comments, "id", commentRow), logs: lg };
  }
  function q(path) { return api(path, { auth: !!(sess && sess.user) }); }
  function pullOrg() {
    var signed = !!(sess && sess.user);
    var jobs = [q("/rest/v1/org?select=games,rw&id=eq.1"), q("/rest/v1/game_status?select=acad,num,open,by_name,at")];
    if (signed) jobs.push(fresh().then(function () { return Promise.all([q("/rest/v1/members?select=*"), q("/rest/v1/grants?select=*"),
      q("/rest/v1/comments?select=*&order=at.desc&limit=500"), q("/rest/v1/logs?select=*&order=at.desc&limit=400")]); }));
    return Promise.all(jobs).then(function (r) { applyOrg(r[0] && r[0][0], r[1] || [], signed ? r[2] : null); })
      .catch(function (e) { console.warn("[MFOrg]", e); });
  }
  function applyOrg(row, status, mine) {
    var b = B(); if (!b) return; var DB = b.db();
    if (row && row.games && row.games.length) {
      DB.games = row.games; if (row.rw) DB.rw = row.rw;
      DB.status = {}; DB.statusMeta = {}; ACAD_IDS.forEach(function (a) { DB.status[a] = {}; DB.statusMeta[a] = {}; });
      status.forEach(function (s) { if (!DB.status[s.acad]) { DB.status[s.acad] = {}; DB.statusMeta[s.acad] = {}; } DB.status[s.acad][s.num] = s.open ? "OPEN" : "CLOSED"; DB.statusMeta[s.acad][s.num] = { by: s.by_name, at: s.at }; });
    }
    if (mine) {
      var ms = mine[0] || [], uid = sess.user.id, meRow = ms.filter(function (m) { return m.user_id === uid; })[0];
      DB.admins = ms.map(mapMember); DB.grants = (mine[1] || []).map(mapGrant); DB.comments = (mine[2] || []).map(mapComment); DB.logs = (mine[3] || []).map(mapLog);
      DB.currentId = meRow ? meRow.id : null; org.me = meRow ? mapMember(meRow) : null;
    } else org.me = null;
    org.applying = true; b.saveRaw(); org.base = pick(DB); org.applying = false; org.loaded = true;
    b.refresh(); render();
    if (org.me && org.me.role === "SUPER_ADMIN" && !(row && row.games && row.games.length)) seedOrg();
  }
  function seedOrg() {                                   // 第一次：把目前的遊戲清單與開放狀態寫進雲端
    var DB = B().db(), now = new Date().toISOString();
    api("/rest/v1/org", { method: "POST", auth: true, headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: { id: 1, games: DB.games, rw: DB.rw || null, updated_at: now } })
      .then(function () {
        var opens = []; Object.keys(DB.status || {}).forEach(function (a) { Object.keys(DB.status[a]).forEach(function (n) { if (DB.status[a][n] === "OPEN") opens.push([a, +n]); }); });
        return opens.reduce(function (p, x) { return p.then(function () { return rpcStatus(x[0], x[1], true); }); }, Promise.resolve());
      }).then(function () { say("已把遊戲清單與開放狀態上傳到雲端。"); return pullOrg(); })
      .catch(function (e) { say("上傳遊戲清單失敗：" + zh(e.message)); });
  }
  function rpcStatus(a, n, open) { return api("/rest/v1/rpc/set_status", { method: "POST", auth: true, body: { p_acad: a, p_num: n, p_open: open } }); }
  function orgChanged() { if (!sess || !sess.user || !org.me || org.applying || !org.base) return; clearTimeout(org.timer); org.timer = setTimeout(syncOrg, 400); }
  function syncOrg() {
    if (org.busy) { org.again = true; return; }
    var DB = B().db(), cur = pick(DB), b = org.base, ops = [], dels = [], now = new Date().toISOString();
    var J = function (path, method, body, prefer) { return function () { return api(path, { method: method, auth: true, body: body, headers: prefer ? { Prefer: prefer } : {} }); }; };
    if (cur.games !== b.games || cur.rw !== b.rw) ops.push(J("/rest/v1/org", "POST", { id: 1, games: DB.games, rw: DB.rw || null, updated_at: now }, "resolution=merge-duplicates,return=minimal"));
    (DB.admins || []).forEach(function (x) {
      if (!(x.id in b.admins)) ops.push(J("/rest/v1/members", "POST", Object.assign({ id: x.id }, memberRow(x)), "return=minimal"));
      else if (b.admins[x.id] !== cur.admins[x.id]) ops.push(J("/rest/v1/members?id=eq." + encodeURIComponent(x.id), "PATCH", memberRow(x), "return=minimal"));
    });
    Object.keys(b.admins).forEach(function (id) { if (!(id in cur.admins)) dels.push(J("/rest/v1/members?id=eq." + encodeURIComponent(id), "DELETE")); });
    (DB.grants || []).forEach(function (g) { if (b.grants[g.adminId] !== cur.grants[g.adminId]) ops.push(J("/rest/v1/grants?on_conflict=admin_id", "POST", grantRow(g), "resolution=merge-duplicates,return=minimal")); });
    Object.keys(b.grants).forEach(function (id) { if (!(id in cur.grants)) dels.push(J("/rest/v1/grants?admin_id=eq." + encodeURIComponent(id), "DELETE")); });
    Object.keys(cur.status).forEach(function (k) { if (cur.status[k] !== b.status[k]) { var p = k.split("|"); ops.push(function () { return rpcStatus(p[0], +p[1], cur.status[k] === "OPEN"); }); } });
    (DB.comments || []).forEach(function (c) { if (!(c.id in b.comments)) ops.push(J("/rest/v1/comments", "POST", commentRow(c), "return=minimal")); });
    Object.keys(b.comments).forEach(function (id) { if (!(id in cur.comments)) dels.push(J("/rest/v1/comments?id=eq." + encodeURIComponent(id), "DELETE")); });
    var newLogs = (DB.logs || []).filter(function (l) { return !b.logs[logKey(l)]; }).map(logRow);
    if (newLogs.length) ops.push(J("/rest/v1/logs", "POST", newLogs, "return=minimal"));
    ops = ops.concat(dels);
    if (!ops.length) return;
    org.busy = true; setState("dirty");
    fresh().then(function () { return ops.reduce(function (p, f) { return p.then(f); }, Promise.resolve()); })
      .then(function () { org.base = cur; setState("ok"); })
      .catch(function (e) { say("雲端沒有接受這項變更（" + zh(e.message) + "），已改回雲端上的資料。"); lastErr = zh(e.message); setState("err"); return pullOrg(); })
      .then(function () { org.busy = false; if (org.again) { org.again = false; syncOrg(); } });
  }
  function claim(code) {
    setState("busy");
    return fresh().then(function () { return api("/rest/v1/rpc/claim_member", { method: "POST", auth: true, body: { p_code: code } }); })
      .then(function () { return pullOrg(); }).then(function () { setState("ok"); if (org.me) say("已綁定學院身分：" + org.me.name + "（" + ROLE_ZH[org.me.role] + "）"); })
      .catch(function (e) { lastErr = zh(e.message); setState("err"); });
  }
  window.MFOrg = { changed: orgChanged, newCode: newCode, pull: pullOrg, me: function () { return org.me; } };

  // 閃退紀錄（diag.js）用：有登入就帶身分，沒登入用匿名寫入
  function sbPost(path, body) { var a = !!sess; return (a ? fresh().catch(function () {}) : Promise.resolve()).then(function () { return api(path, { method: "POST", auth: a && !!sess, headers: { Prefer: "return=minimal" }, body: body, keepalive: true }); }); }
  function sbGet(path) { return fresh().then(function () { return api(path, { auth: true }); }); }
  function sbDelete(path) { return fresh().then(function () { return api(path, { method: "DELETE", auth: true, headers: { Prefer: "return=minimal" } }); }); }
  window.MFCloud = { render: render, push: push, logout: logout, user: function () { return sess && sess.user; }, sbPost: sbPost, sbGet: sbGet, sbDelete: sbDelete };

  // 開啟時：已登入就檢查雲端有沒有比較新的進度
  if (sess && sess.user) pull(false);
  window.addEventListener("load", function () { setTimeout(pullOrg, 0); });
  window.addEventListener("load", function () {
    var n = ls.getItem("mf-cloud-note"); if (!n) return; rawRemove("mf-cloud-note");
    var t = document.createElement("div"); t.textContent = "☁️ " + n;
    t.style.cssText = "position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:99999;background:rgba(20,30,50,.92);color:#fff;padding:10px 18px;border-radius:12px;font-size:14px;box-shadow:0 6px 20px rgba(0,0,0,.3)";
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3500);
  });
})();
