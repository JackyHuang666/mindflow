// 11Q 計分引擎自動測試：node q11/test.js（不需瀏覽器）
var fs = require("fs"), path = require("path");
global.window = {}; global.document = undefined;
eval(fs.readFileSync(path.join(__dirname, "q11-data.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "q11.js"), "utf8"));
var M = window.MFQ, pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; console.log("✗ " + name); } }
function near(a, b) { return a != null && Math.abs(a - b) < 0.01; }
M.init({});

// 1. 沒有資料：全部尚待探索（null，不是 0）
var p = {}; var sc = M.compute(p);
ok(Object.keys(sc).length === 11, "11 項能力");
ok(Object.keys(sc).every(function (k) { return sc[k].score === null; }), "無資料不補 0");

// 2. 只有遊戲：MF-001 迷宮尋寶（IQ、AQ 主要；RQ 次要不計）
M.record(p, 1, 80, 120); sc = M.compute(p);
ok(near(sc.IQ.score, 80) && near(sc.AQ.score, 80), "主要能力取遊戲分數");
ok(sc.RQ.score === null, "次要能力不計入正式分數");
ok(near(sc.IQ.comp, 0.7), "只有遊戲：完整度 70%");

// 3. 加自評：70% 遊戲 + 30% 自評；IQ 自評 3 → 50 分
M.recordSelf(p, { IQ: 3, TQ: 5 }); sc = M.compute(p);
ok(near(sc.IQ.score, 80 * 0.7 + 50 * 0.3), "70/30 加權");
ok(near(sc.TQ.score, 100) && near(sc.TQ.comp, 0.3), "只有自評：重新正規化為自評分數");
ok(sc.AQ.self === null && near(sc.AQ.score, 80), "缺答不算 0");

// 4. 同一款遊戲只取最近 3 場；跨遊戲各款等權
var p2 = {}; [10, 10, 10, 60, 60, 60].forEach(function (s) { M.record(p2, 1, s, 60); });
ok(near(M.compute(p2).IQ.game, 60), "最近 3 場平均");
for (var i = 0; i < 20; i++) M.record(p2, 2, 100, 60);   // 記憶星球（IQ、CQ）玩很多次
ok(near(M.compute(p2).IQ.game, 80), "跨遊戲等權，不因遊玩次數壟斷");

// 5. 無效輸入
ok(M.record(p2, 999, 50) === false, "未知遊戲不記錄");
ok(M.recordSelf(p2, { IQ: 9 }) === false, "自評超出 1–5 不記錄");

// 6. 進階解鎖：基礎 6 項都有分數且平均 ≥ 60
var p3 = {}; M.recordSelf(p3, { HQ: 4, EQ: 4, NQ: 4, AQ: 4, IQ: 4 });
ok(!M.unlocked(M.compute(p3)), "基礎缺 1 項不解鎖");
M.recordSelf(p3, { HQ: 4, EQ: 4, NQ: 4, AQ: 4, IQ: 4, MQ: 3 });   // 75×5＋50 → 平均 70.8
ok(M.unlocked(M.compute(p3)), "基礎平均 ≥ 60 解鎖");
var p4 = {}; M.recordSelf(p4, { HQ: 3, EQ: 3, NQ: 3, AQ: 3, IQ: 3, MQ: 3 });
ok(!M.unlocked(M.compute(p4)), "平均 50 不解鎖");

// 7. 示範資料與成長歷程
var p5 = {}; M.seedDemo(p5); var h = M.history(p5), last = h[h.length - 1];
ok(h.length >= 5, "示範資料有多天歷程");
ok(last.open, "示範資料最後已解鎖進階");
ok(M.compute(p5).TQ.score === null, "示範資料 TQ 尚待探索");
ok(h[0].basic.avg < last.basic.avg, "示範資料呈現成長");

console.log(pass + " 通過，" + fail + " 失敗");
process.exit(fail ? 1 : 0);
