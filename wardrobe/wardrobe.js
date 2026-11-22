/*!
 * SWT MindFlow 我的穿搭（360° 試衣間）MFWardrobe v1.0
 * 位置：角色檔案 →「角色」分頁，頭像卡片下方。
 *
 * 時裝 = 整套造型（每套有男生版與女生版，各 4 個角度的設定圖）：wardrobe/img/<套裝>_m.webp、_f.webp
 *   每張圖是 4 格橫排（正面、斜側、背面、側面），每格 410×575。360° 用 6 個角度：正面、右前、右側、背面、左側、左前（斜側／側面視需要左右翻轉）。
 * 配件（髮型、帽子、外套、鞋子、手持物…）來自各套裝，標示「男生／女生／男女共用」。
 *   切換男生／女生後，只會看到該性別能穿的時裝（含男女共用）。目前點配件 = 換上它所屬的整套（設定圖是整套畫的）。
 *
 * 玩家資料：p.wd = { g: "m"|"f", cur: 套裝 id, own: { 套裝 id: 1 } }，隨 mf-player-v1 同步雲端。
 * 兌換：用智慧星星 p.stars（測試模式免費）。兌換一次，男生版與女生版都會收進衣櫥。
 *
 * 用法（index.html）：
 *   MFWardrobe.init({ getP, save, testMode, toast, log, onChange });
 *   renderMe 裡放 MFWardrobe.html()，pdBody.innerHTML 之後呼叫 MFWardrobe.mount(pdBody)。
 */
(function (global) {
  "use strict";
  var VER = "5";
  var BASE = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^/]*$/, "") : "wardrobe/"; })();

  // 套裝：id、名稱、分類、價格（智慧星星）、g：MF＝分男女版、U＝男女共用；d：男／女的［斜側、側面］臉朝右＝1、朝左＝-1
  var OUT = [
    { id: "bp", zh: "背包客", cat: "冒險", price: 0, g: "MF", d: [[1, -1], [1, -1]] },
    { id: "yoga", zh: "瑜伽運動", cat: "運動", price: 18, g: "MF", d: [[-1, 1], [-1, 1]] },
    { id: "ball", zh: "籃球健將", cat: "運動", price: 20, g: "MF", d: [[1, -1], [-1, 1]] },
    { id: "story", zh: "冬日說書人", cat: "休閒", price: 24, g: "MF", d: [[-1, 1], [1, -1]] },
    { id: "swim", zh: "夏日泳裝", cat: "休閒", price: 22, g: "MF", d: [[-1, 1], [-1, 1]] },
    { id: "school", zh: "校園制服", cat: "學院", price: 12, g: "MF", d: [[-1, -1], [-1, -1]] },
    { id: "sci", zh: "小小科學家", cat: "學院", price: 24, g: "U", d: [[1, -1], [-1, -1]] },
    { id: "sage", zh: "古風學者", cat: "學院", price: 28, g: "U", d: [[-1, 1], [-1, 1]] },
    { id: "teach", zh: "溫柔老師", cat: "職業", price: 24, g: "MF", d: [[-1, 1], [1, -1]] },
    { id: "biz", zh: "職場菁英", cat: "職業", price: 26, g: "MF", d: [[1, -1], [-1, 1]] },
    { id: "wiz", zh: "星空魔法師", cat: "奇幻", price: 36, g: "MF", d: [[-1, 1], [1, -1]] }
  ];
  var CATS = ["全部", "冒險", "運動", "休閒", "學院", "職業", "奇幻"];
  // 縮圖範圍（以單格 820×1150 為準）
  var RG = { hair: [200, 40, 420, 440], hat: [90, 30, 640, 380], glasses: [250, 240, 320, 180], top: [210, 440, 400, 340], coat: [140, 420, 540, 500], bottom: [230, 740, 360, 380], shoes: [190, 1000, 440, 150], scarf: [210, 390, 400, 300], back: [150, 380, 520, 540], L: [0, 340, 430, 560], R: [390, 340, 430, 560], Rlow: [400, 620, 420, 380], whole: [60, 30, 700, 1120], face: [250, 70, 320, 320] };
  // [名稱, 子分類, 適用 U/M/F, 角度, 範圍]
  var PARTS = {
    bp: [["俐落短髮", "hair", "M", 0, "hair"], ["自然長髮", "hair", "F", 0, "hair"], ["背包客外套", "coat", "M", 0, "coat"], ["背包客連帽外套", "coat", "F", 0, "coat"], ["咖啡工作褲", "bottom", "U", 0, "bottom"], ["登山背包", "bag", "U", 2, "back"], ["登山靴", "shoes", "U", 0, "shoes"], ["黃金指南針", "held", "U", 3, "L"]],
    yoga: [["運動連帽外套", "coat", "U", 0, "coat"], ["灰色 T 恤", "top", "M", 0, "top"], ["灰色運動背心", "top", "F", 0, "top"], ["黑色運動長褲", "bottom", "U", 0, "bottom"], ["灰色休閒鞋", "shoes", "U", 0, "shoes"], ["瑜伽墊", "bag", "U", 0, "Rlow"], ["運動水壺", "held", "U", 0, "L"], ["圓框眼鏡", "glasses", "U", 0, "glasses"]],
    ball: [["藍色運動 T 恤", "top", "M", 0, "top"], ["藍白拉克蘭上衣", "top", "F", 0, "top"], ["黑色運動短褲", "bottom", "M", 0, "bottom"], ["深藍運動短褲", "bottom", "F", 0, "bottom"], ["藍色籃球鞋", "shoes", "U", 0, "shoes"], ["籃球", "held", "U", 0, "R"], ["運動手錶", "watch", "U", 0, "R"], ["活力馬尾", "hair", "F", 1, "hair"]],
    story: [["格紋圍巾", "scarf", "U", 0, "scarf"], ["米白針織外套", "coat", "U", 0, "coat"], ["淺藍襯衫", "top", "U", 0, "top"], ["咖啡西裝褲", "bottom", "M", 0, "bottom"], ["咖啡長裙", "bottom", "F", 0, "bottom"], ["綁帶皮鞋", "shoes", "M", 0, "shoes"], ["咖啡娃娃鞋", "shoes", "F", 0, "shoes"], ["帆布郵差包", "bag", "U", 2, "back"], ["復古提燈", "held", "U", 0, "R"], ["心形繪本", "book", "U", 0, "L"]],
    swim: [["草帽＋太陽眼鏡", "hat", "U", 0, "hat"], ["夏威夷襯衫", "top", "M", 0, "coat"], ["條紋泳褲", "bottom", "M", 0, "bottom"], ["條紋連身泳裝", "top", "F", 0, "top"], ["白色紗裙", "bottom", "F", 0, "bottom"], ["沙灘拖鞋", "shoes", "U", 0, "shoes"], ["草編提籃", "bag", "U", 0, "Rlow"], ["椰子飲料", "held", "U", 0, "L"]],
    school: [["校徽短袖襯衫", "top", "M", 0, "top"], ["紅領結白襯衫", "top", "F", 0, "top"], ["深藍短褲", "bottom", "M", 0, "bottom"], ["深藍百褶裙", "bottom", "F", 0, "bottom"], ["深藍書包", "bag", "U", 2, "back"], ["白色帆布鞋", "shoes", "M", 0, "shoes"], ["咖啡皮鞋＋白襪", "shoes", "F", 0, "shoes"]],
    sci: [["白色實驗袍", "coat", "U", 0, "coat"], ["卡其長褲", "bottom", "U", 0, "bottom"], ["白色球鞋", "shoes", "U", 0, "shoes"], ["錐形燒瓶", "held", "U", 0, "L"], ["原子科學書", "book", "U", 0, "R"]],
    sage: [["古風學者長袍", "coat", "U", 0, "coat"], ["古風長褲", "bottom", "U", 0, "bottom"], ["古風布鞋", "shoes", "U", 0, "shoes"], ["皮革書包", "bag", "U", 0, "Rlow"], ["古董鑰匙", "held", "U", 0, "L"], ["古籍", "book", "U", 0, "R"]],
    teach: [["卡其西裝外套", "coat", "M", 0, "coat"], ["卡其針織外套", "coat", "F", 0, "coat"], ["白色上衣", "top", "U", 0, "top"], ["咖啡九分褲", "bottom", "M", 0, "bottom"], ["咖啡百褶裙", "bottom", "F", 0, "bottom"], ["咖啡樂福鞋", "shoes", "M", 0, "shoes"], ["圓頭平底鞋", "shoes", "F", 0, "shoes"], ["教鞭", "held", "U", 0, "R"], ["綠色課本", "book", "U", 0, "L"]],
    biz: [["深藍西裝外套", "coat", "U", 0, "coat"], ["白襯衫", "top", "U", 0, "top"], ["藍色斜紋領帶", "scarf", "M", 0, "scarf"], ["西裝長褲", "bottom", "U", 0, "bottom"], ["咖啡皮鞋", "shoes", "M", 0, "shoes"], ["黑色低跟鞋", "shoes", "F", 0, "shoes"], ["銀色筆電", "held", "U", 0, "L"]],
    wiz: [["星空法袍", "coat", "M", 0, "whole"], ["星空法袍（長裙版）", "coat", "F", 0, "whole"], ["星芒水晶杖", "held", "M", 0, "R"], ["星星法杖", "held", "F", 0, "R"], ["魔法書", "book", "U", 0, "L"], ["黑色長靴", "shoes", "M", 0, "shoes"], ["咖啡平底鞋", "shoes", "F", 0, "shoes"], ["圓框眼鏡", "glasses", "M", 0, "glasses"]]
  };
  var GROUPS = [
    { id: "head", zh: "頭部裝備", side: "L", subs: [["髮型", "hair"], ["帽子", "hat"], ["眼鏡", "glasses"]] },
    { id: "body", zh: "身體服裝", side: "L", subs: [["外套", "coat"], ["上衣", "top"], ["褲子・裙子", "bottom"]] },
    { id: "acc", zh: "隨身配件", side: "L", subs: [["背包", "bag"], ["圍巾・領帶", "scarf"], ["披風", "cape"], ["翅膀", "wings"]] },
    { id: "limb", zh: "手腳裝備", side: "R", subs: [["鞋子", "shoes"], ["手錶", "watch"], ["手套", "gloves"]] },
    { id: "hand", zh: "手飾", side: "R", subs: [["手持道具", "held"], ["書本", "book"]] }
  ];
  var ANG = [["正面", 0], ["右前方", 60], ["右側", 120], ["背面", 180], ["左側", 240], ["左前方", 300]];

  var H = { getP: null, save: function () {}, testMode: function () { return false; }, toast: function (m) { try { alert(m); } catch (e) {} }, log: function () {}, onChange: function () {} };
  var S = { frame: 0, auto: true, tab: "set", sub: 0, cat: "全部", try: null, msg: "", timer: 0, last: 0, root: null };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function outOf(id) { for (var i = 0; i < OUT.length; i++) if (OUT[i].id === id) return OUT[i]; return OUT[0]; }
  function wd(p) {
    if (!p.wd || typeof p.wd !== "object") p.wd = {};
    if (p.wd.g !== "m" && p.wd.g !== "f") p.wd.g = "m";
    if (!p.wd.own || typeof p.wd.own !== "object") p.wd.own = {};
    p.wd.own.bp = 1;
    if ("col" in p.wd) { delete p.wd.col; S.dirty = true; }   // 調色盤功能已移除：清掉舊的配色設定（存檔後雲端也會一起移除）
    if (!PARTS[p.wd.cur]) p.wd.cur = "bp";
    return p.wd;
  }
  function owns(p, id) { return !!wd(p).own[id]; }
  function src(id, g) { return BASE + "img/" + id + "_" + g + ".webp?v=" + VER; }
  function fits(pg, g) { return pg === "U" || (pg === "M" && g === "m") || (pg === "F" && g === "f"); }
  function badge(pg) { return pg === "U" ? ["男女共用", "u"] : pg === "M" ? ["男生", "m"] : ["女生", "f"]; }
  // 縮圖：預先裁好的縮圖集 img/thumbs_<m|f>.webp（每格 152×152、每列 10 格），順序＝每套［全身、臉、該性別可穿的配件…］
  //   只載入一張小圖，不必為了縮圖把 11 張四視角大圖都解碼（手機記憶體不足會造成網頁閃退）
  var TS = 152, TCOLS = 10, ATL = { m: {}, f: {} }, AROWS = { m: 0, f: 0 };
  ["m", "f"].forEach(function (g) {
    var i = 0;
    OUT.forEach(function (o) {
      ATL[g][o.id + "|whole"] = i++; ATL[g][o.id + "|face"] = i++;
      PARTS[o.id].forEach(function (pt, k) { if (fits(pt[2], g)) ATL[g][o.id + "|" + k] = i++; });
    });
    AROWS[g] = Math.ceil(i / TCOLS);
  });
  function thumb(id, g, key, size, alt) {
    var i = ATL[g][id + "|" + key]; if (i == null) i = ATL[g][id + "|whole"];
    var k = size / TS, st = "width:" + (TS * TCOLS * k).toFixed(1) + "px;height:" + (TS * AROWS[g] * k).toFixed(1) + "px;left:-" + ((i % TCOLS) * size) + "px;top:-" + (Math.floor(i / TCOLS) * size) + "px";
    return '<span class="wd-th" style="width:' + size + "px;height:" + size + 'px"><img src="' + BASE + "img/thumbs_" + g + ".webp?v=" + VER + '" alt="' + esc(alt || "") + '" style="' + st + '" decoding="async" draggable="false"></span>';
  }
  function shown(p) { return S.try || wd(p).cur; }   // 舞台上顯示的套裝（試穿優先）
  function seq(o, g) {
    var d = o.d[g === "m" ? 0 : 1];
    return [[0, 0], [1, d[0] !== 1], [3, d[1] !== 1], [2, 0], [3, d[1] !== -1], [1, d[0] !== -1]];
  }

  function html() { return '<div class="pd-card wd-card" id="wd-card" aria-label="我的穿搭"></div>'; }

  function render() {
    var el = S.root && S.root.querySelector("#wd-card"); if (!el || !H.getP) return;
    var p = H.getP(), w = wd(p), g = w.g, cid = shown(p), o = outOf(cid), sq = seq(o, g);
    var parts = PARTS[cid].map(function (x, k) { return x.concat([k]); }).filter(function (x) { return fits(x[2], g); });
    function slot(G) {
      var keys = G.subs.map(function (s) { return s[1]; }), ps = parts.filter(function (x) { return keys.indexOf(x[1]) >= 0; });
      return '<button type="button" class="wd-slot' + (S.tab === G.id ? " on" : "") + '" data-wd="tab" data-v="' + G.id + '" aria-label="' + G.zh + (ps.length ? "：" + ps.map(function (x) { return x[0]; }).join("、") : "：未裝備") + '">' +
        '<span class="wd-sbox">' + (ps.length ? thumb(cid, g, ps[0][5], 44, ps[0][0]) : '<i class="wd-plus" aria-hidden="true"></i>') + (ps.length > 1 ? '<b class="wd-more">+' + (ps.length - 1) + "</b>" : "") + "</span><span class=\"wd-sl\">" + G.zh + "</span></button>";
    }
    var q0 = sq[S.frame], frames = '<div class="wd-fr on' + (q0[1] ? " flip" : "") + '"><img src="' + src(cid, g) + '" alt="" decoding="async" draggable="false" style="left:-' + q0[0] * 100 + '%"></div>';
    var tried = S.try && !owns(p, S.try), bdg = o.g === "U" ? ["男女共用", "u"] : g === "m" ? ["男生版", "m"] : ["女生版", "f"];
    var h = '<div class="wd-head"><h3>👕 我的穿搭<small>' + (tried ? "試穿中" : "左右拖曳可以 360° 轉動") + '</small></h3>' +
      '<div class="wd-seg" role="group" aria-label="角色性別"><button type="button" data-wd="g" data-v="m"' + (g === "m" ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>男生</button><button type="button" data-wd="g" data-v="f"' + (g === "f" ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + ">女生</button></div></div>";
    h += '<div class="wd-stage" data-wd-stage>' + 
      '<div class="wd-floor" aria-hidden="true"></div><div class="wd-fig" role="img" aria-label="' + esc(o.zh + "（" + bdg[0] + "），" + ANG[S.frame][0]) + '">' + frames + "</div>" +
      '<div class="wd-name"><span class="wd-b ' + bdg[1] + '">' + bdg[0] + "</span>" + esc(o.zh) + "</div>" +
      '<div class="wd-col l">' + GROUPS.filter(function (G) { return G.side === "L"; }).map(slot).join("") + "</div>" +
      '<div class="wd-col r">' + GROUPS.filter(function (G) { return G.side === "R"; }).map(slot).join("") +
      '<button type="button" class="wd-auto' + (S.auto ? " on" : "") + '" data-wd="auto" aria-pressed="' + S.auto + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>' + (S.auto ? "自動旋轉中" : "自動旋轉") + "</button></div>" +
      (tried ? '<div class="wd-try"><button type="button" class="wd-buy" data-wd="buy">' + (H.testMode() ? "測試模式免費兌換" : "⭐ " + o.price + " 兌換") + '</button><button type="button" class="wd-cancel" data-wd="untry">取消試穿</button></div>' : "") +
      '<div class="wd-nav"><button type="button" class="wd-arw" data-wd="turn" data-v="-1" aria-label="往左轉"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>' +
      '<div class="wd-ang"><b>360°・' + ANG[S.frame][0] + "・" + ANG[S.frame][1] + '°</b><span>' + ANG.map(function (a, i) { return '<button type="button" data-wd="fr" data-v="' + i + '" aria-label="' + a[0] + '"' + (i === S.frame ? ' class="on"' : "") + "></button>"; }).join("") + "</span></div>" +
      '<button type="button" class="wd-arw" data-wd="turn" data-v="1" aria-label="往右轉"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></div></div>';
    // 清單
    var tabs = [{ id: "set", zh: "整套造型" }].concat(GROUPS);
    h += '<div class="wd-tabs" role="tablist">' + tabs.map(function (t) { return '<button type="button" role="tab" aria-selected="' + (S.tab === t.id) + '" data-wd="tab" data-v="' + t.id + '"' + (S.tab === t.id ? ' class="on"' : "") + ">" + t.zh + "</button>"; }).join("") + "</div>";
    var chips = "", cards = [];
    if (S.tab === "set") {
      chips = CATS.map(function (c) { return '<button type="button" data-wd="cat" data-v="' + c + '"' + (S.cat === c ? ' class="on"' : "") + ">" + c + "</button>"; }).join("");
      OUT.forEach(function (x) {
        if (S.cat !== "全部" && x.cat !== S.cat) return;
        var b = x.g === "U" ? ["男女共用", "u"] : g === "m" ? ["男生版", "m"] : ["女生版", "f"], on = x.id === cid;
        var tag = on ? (owns(p, x.id) ? "穿戴中" : "試穿中") : owns(p, x.id) ? "已擁有" : "⭐ " + x.price;
        cards.push('<button type="button" class="wd-it' + (on ? " on" : "") + '" data-wd="wear" data-v="' + x.id + '"><span class="wd-b ' + b[1] + '">' + b[0] + "</span>" + thumb(x.id, g, "whole", 76, x.zh) + "<b>" + esc(x.zh) + "</b><small>" + tag + "</small></button>");
      });
    } else {
      var G = GROUPS.filter(function (q) { return q.id === S.tab; })[0], key = G.subs[S.sub] ? G.subs[S.sub][1] : G.subs[0][1];
      chips = G.subs.map(function (s, i) { return '<button type="button" data-wd="sub" data-v="' + i + '"' + (S.sub === i ? ' class="on"' : "") + ">" + s[0] + "</button>"; }).join("");
      OUT.forEach(function (x) {
        PARTS[x.id].forEach(function (pt, pk) {
          if (pt[1] !== key || !fits(pt[2], g)) return;
          var b = badge(pt[2]), on = x.id === cid;
          cards.push('<button type="button" class="wd-it' + (on ? " on" : "") + '" data-wd="wear" data-v="' + x.id + '"><span class="wd-b ' + b[1] + '">' + b[0] + "</span>" + thumb(x.id, g, pk, 76, pt[0]) + "<b>" + esc(pt[0]) + "</b><small>" + (on ? "穿戴中" : "來自「" + esc(x.zh) + "」" + (owns(p, x.id) ? "" : "・⭐ " + x.price)) + "</small></button>");
        });
      });
    }
    h += '<div class="wd-chips">' + chips + "</div>" +
      '<p class="wd-note">' + (g === "m" ? "只顯示男生可以穿的時裝（含男女共用）" : "只顯示女生可以穿的時裝（含男女共用）") + "。點一下就會換上或試穿整套造型。</p>" +
      (cards.length ? '<div class="wd-grid">' + cards.join("") + "</div>" : '<div class="wd-empty">🔒 敬請期待，之後會在商店上架</div>') +
      (S.msg ? '<p class="wd-msg" role="status">' + esc(S.msg) + "</p>" : "");
    el.innerHTML = h;
    if (S.dirty) { S.dirty = false; H.save(); }
  }

  function setFrame(i) {
    S.frame = (i % 6 + 6) % 6;
    var el = S.root && S.root.querySelector("#wd-card"); if (!el) return;
    var fr = el.querySelector(".wd-fr"), p = H.getP && H.getP();
    if (fr && p) { var q = seq(outOf(shown(p)), wd(p).g)[S.frame]; fr.classList.toggle("flip", !!q[1]); fr.firstChild.style.left = "-" + q[0] * 100 + "%";}
    var k, dots = el.querySelectorAll(".wd-ang span button"); for (k = 0; k < dots.length; k++) dots[k].classList.toggle("on", k === S.frame);
    var b = el.querySelector(".wd-ang b"); if (b) b.textContent = "360°・" + ANG[S.frame][0] + "・" + ANG[S.frame][1] + "°";
    var fig = el.querySelector(".wd-fig"); if (fig) fig.setAttribute("aria-label", fig.getAttribute("aria-label").replace(/，[^，]*$/, "，" + ANG[S.frame][0]));
  }
  function syncAuto() {
    var b = S.root && S.root.querySelector("#wd-card .wd-auto"); if (!b) return;
    b.classList.toggle("on", S.auto); b.setAttribute("aria-pressed", String(S.auto));
    b.lastChild.nodeValue = S.auto ? "自動旋轉中" : "自動旋轉";
  }
  function visible() { var el = S.root && S.root.querySelector("#wd-card"); if (!el || !el.isConnected) return false; var d = el.closest("#pdraw"); return !d || (!d.hidden && d.classList.contains("show")); }
  function tick() {
    var el = S.root && S.root.querySelector("#wd-card");
    if (!el) { clearInterval(S.timer); S.timer = 0; return; }
    // 抽屜關閉或切到背景時清空卡片、釋放圖片記憶體；回來時再畫
    var vis = visible() && !document.hidden;
    if (!vis) { if (!S.cleared && el.firstChild) { el.innerHTML = ""; S.cleared = true; } return; }
    if (S.cleared) { S.cleared = false; render(); return; }
    if (S.auto && !S.drag && !document.hidden && visible() && Date.now() - S.last > 2500) setFrame(S.frame + 1);
  }

  function wear(p, id) {
    var w = wd(p), o = outOf(id);
    if (owns(p, id)) { w.cur = id; S.try = null; S.msg = "已換上「" + o.zh + "」"; H.save(); }
    else { S.try = id; S.msg = "試穿「" + o.zh + "」中，兌換後才會存成你的造型"; }
    S.frame = 0;
  }
  function buy(p) {
    var id = S.try; if (!id) return;
    var o = outOf(id), free = H.testMode();
    if (!free) {
      if (typeof p.stars !== "number") p.stars = 0;
      if (p.stars < o.price) { S.msg = "智慧星星不夠：需要 ⭐ " + o.price + "，目前有 ⭐ " + p.stars + "。完成迷宮尋寶、記憶星球的關卡可以獲得星星。"; return; }
      p.stars -= o.price;
    }
    var w = wd(p); w.own[id] = 1; w.cur = id; S.try = null;
    try { H.log(p, "兌換時裝「" + o.zh + "」" + (free ? "（測試模式）" : "（⭐ −" + o.price + "）")); } catch (e) {}
    H.save();
    S.msg = "已兌換「" + o.zh + "」，男生版和女生版都收進衣櫥了";
    H.toast("👕 已兌換「" + o.zh + "」");
    H.onChange();
  }

  function onClick(e) {
    var b = e.target.closest("[data-wd]"); if (!b || !S.root.contains(b)) return;
    e.stopPropagation();
    var p = H.getP(), a = b.dataset.wd, v = b.dataset.v;
    if (a === "fr") { S.auto = false; S.last = Date.now(); syncAuto(); return setFrame(+v); }
    if (a === "turn") { S.auto = false; S.last = Date.now(); syncAuto(); return setFrame(S.frame + (+v)); }
    if (a === "auto") { S.auto = !S.auto; S.last = 0; }
    else if (a === "g") { wd(p).g = v === "f" ? "f" : "m"; H.save(); S.msg = ""; }
    else if (a === "tab") { S.tab = v; S.sub = 0; }
    else if (a === "sub") S.sub = +v;
    else if (a === "cat") S.cat = v;
    else if (a === "wear") wear(p, v);
    else if (a === "untry") { S.try = null; S.msg = ""; S.frame = 0; }
    else if (a === "buy") { buy(p); }
    render();
  }
  // 拖曳轉動：水平拖曳才轉，垂直仍可捲動
  var drag = null;
  function onDown(e) {
    var st = e.target.closest("[data-wd-stage]"); if (!st || e.target.closest("button")) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, f: S.frame, h: e.pointerType === "mouse" ? true : null, el: st };
    if (drag.h) { S.drag = true; try { st.setPointerCapture(e.pointerId); } catch (er) {} }
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.h === null) { if (Math.abs(dx) + Math.abs(dy) < 8) return; drag.h = Math.abs(dx) > Math.abs(dy); if (!drag.h) { drag = null; return; } S.drag = true; try { drag.el.setPointerCapture(e.pointerId); } catch (er) {} }
    if (S.auto) { S.auto = false; syncAuto(); } S.last = Date.now();
    var f = drag.f + Math.round(-dx / 36); if (((f % 6) + 6) % 6 !== S.frame) setFrame(f);
    e.preventDefault();
  }
  function onUp(e) { if (drag && e.pointerId === drag.id) { drag = null; S.drag = false; S.last = Date.now(); } }

  function mount(root) {
    if (!root) return;
    if (S.root !== root) {
      S.root = root;
      root.addEventListener("click", onClick);
      root.addEventListener("pointerdown", onDown);
      root.addEventListener("pointermove", onMove, { passive: false });
      root.addEventListener("pointerup", onUp); root.addEventListener("pointercancel", onUp);
    }
    if (!root.querySelector("#wd-card")) return;
    S.cleared = false; render();
    if (!S.timer) S.timer = setInterval(tick, 1100);
  }
  function init(o) {
    for (var k in o) if (o[k]) H[k] = o[k];
    // 開站時就清掉目前玩家存檔裡舊的調色盤設定
    setTimeout(function () { try { var p = H.getP && H.getP(); if (p && p.wd && "col" in p.wd) { delete p.wd.col; H.save(); } } catch (e) {} }, 1500);
  }
  /** 目前穿著的套裝與性別（給其他功能用，例如之後換頭像或遊戲角色） */
  function current(p) { var w = wd(p); return { id: w.cur, g: w.g, name: outOf(w.cur).zh, img: src(w.cur, w.g) }; }

  global.MFWardrobe = { version: "1.0.0", init: init, html: html, mount: mount, current: current, OUTFITS: OUT, PARTS: PARTS, GROUPS: GROUPS };
})(window);
