/* SWT MindFlow 身心智慧學院 — 學習地圖：11Q 學習成長雷達圖
 * 依「MindFlow60_11Q 評量映射資料 V1.0」計分：
 *   - 正式分數 = 遊戲數據 70% ＋ 自我評量 30%；缺一種來源時只用有效來源（重新正規化），不補 0 分
 *   - 每款遊戲只計兩項「主要能力」；先算每款遊戲（最近 3 場平均），再跨遊戲平均，避免單一遊戲壟斷
 *   - 自我評量：(平均答題分數 − 1) ÷ 4 × 100
 *   - 沒有任何資料的能力顯示「尚待探索」
 * 資料存在玩家檔案 p.q11（在 mf-player-v1 裡），由 cloud.js 自動同步到 Supabase。
 *   p.q11 = { v:1, ev:[[秒, 遊戲編號, 0–100 分, 遊玩秒數]], self:[{ t:秒, a:{HQ:1–5,…}, ver }] }
 * 平台用 MFQ.init(hooks) 接上，hooks：curP saveP testMode gameInfo goStation avatar who toast onClose
 */
(function () {
  "use strict";
  var D = window.MFQ_DATA; if (!D) return;
  var AB = {}, GAMES = {};
  D.abilities.forEach(function (a) { AB[a.code] = a; });
  D.games.forEach(function (g) { GAMES[g.num] = g; });
  var GROUPS = {
    basic: { id: "basic", zh: "基礎能力", list: D.basic, c: "#5fe3ff", c2: "#1aa6ff", soft: "rgba(95,227,255,.30)" },
    advanced: { id: "advanced", zh: "進階能力", list: D.advanced, c: "#d4a6ff", c2: "#9b5cff", soft: "rgba(212,166,255,.30)" }
  };
  var UNLOCK_AVG = 60, RECENT = 3, MAX_EV = 3000, SCORE_VER = "V1.0-prov", SELF_VER = "V1.0";
  var LEVELS = [[0, "🌱", "覺察萌芽"], [40, "🌿", "成長新葉"], [55, "🌳", "穩健茁壯"], [70, "✨", "智慧閃耀"], [85, "👑", "圓滿光輝"]];
  var TIPS = {
    HQ: "每天留意一次身體的感受（呼吸、肩頸、睡眠），再挑戰身體覺察相關的關卡。",
    EQ: "遇到情緒時先替它取名字，再想想是什麼事情引發它。",
    NQ: "和別人說話時，先用自己的話複述對方的意思，再說出你的想法。",
    AQ: "卡關時換一種方法試試看，並記下哪一種策略最有效。",
    IQ: "先做 1 分鐘冥想練習，把注意力帶回當下，再進入挑戰。",
    MQ: "每天替自己訂一個小承諾，睡前檢查有沒有做到。",
    TQ: "和夥伴一起完成多人關卡，主動分享你發現的線索。",
    CQ: "同一個問題，試著想出三種不同的解決方法。",
    RQ: "失敗之後先休息一下，再回來挑戰同一關，看看自己哪裡進步了。",
    FQ: "在模擬關卡裡，比較不同選擇的成本與收益再做決定。",
    SQ: "寫一則反思：今天學到的事，可以怎麼幫助身邊的人？"
  };
  var H = {}, el = null, tab = "basic", cmpDay = "auto", showCmp = true, modal = null;

  // ---------------------------------------------------------------- 工具
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function nowS() { return Math.floor(Date.now() / 1000); }
  function dayOf(t) { var d = new Date(t * 1000); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function endOfDay(day) { var a = day.split("-"); return Math.floor(new Date(+a[0], +a[1] - 1, +a[2], 23, 59, 59).getTime() / 1000); }
  function md(day) { var a = day.split("-"); return +a[1] + "/" + +a[2]; }
  function r0(x) { return x == null ? null : Math.round(x); }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
  function q(p) { if (!p.q11 || p.q11.v !== 1) p.q11 = { v: 1, ev: [], self: [] }; return p.q11; }

  // ---------------------------------------------------------------- 紀錄
  // 遊戲結果：score 為該款遊戲自己標準化後的 0–100 分（目前取遊戲回報的成績比例；各遊戲事件指標完成後改由指標計算）
  function record(p, num, score, sec, t) {
    if (!GAMES[num] || score == null || isNaN(score)) return false;
    var d = q(p); d.ev.push([t || nowS(), num, Math.max(0, Math.min(100, Math.round(+score))), Math.round(+sec || 0)]);
    if (d.ev.length > MAX_EV) d.ev.splice(0, d.ev.length - MAX_EV);
    if (el && !el.hidden) setTimeout(render, 0);
    return true;
  }
  function recordSelf(p, answers, t) {
    var a = {}; Object.keys(answers || {}).forEach(function (k) { var v = +answers[k]; if (AB[k] && v >= 1 && v <= 5) a[k] = v; });
    if (!Object.keys(a).length) return false;
    q(p).self.push({ t: t || nowS(), a: a, ver: SELF_VER }); return true;
  }

  // ---------------------------------------------------------------- 計分
  function compute(p, until) {
    var d = q(p), lim = until || Infinity, per = {}, out = {};
    d.ev.forEach(function (e) { if (e[0] <= lim) (per[e[1]] = per[e[1]] || []).push(e); });
    var gScore = {};   // 每款遊戲：最近 3 場平均（反映目前程度，也不讓舊成績拖住進步）
    Object.keys(per).forEach(function (n) { var a = per[n].slice(-RECENT); gScore[n] = { s: mean(a.map(function (e) { return e[2]; })), n: per[n].length, at: a[a.length - 1][0] }; });
    D.abilities.forEach(function (ab) {
      var A = ab.code, gs = [], sess = 0, at = 0;
      Object.keys(gScore).forEach(function (n) { if (GAMES[n].p.indexOf(A) >= 0) { gs.push(gScore[n].s); sess += gScore[n].n; at = Math.max(at, gScore[n].at); } });
      var selfs = d.self.filter(function (s) { return s.t <= lim && s.a[A]; }), last = selfs[selfs.length - 1];
      var game = mean(gs), self = last ? (last.a[A] - 1) / 4 * 100 : null;
      if (last) at = Math.max(at, last.t);
      var w = D.weights, score = game != null && self != null ? game * w.game + self * w.self : game != null ? game : self;
      out[A] = { score: score, game: game, self: self, nGames: gs.length, nSess: sess, nSelf: selfs.length, at: at || null,
        comp: (game != null ? w.game : 0) + (self != null ? w.self : 0) };
    });
    return out;
  }
  function groupStat(sc, g) {
    var vals = GROUPS[g].list.map(function (A) { return sc[A].score; }).filter(function (v) { return v != null; });
    return { avg: mean(vals), n: vals.length, total: GROUPS[g].list.length };
  }
  function unlocked(sc) { var b = groupStat(sc, "basic"); return b.n === b.total && b.avg >= UNLOCK_AVG; }
  function levelOf(avg) { var l = LEVELS[0]; LEVELS.forEach(function (x) { if (avg != null && avg >= x[0]) l = x; }); return l; }

  // 成長歷程：每個有紀錄的日子，以當天結束時的資料重算一次
  function history(p) {
    var d = q(p), days = {};
    d.ev.forEach(function (e) { days[dayOf(e[0])] = 1; });
    d.self.forEach(function (s) { days[dayOf(s.t)] = 1; });
    return Object.keys(days).sort().slice(-40).map(function (day) {
      var sc = compute(p, endOfDay(day)), sb = groupStat(sc, "basic"), sa = groupStat(sc, "advanced");
      var plays = d.ev.filter(function (e) { return dayOf(e[0]) === day; }).length, selfN = d.self.filter(function (s) { return dayOf(s.t) === day; }).length;
      return { day: day, sc: sc, basic: sb, adv: sa, plays: plays, selfN: selfN, open: unlocked(sc) };
    });
  }
  function badges(p, sc, hist) {
    var all = groupStat(sc, "basic").n + groupStat(sc, "advanced").n, d = q(p), out = [];
    function add(on, icon, name, how) { out.push({ on: !!on, icon: icon, name: name, how: how }); }
    add(all >= 1, "🔭", "初次探索", "第一次取得能力分數");
    add(groupStat(sc, "basic").n === 6, "🧭", "基礎全探索", "基礎 6 項都有分數");
    add(unlocked(sc), "🚪", "進階之門", "基礎平均達 " + UNLOCK_AVG + " 分");
    add(all === 11, "🌈", "十一光譜", "11 項能力全部探索");
    add(d.self.length >= 1, "🪞", "自我覺察者", "完成一次自我評量");
    add(d.self.length >= 3, "📔", "持續覺察", "完成三次自我評量");
    add(hist.length >= 5, "🌱", "成長足跡", "5 天留下評量紀錄");
    var up = 0; if (hist.length >= 2) { var a = hist[hist.length - 2].sc; D.abilities.forEach(function (x) { if (a[x.code].score != null && sc[x.code].score != null) up = Math.max(up, sc[x.code].score - a[x.code].score); }); }
    add(up >= 10, "🚀", "突破自我", "單項能力一次進步 10 分");
    D.abilities.forEach(function (x) { if (sc[x.code].score >= 80) add(true, "⭐", x.name + "之星", x.code + " 達 80 分"); });
    return out;
  }

  // ---------------------------------------------------------------- 雷達圖（SVG）
  function radarSVG(gid, sc, cmp, locked) {
    var G = GROUPS[gid], L = G.list, n = L.length, R = 112, uid = "q" + gid;
    function pt(i, v) { var a = -Math.PI / 2 + i * 2 * Math.PI / n, r = R * v / 100; return [Math.cos(a) * r, Math.sin(a) * r]; }
    function poly(v) { return v.map(function (x) { return x[0].toFixed(1) + "," + x[1].toFixed(1); }).join(" "); }
    var h = '<svg class="q-radar" viewBox="-190 -178 380 356" role="img" aria-label="' + G.zh + '雷達圖">' +
      '<defs><radialGradient id="' + uid + 'f" r="1"><stop offset="0" stop-color="' + G.c + '" stop-opacity=".15"/><stop offset="1" stop-color="' + G.c + '" stop-opacity=".55"/></radialGradient>' +
      '<radialGradient id="' + uid + 'bg" r="1"><stop offset="0" stop-color="' + G.c2 + '" stop-opacity=".22"/><stop offset=".7" stop-color="#0b1440" stop-opacity=".1"/><stop offset="1" stop-color="#0b1440" stop-opacity="0"/></radialGradient>' +
      '<filter id="' + uid + 'g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
    h += '<circle r="160" fill="url(#' + uid + 'bg)"/>';
    // 魔法陣外圈
    h += '<g class="q-spin"><circle r="132" fill="none" stroke="' + G.c + '" stroke-opacity=".35" stroke-dasharray="2 7"/>' +
      '<circle r="140" fill="none" stroke="' + G.c + '" stroke-opacity=".18" stroke-dasharray="18 10 4 10"/></g>';
    for (var s = 0; s < 14; s++) { var sa = s * 2.399, sr = 70 + (s * 37) % 95; h += '<circle class="q-twk" style="animation-delay:' + (s * 0.37).toFixed(2) + 's" cx="' + (Math.cos(sa) * sr).toFixed(1) + '" cy="' + (Math.sin(sa) * sr).toFixed(1) + '" r="' + (s % 3 ? 1 : 1.6) + '" fill="#fff"/>'; }
    [20, 40, 60, 80, 100].forEach(function (v) {
      var ring = L.map(function (_, i) { return pt(i, v); });
      h += '<polygon points="' + poly(ring) + '" fill="' + (v === 100 ? "rgba(8,16,52,.45)" : "none") + '" stroke="' + (v === 60 ? "rgba(255,211,107,.45)" : "rgba(200,220,255,.18)") + '" stroke-width="' + (v === 100 ? 1.6 : 1) + '"' + (v === 60 ? ' stroke-dasharray="4 4"' : "") + "/>";
    });
    L.forEach(function (_, i) { var e = pt(i, 100); h += '<line x1="0" y1="0" x2="' + e[0].toFixed(1) + '" y2="' + e[1].toFixed(1) + '" stroke="rgba(200,220,255,.18)"/>'; });
    function shape(scs, cls, fill, stroke, dash) {
      var pts = []; L.forEach(function (A, i) { if (scs[A].score != null) pts.push(pt(i, Math.max(4, scs[A].score))); });
      if (pts.length >= 3) return '<polygon class="' + cls + '" points="' + poly(pts) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="2.4" stroke-linejoin="round"' + (dash ? ' stroke-dasharray="6 5"' : "") + "/>";
      if (pts.length === 2) return '<polyline class="' + cls + '" points="' + poly(pts) + '" fill="none" stroke="' + stroke + '" stroke-width="2.4"' + (dash ? ' stroke-dasharray="6 5"' : "") + "/>";
      return "";
    }
    if (!locked) {
      h += '<g class="q-grow">';
      if (cmp) h += shape(cmp, "q-cmp", "none", "#ffd36b", true);
      h += '<g filter="url(#' + uid + 'g)">' + shape(sc, "q-cur", "url(#" + uid + "f)", G.c) + "</g>";
      L.forEach(function (A, i) { if (sc[A].score != null) { var p0 = pt(i, Math.max(4, sc[A].score)); h += '<circle cx="' + p0[0].toFixed(1) + '" cy="' + p0[1].toFixed(1) + '" r="4.5" fill="#fff" stroke="' + G.c + '" stroke-width="2.5"/>'; } });
      h += "</g>";
    }
    h += '<text class="q-tick" x="5" y="' + (-R * 0.6 + 3).toFixed(1) + '">60</text><text class="q-tick" x="5" y="' + (-R + 3) + '">100</text>';
    L.forEach(function (A, i) {
      var p0 = pt(i, 128), x = p0[0], y = p0[1], anchor = Math.abs(x) < 8 ? "middle" : x > 0 ? "start" : "end", v = sc[A].score, none = v == null || locked;
      var dy = y < -100 ? -14 : y > 80 ? 10 : -4;
      h += '<g class="q-axis' + (none ? " none" : "") + '" data-ab="' + A + '" tabindex="0" role="button" aria-label="' + AB[A].name + " " + (v == null ? "尚待探索" : r0(v) + " 分") + '">' +
        '<rect x="' + (anchor === "middle" ? x - 44 : anchor === "start" ? x - 6 : x - 82) + '" y="' + (y + dy - 16) + '" width="88" height="44" rx="10" fill="transparent"/>' +
        '<text x="' + x.toFixed(1) + '" y="' + (y + dy).toFixed(1) + '" text-anchor="' + anchor + '"><tspan class="q-code" fill="' + (none ? "#8f9cc4" : G.c) + '">' + A + '</tspan><tspan class="q-val" dx="5">' + (locked ? "🔒" : v == null ? "?" : r0(v)) + "</tspan></text>" +
        '<text class="q-name" x="' + x.toFixed(1) + '" y="' + (y + dy + 17).toFixed(1) + '" text-anchor="' + anchor + '">' + AB[A].name + (v == null && !locked ? "・尚待探索" : "") + "</text></g>";
    });
    return h + "</svg>";
  }
  function lineSVG(hist) {
    if (hist.length < 2) return '<p class="gr-empty">累積兩天以上的評量紀錄後，這裡會畫出成長曲線。</p>';
    var W = 560, Hh = 170, pl = 30, pr = 12, pt = 12, pb = 26, n = hist.length;
    function X(i) { return pl + (W - pl - pr) * (n === 1 ? 0.5 : i / (n - 1)); }
    function Y(v) { return pt + (Hh - pt - pb) * (1 - v / 100); }
    var h = '<svg class="q-line" viewBox="0 0 ' + W + " " + Hh + '" role="img" aria-label="成長曲線">';
    [0, 20, 40, 60, 80, 100].forEach(function (v) { h += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="' + (v === 60 ? "rgba(255,211,107,.4)" : "rgba(200,220,255,.12)") + '"' + (v === 60 ? ' stroke-dasharray="4 4"' : "") + '/><text x="' + (pl - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v + "</text>"; });
    var step = Math.ceil(n / 7); hist.forEach(function (x, i) { if (i % step === 0 || i === n - 1) h += '<text x="' + X(i) + '" y="' + (Hh - 6) + '" text-anchor="middle">' + md(x.day) + "</text>"; });
    [["basic", "basic"], ["adv", "advanced"]].forEach(function (k) {
      var G = GROUPS[k[1]], seg = [], pts = [];
      hist.forEach(function (x, i) { if (x[k[0]].avg != null) pts.push([X(i), Y(x[k[0]].avg)]); });
      if (!pts.length) return;
      seg = pts.map(function (p0, i) { return (i ? "L" : "M") + p0[0].toFixed(1) + " " + p0[1].toFixed(1); }).join("");
      h += '<path d="' + seg + '" fill="none" stroke="' + G.c + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>';
      pts.forEach(function (p0) { h += '<circle cx="' + p0[0].toFixed(1) + '" cy="' + p0[1].toFixed(1) + '" r="3.5" fill="#0e1838" stroke="' + G.c + '" stroke-width="2"/>'; });
    });
    return h + "</svg>";
  }

  // ---------------------------------------------------------------- 面板
  function build() {
    el = document.createElement("section"); el.id = "q11"; el.hidden = true; el.setAttribute("aria-label", "學習地圖");
    el.innerHTML = '<div class="sh-top"><h2>學習地圖</h2><div class="gr-who" id="q-who"></div><button class="sh-x" data-q="close" aria-label="關閉學習地圖">×</button></div>' +
      '<div class="sh-body"><div class="q-wrap"><div id="q-hero"></div><div class="gr-tabs" role="tablist" id="q-tabs"></div><div id="q-body"></div></div></div>';
    document.body.appendChild(el);
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.dataset && e.target.dataset.ab) { e.preventDefault(); openAbility(e.target.dataset.ab); } });
    window.addEventListener("keydown", function (e) { if (e.key === "Escape" && el && !el.hidden) { e.stopImmediatePropagation(); if (modal) closeModal(); else close(); } }, true);
  }
  function open(t) { if (!el) build(); if (t) tab = t; var p = H.curP(); if (p.demo && !p.q11) { seedDemo(p); H.saveP(); } el.hidden = false; document.body.classList.add("shop-open"); render(true); el.querySelector(".sh-body").scrollTop = 0; }
  function close() { if (!el) return; closeModal(); el.hidden = true; document.body.classList.remove("shop-open"); if (H.onClose) H.onClose(); }

  function render(anim) {
    if (!el || el.hidden) return;
    var p = H.curP(), sc = compute(p), hist = history(p), sb = groupStat(sc, "basic"), sa = groupStat(sc, "advanced");
    var allVals = D.abilities.map(function (a) { return sc[a.code].score; }).filter(function (v) { return v != null; }), overall = mean(allVals), lv = levelOf(overall);
    var d = q(p), bd = badges(p, sc, hist), got = bd.filter(function (b) { return b.on; }).length;
    el.querySelector("#q-who").innerHTML = H.who ? H.who(p) : "";
    el.querySelector("#q-hero").innerHTML = '<div class="q-hero gr-card">' +
      '<div class="q-lv"><i>' + (overall == null ? "🥚" : lv[1]) + '</i><div><small>成長等級</small><b>' + (overall == null ? "等待啟程" : lv[2]) + "</b></div></div>" +
      '<div class="gr-kpis q-kpis">' +
      kpi("整體平均", overall == null ? "—" : r0(overall), overall == null ? "" : "分") + kpi("已探索能力", allVals.length, "/ 11") +
      kpi("基礎平均", sb.avg == null ? "—" : r0(sb.avg), sb.avg == null ? "" : "分") + kpi("進階平均", unlocked(sc) || H.testMode() ? (sa.avg == null ? "—" : r0(sa.avg)) : "🔒", (unlocked(sc) || H.testMode()) && sa.avg != null ? "分" : "") +
      kpi("評量徽章", got, "/ " + bd.length) + "</div>" +
      '<div class="q-hero-act"><button class="gr-btn gold" data-q="self">📝 自我評量</button>' +
      (H.testMode() || p.demo ? '<button class="gr-btn" data-q="demo">載入示範資料</button><button class="gr-btn" data-q="clear">清除評量資料</button>' : "") + "</div>" +
      '<p class="gr-note">分數來源：遊戲表現 70%＋自我評量 30%；只有一種資料時以該來源計算。最近更新：' + (d.ev.length || d.self.length ? lastAt(d) : "尚無紀錄") + (p.demo ? "・<b>示範資料</b>" : "") + "</p></div>";
    var T = [["basic", "🔷 基礎能力"], ["advanced", (unlocked(sc) ? "🔮 " : "🔒 ") + "進階能力"], ["hist", "📈 成長歷程"]];
    el.querySelector("#q-tabs").innerHTML = T.map(function (x) { return '<button role="tab" aria-selected="' + (tab === x[0]) + '" data-qt="' + x[0] + '">' + x[1] + "</button>"; }).join("");
    var body = el.querySelector("#q-body");
    body.innerHTML = tab === "hist" ? renderHist(p, sc, hist, bd) : renderRadarTab(p, tab, sc, hist);
    if (anim !== false) { var g = body.querySelector(".q-grow"); if (g) { g.classList.remove("on"); void g.getBoundingClientRect(); requestAnimationFrame(function () { g.classList.add("on"); }); } }
    else { var g2 = body.querySelector(".q-grow"); if (g2) g2.classList.add("on"); }
  }
  function kpi(label, v, unit) { return '<div class="gr-kpi"><small>' + label + "</small><b>" + v + (unit ? " <em>" + unit + "</em>" : "") + "</b></div>"; }
  function lastAt(d) { var t = 0; d.ev.forEach(function (e) { t = Math.max(t, e[0]); }); d.self.forEach(function (s) { t = Math.max(t, s.t); }); var x = new Date(t * 1000); return md(dayOf(t)) + " " + ("0" + x.getHours()).slice(-2) + ":" + ("0" + x.getMinutes()).slice(-2); }

  function cmpEntry(hist) {
    if (!showCmp || hist.length < 2) return null;
    if (cmpDay !== "auto") { for (var i = 0; i < hist.length; i++) if (hist[i].day === cmpDay) return hist[i]; }
    return hist[hist.length - 2];
  }
  function renderRadarTab(p, gid, sc, hist) {
    var G = GROUPS[gid], open = gid === "basic" || unlocked(sc), test = !open && H.testMode(), locked = !open && !test, ce = cmpEntry(hist), sb = groupStat(sc, "basic");
    var h = '<div class="gr-card q-main" style="--qc:' + G.c + ";--qs:" + G.soft + '"><div class="gr-head"><h3>' + G.zh + "雷達圖</h3>" +
      (locked ? "" : '<div class="gr-seg"><button class="' + (showCmp ? "on" : "") + '" data-q="cmp">' + (ce ? "對照 " + md(ce.day) : "對照上一次") + "</button></div>") + "</div>" +
      '<div class="q-grid"><div class="q-chart">' + radarSVG(gid, sc, ce && !locked ? ce.sc : null, locked);
    if (locked) {
      var need = Math.max(0, 6 - sb.n), pct = Math.min(100, sb.n === 6 ? sb.avg / UNLOCK_AVG * 100 : sb.n / 6 * 60);
      h += '<div class="q-lock"><i>🔒</i><b>進階能力尚未解鎖</b><p>基礎 6 項能力都要有分數，而且平均達到 <b>' + UNLOCK_AVG + ' 分</b>，就能開啟進階能力雷達圖。</p>' +
        '<div class="q-bar"><span style="width:' + pct.toFixed(0) + '%"></span></div><small>目前：已探索 ' + sb.n + " / 6" + (sb.avg != null ? "・基礎平均 " + r0(sb.avg) + " 分" : "") + (need ? "・還差 " + need + " 項待探索" : "") + "</small>" +
        '<button class="gr-btn gold" data-qt="basic">回到基礎能力</button></div>';
    }
    h += "</div>";
    h += '<ul class="q-list">' + G.list.map(function (A) {
      var s = sc[A], v = locked ? null : s.score, prev = ce && !locked ? ce.sc[A].score : null, dlt = v != null && prev != null ? v - prev : null;
      return '<li><button data-ab="' + A + '" class="' + (v == null ? "none" : "") + '"><span class="q-tag">' + A + '</span><span class="q-nm">' + AB[A].name + '<small>' + (locked ? "尚未解鎖" : v == null ? "尚待探索" : srcText(s)) + "</small></span>" +
        '<span class="q-sc">' + (locked ? "🔒" : v == null ? "?" : r0(v)) + (dlt != null && Math.abs(dlt) >= 1 ? '<em class="' + (dlt > 0 ? "gr-up" : "gr-dn") + '">' + (dlt > 0 ? "▲" : "▼") + Math.abs(r0(dlt)) + "</em>" : "") + "</span>" +
        '<span class="q-meter"><span style="width:' + (v == null ? 0 : v.toFixed(0)) + '%"></span></span></button></li>';
    }).join("") + "</ul></div>" +
      (test ? '<p class="gr-note">測試模式：已略過進階能力的解鎖條件。</p>' : "") +
      '<p class="gr-note">點能力名稱可以看說明與提升建議。虛線金色框為對照紀錄；金色虛線圈為 60 分。</p></div>';
    if (!locked) h += analysisCard(gid, sc, ce) + recoCard(p, gid, sc);
    else h += recoCard(p, "basic", sc, "先把基礎能力練起來");
    h += '<p class="gr-note q-disc">雷達圖呈現的是遊戲情境中的表現與自我評量，不代表個人整體特質；HQ、MQ、SQ、FQ 不推斷健康、道德、靈性或真實財務狀況。</p>';
    return h;
  }
  function srcText(s) {
    var a = []; if (s.game != null) a.push("遊戲 " + s.nGames + " 款"); if (s.self != null) a.push("自評"); return a.join("＋") + "・完整度 " + Math.round(s.comp * 100) + "%";
  }
  function analysisCard(gid, sc, ce) {
    var L = GROUPS[gid].list, ex = L.filter(function (A) { return sc[A].score != null; }).sort(function (a, b) { return sc[b].score - sc[a].score; });
    var un = L.filter(function (A) { return sc[A].score == null; });
    var h = '<div class="gr-card"><div class="gr-head"><h3>強弱項分析</h3></div>';
    if (!ex.length) return h + '<p class="gr-empty">還沒有' + GROUPS[gid].zh + '的分數。完成相關遊戲或填寫自我評量後，這裡會自動分析你的強項與需要加強的地方。</p></div>';
    var top = ex[0], low = ex[ex.length - 1], items = [];
    items.push('<li><i>💪</i><span><b>最強項：' + AB[top].name + "（" + top + "）" + r0(sc[top].score) + " 分</b>" + AB[top].purpose + "的表現最穩定，可以挑戰更高難度的關卡。</span></li>");
    if (ex.length > 1 && low !== top) items.push('<li><i>🎯</i><span><b>可再加強：' + AB[low].name + "（" + low + "）" + r0(sc[low].score) + " 分</b>" + TIPS[low] + "</span></li>");
    if (ce) {
      var best = null, bv = 0; L.forEach(function (A) { if (sc[A].score != null && ce.sc[A].score != null && sc[A].score - ce.sc[A].score > bv) { bv = sc[A].score - ce.sc[A].score; best = A; } });
      if (best && bv >= 1) items.push('<li><i>📈</i><span><b>進步最多：' + AB[best].name + " ＋" + r0(bv) + " 分</b>和 " + md(ce.day) + " 相比，持續練習有了成果。</span></li>");
    }
    var gap = ex.filter(function (A) { var s = sc[A]; return s.game != null && s.self != null && Math.abs(s.game - s.self) >= 20; })[0];
    if (gap) items.push('<li><i>🪞</i><span><b>' + AB[gap].name + "：遊戲 " + r0(sc[gap].game) + " 分、自評 " + r0(sc[gap].self) + " 分</b>" + (sc[gap].game > sc[gap].self ? "你的實際表現比自己想像的更好，多給自己一點肯定。" : "自評比遊戲表現高，可以多練習幾場，讓實力跟上信心。") + "</span></li>");
    if (un.length) items.push('<li><i>🧭</i><span><b>尚待探索：' + un.map(function (A) { return AB[A].name; }).join("、") + "</b>完成相關遊戲或自我評量，就能點亮這些能力。</span></li>");
    return h + '<ul class="q-ana">' + items.join("") + "</ul></div>";
  }
  function recoCard(p, gid, sc, title) {
    var L = GROUPS[gid].list, un = L.filter(function (A) { return sc[A].score == null; }), ex = L.filter(function (A) { return sc[A].score != null; }).sort(function (a, b) { return sc[a].score - sc[b].score; });
    var targets = un.slice(0, 2).concat(ex.slice(0, 2)).slice(0, 3), picks = [], used = {};
    targets.forEach(function (A) {
      var gs = D.games.filter(function (g) { return g.p.indexOf(A) >= 0 && !used[g.num]; }).map(function (g) { var i = H.gameInfo(g.num) || {}; return { g: g, i: i }; });
      gs.sort(function (a, b) { return (b.i.url ? 1 : 0) - (a.i.url ? 1 : 0) || (a.i.plays || 0) - (b.i.plays || 0) || a.g.num - b.g.num; });
      gs.slice(0, 2).forEach(function (x) { used[x.g.num] = 1; picks.push({ A: A, g: x.g, i: x.i }); });
    });
    picks.forEach(function (x, i) { x.o = i; });
    picks.sort(function (a, b) { return (b.i.url ? 1 : 0) - (a.i.url ? 1 : 0) || a.o - b.o; });   // 可以玩的關卡排前面
    var h = '<div class="gr-card"><div class="gr-head"><h3>' + (title || "推薦關卡") + "</h3><small>依需要加強與尚待探索的能力挑選</small></div>";
    if (!picks.length) return h + '<p class="gr-empty">目前沒有可推薦的關卡。</p></div>';
    return h + '<div class="q-reco">' + picks.slice(0, 4).map(function (x) {
      var g = x.g, i = x.i;
      return '<button data-go="' + g.num + '"><span class="q-num">' + (g.num < 10 ? "0" : "") + g.num + '</span><span><b>' + esc(i.name || g.name) + "</b><small>" + esc(i.place || g.stage) + "・練 " + g.p.map(function (c) { return AB[c].name; }).join("、") + '</small><em class="' + (i.url ? "" : "soon") + '">' + (i.url ? "可以挑戰 ▶" : "敬請期待") + "</em></span></button>";
    }).join("") + "</div></div>";
  }
  function renderHist(p, sc, hist, bd) {
    var ce = cmpEntry(hist), h = '<div class="gr-card"><div class="gr-head"><h3>成長曲線</h3><small><span class="q-dot" style="--c:' + GROUPS.basic.c + '"></span>基礎平均　<span class="q-dot" style="--c:' + GROUPS.advanced.c + '"></span>進階平均</small></div>' + lineSVG(hist) + "</div>";
    h += '<div class="gr-card"><div class="gr-head"><h3>評量時間軸</h3><small>點「設為對照」，雷達圖會疊上那一天的成績</small></div>';
    if (!hist.length) h += '<p class="gr-empty">還沒有評量紀錄。完成遊戲或自我評量後，每天的成長都會記在這裡。</p>';
    else h += '<ul class="q-tl">' + hist.slice().reverse().map(function (x, i, arr) {
      var prev = arr[i + 1], db = prev && x.basic.avg != null && prev.basic.avg != null ? x.basic.avg - prev.basic.avg : null, on = ce && ce.day === x.day, last = i === 0;
      var unlockedNow = x.open && prev && !prev.open;
      return '<li class="' + (on ? "on" : "") + '"><div class="q-tl-d"><b>' + md(x.day) + "</b><small>" + x.day.slice(0, 4) + "</small></div>" +
        '<div class="q-tl-m"><span>基礎 <b style="color:' + GROUPS.basic.c + '">' + (x.basic.avg == null ? "—" : r0(x.basic.avg)) + "</b>" + (db != null && Math.abs(db) >= 1 ? ' <em class="' + (db > 0 ? "gr-up" : "gr-dn") + '">' + (db > 0 ? "▲" : "▼") + Math.abs(r0(db)) + "</em>" : "") + "</span>" +
        "<span>進階 <b style=\"color:" + GROUPS.advanced.c + '">' + (x.adv.avg == null ? "—" : r0(x.adv.avg)) + "</b></span><span>探索 " + (x.basic.n + x.adv.n) + "/11</span>" +
        "<small>" + (x.plays ? "遊戲 " + x.plays + " 場" : "") + (x.plays && x.selfN ? "・" : "") + (x.selfN ? "自我評量" : "") + (unlockedNow ? "・🚪 解鎖進階能力" : "") + "</small></div>" +
        (last ? '<span class="q-now">目前</span>' : '<button class="gr-btn" data-cmp="' + x.day + '">' + (on ? "對照中" : "設為對照") + "</button>") + "</li>";
    }).join("") + "</ul>";
    h += "</div>";
    h += '<div class="gr-card"><div class="gr-head"><h3>評量徽章</h3><small>' + bd.filter(function (b) { return b.on; }).length + " / " + bd.length + '</small></div><div class="gr-ms q-badges">' +
      bd.map(function (b) { return '<div class="' + (b.on ? "on" : "") + '"><i>' + b.icon + "</i><b>" + b.name + "</b><small>" + b.how + "</small></div>"; }).join("") + "</div></div>";
    return h;
  }

  // ---------------------------------------------------------------- 對話框：能力說明、自我評量
  function openModalHTML(html) { closeModal(); modal = document.createElement("div"); modal.className = "q-modal"; modal.innerHTML = '<div class="q-dlg gr-card" role="dialog" aria-modal="true">' + html + "</div>"; el.appendChild(modal);
    modal.addEventListener("click", function (e) { if (e.target === modal || (e.target.dataset && e.target.dataset.q === "mclose")) closeModal(); }); }
  function closeModal() { if (modal) { modal.remove(); modal = null; } }
  function openAbility(A) {
    var p = H.curP(), sc = compute(p), s = sc[A], a = AB[A], gid = D.basic.indexOf(A) >= 0 ? "basic" : "advanced", G = GROUPS[gid];
    var locked = gid === "advanced" && !unlocked(sc) && !H.testMode();
    var games = D.games.filter(function (g) { return g.p.indexOf(A) >= 0; });
    var h = '<div class="q-dh" style="--qc:' + G.c + '"><span class="q-tag big">' + A + "</span><div><h3>" + a.name + "</h3><small>" + G.zh + "・" + a.purpose + '</small></div><button class="sh-x" data-q="mclose" aria-label="關閉">×</button></div>';
    h += '<div class="q-break">' + (locked ? '<p class="gr-empty">🔒 進階能力尚未解鎖，先把基礎能力平均練到 ' + UNLOCK_AVG + " 分。</p>" :
      '<div class="q-big" style="color:' + G.c + '">' + (s.score == null ? "尚待探索" : r0(s.score) + "<small> 分</small>") + "</div>" +
      '<div class="gr-kpis">' + kpi("遊戲表現（70%）", s.game == null ? "—" : r0(s.game), s.game == null ? "" : "分") + kpi("自我評量（30%）", s.self == null ? "—" : r0(s.self), s.self == null ? "" : "分") +
      kpi("資料完整度", Math.round(s.comp * 100), "%") + kpi("有效紀錄", s.nGames + " 款", s.nSess + " 場・自評 " + s.nSelf + " 次") + "</div>" +
      (s.at ? '<p class="gr-note">更新時間：' + md(dayOf(s.at)) + "　計分版本：" + SCORE_VER + "</p>" : "")) + "</div>";
    h += '<div class="q-sec"><h4>能力內涵</h4><p>' + esc(a.topics).replace(/、/g, "・") + "</p></div>";
    h += '<div class="q-sec"><h4>提升建議</h4><p>' + TIPS[A] + "</p></div>";
    h += '<div class="q-sec"><h4>可以練習的關卡（主要能力）</h4><div class="q-chips">' + games.map(function (g) { var i = H.gameInfo(g.num) || {}; return '<button data-go="' + g.num + '" class="' + (i.url ? "ok" : "") + '">' + (g.num < 10 ? "0" : "") + g.num + " " + esc(i.name || g.name) + "</button>"; }).join("") + "</div></div>";
    h += '<p class="gr-note">評量邊界：' + esc(a.note) + "</p>";
    openModalHTML(h);
  }
  function openSelf() {
    var p = H.curP(), d = q(p), last = d.self[d.self.length - 1], h = '<div class="q-dh"><span class="q-tag big">📝</span><div><h3>自我評量</h3><small>依照最近的狀況，選出最符合的程度（可以略過不確定的題目）</small></div><button class="sh-x" data-q="mclose" aria-label="關閉">×</button></div><form class="q-self">';
    ["basic", "advanced"].forEach(function (gid) {
      var G = GROUPS[gid]; h += '<h4 style="color:' + G.c + '">' + G.zh + "</h4>";
      D.selfItems.filter(function (it) { return G.list.indexOf(it.code) >= 0; }).forEach(function (it) {
        h += '<div class="q-item"><p class="q-qtext" id="qq-' + it.code + '"><span class="q-tag">' + it.code + '</span><span>' + esc(it.q) + '</span></p><div class="q-scale" role="radiogroup" aria-labelledby="qq-' + it.code + '">' + D.scale.map(function (lab, i) {
          var v = i + 1; return '<label><input type="radio" name="' + it.code + '" value="' + v + '"' + (last && last.a[it.code] === v ? " checked" : "") + "><span><b>" + v + "</b><small>" + lab + "</small></span></label>";
        }).join("") + "</div></div>";
      });
    });
    h += '<p class="gr-note">' + (last ? "已帶入你上次（" + md(dayOf(last.t)) + "）的答案，可以直接修改。" : "建議施測時間：第一次登入、每完成 10 款遊戲、每個月一次。") + '</p><div class="gr-row"><button type="submit" class="gr-btn gold">送出評量</button><button type="button" class="gr-btn" data-q="mclose">取消</button></div></form>';
    openModalHTML(h);
    modal.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault(); var a = {};
      D.abilities.forEach(function (x) { var c = modal.querySelector('input[name="' + x.code + '"]:checked'); if (c) a[x.code] = +c.value; });
      if (!recordSelf(H.curP(), a)) { H.toast("請至少回答一題。"); return; }
      H.saveP(); closeModal(); render(true); H.toast("自我評量已送出，雷達圖已更新（回答 " + Object.keys(a).length + " / 11 題）。");
    });
  }

  function onClick(e) {
    var t = e.target.closest ? e.target.closest("[data-q],[data-qt],[data-ab],[data-go],[data-cmp]") : null; if (!t || !el.contains(t)) return;
    if (t.dataset.qt) { tab = t.dataset.qt; render(true); return; }
    if (t.dataset.ab) { openAbility(t.dataset.ab); return; }
    if (t.dataset.go) { var n = +t.dataset.go; closeModal(); close(); H.goStation(n); return; }
    if (t.dataset.cmp) { cmpDay = t.dataset.cmp; showCmp = true; render(false); H.toast("已設為對照：" + md(cmpDay) + "，切到雷達圖就能看到。"); return; }
    var k = t.dataset.q;
    if (k === "close") close();
    else if (k === "self") openSelf();
    else if (k === "cmp") { showCmp = !showCmp; render(false); }
    else if (k === "demo") { var p = H.curP(); seedDemo(p); H.saveP(); cmpDay = "auto"; render(true); H.toast("已載入示範評量資料。"); }
    else if (k === "clear") { if (!window.confirm("確定要清除這位玩家的所有評量紀錄嗎？（遊戲進度不受影響）")) return; var p2 = H.curP(); p2.q11 = { v: 1, ev: [], self: [] }; H.saveP(); cmpDay = "auto"; render(true); H.toast("已清除評量資料。"); }
  }

  // ---------------------------------------------------------------- 示範資料
  function seedDemo(p) {
    var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var now = nowS(), DAY = 86400, days = [-49, -40, -32, -25, -18, -12, -7, -3, -1];
    // [遊戲編號, 起始分, 最後分, 從第幾次開始玩]
    var plan = [[1, 52, 80, 0], [2, 55, 78, 0], [3, 48, 74, 0], [5, 50, 70, 1], [8, 46, 66, 2], [10, 44, 66, 3], [13, 40, 60, 3], [15, 44, 72, 4], [24, 42, 62, 4], [33, 50, 68, 5], [36, 45, 64, 5], [31, 36, 52, 6]];
    var d = { v: 1, ev: [], self: [] };
    days.forEach(function (off, k) {
      var base = now + off * DAY - 6 * 3600;
      plan.forEach(function (x, j) {
        if (k < x[3]) return; var f = (k - x[3]) / Math.max(1, days.length - 1 - x[3]);
        var s = x[1] + (x[2] - x[1]) * f + (rnd() - 0.5) * 8; d.ev.push([base + j * 300, x[0], Math.max(0, Math.min(100, Math.round(s))), 180 + Math.round(rnd() * 240)]);
      });
    });
    d.self.push({ t: now + days[0] * DAY - 7 * 3600, a: { HQ: 3, EQ: 3, NQ: 2, AQ: 3, IQ: 3, MQ: 3, CQ: 3, RQ: 3, FQ: 2, SQ: 3 }, ver: SELF_VER });
    d.self.push({ t: now - 9 * DAY - 7 * 3600, a: { HQ: 4, EQ: 4, NQ: 3, AQ: 4, IQ: 4, MQ: 4, CQ: 4, RQ: 3, FQ: 3, SQ: 4 }, ver: SELF_VER });
    d.ev.sort(function (a, b) { return a[0] - b[0]; });
    p.q11 = d; return d;
  }

  window.MFQ = {
    init: function (hooks) { H = hooks || {}; if (!H.testMode) H.testMode = function () { return false; }; if (!H.toast) H.toast = function () {}; if (!H.gameInfo) H.gameInfo = function () { return null; }; if (!H.goStation) H.goStation = function () {}; },
    open: open, close: close, record: record, recordSelf: recordSelf, compute: compute, history: history, groupStat: groupStat, unlocked: unlocked, seedDemo: seedDemo,
    data: D, version: SCORE_VER, isOpen: function () { return !!el && !el.hidden; }
  };
})();
