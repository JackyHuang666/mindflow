'use strict';
/* 角色冒險 36 關：6 種地圖 × 3 種大小 × 有／無小地圖，由易到難排序。
   每關使用固定的迷宮種子，所以同一關每次都是同一張地圖，星星標準才公平。
   智慧星星：每關最多 3 顆，全部 36 關共 108 顆（總數固定，重玩只會補上差額）。 */
(function (root) {
  const SIZES = [{ li: 0, n: '13×13' }, { li: 1, n: '19×19' }, { li: 2, n: '25×25' }];
  const MAPS = ['竹林', '深海珊瑚', '沙漠綠洲', '雪原極光', '星夜', '秋日楓林'];
  // 同一組（大小＋有無小地圖）內，依地圖的參考完成時間由短到長排列（事先以 thresholds() 算好）
  const ORDER = [[2, 0, 5, 3, 4, 1], [3, 0, 2, 5, 1, 4], [0, 5, 1, 2, 4, 3], [5, 1, 3, 0, 4, 2], [2, 5, 0, 3, 4, 1], [3, 5, 0, 2, 1, 4]];
  const LEVELS = [];
  SIZES.forEach((s, si) => [true, false].forEach(mini => {
    const tier = si * 2 + (mini ? 0 : 1);
    ORDER[tier].forEach(th => LEVELS.push({ id: LEVELS.length + 1, li: s.li, th, map: mini, size: s.n, mapName: MAPS[th], seed: 20251 + (tier * 6 + th + 1) * 7919, tier }));
  }));
  const LIMIT1 = 480;   // ★：8 分鐘內完成（國小一年級的能力）

  /* 依地圖算出合理的完成時間：最短路線長度 ÷ 移動速度，再加上抓放寶石的時間。
     ★★（國中二年級）與 ★★★（高中三年級）以這個時間乘上探索係數，沒有小地圖時多給一些時間。 */
  function thresholds(lv, level, CS) {
    CS = CS || 1.25;
    const W = lv.W, H = lv.H, g = lv.g;
    function bfs(from) {
      const d = new Int32Array(W * H).fill(-1), q = [from]; d[from] = 0;
      for (let h = 0; h < q.length; h++) {
        const c = q[h], x = c % W, y = c / W | 0;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(o => {
          const nx = x + o[0], ny = y + o[1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
          const n = ny * W + nx; if (g[n] || d[n] >= 0) return; d[n] = d[c] + 1; q.push(n);
        });
      }
      return d;
    }
    const id = p => p[1] * W + p[0];
    let at = lv.spawn, dist = 0; const left = lv.balls.map((b, i) => i);
    while (left.length) {              // 每次先去最近的寶石，再搬到它的寶箱
      const d = bfs(at); left.sort((a, b) => d[id(lv.balls[a])] - d[id(lv.balls[b])]);
      const i = left.shift(); dist += Math.max(0, d[id(lv.balls[i])]);
      dist += Math.max(0, bfs(id(lv.balls[i]))[id(lv.targets[i])]); at = id(lv.targets[i]);
    }
    const base = dist * CS / 2.6 + lv.balls.length * 4;          // 熟練玩家的參考時間（秒）
    const explore = level && level.map === false ? 1.3 : 1;
    let t3 = Math.round(base * 2.4 * explore), t2 = Math.round(base * 3.8 * explore);
    t3 = Math.max(60, Math.min(t3, 300)); t2 = Math.max(t3 + 45, Math.min(t2, 420));
    return { t1: LIMIT1, t2, t3, base: Math.round(base) };
  }
  function starsFor(sec, th) { return sec <= th.t3 ? 3 : sec <= th.t2 ? 2 : sec <= th.t1 ? 1 : 0; }
  const fmt = s => { s = Math.max(0, Math.round(s)); return (s / 60 | 0) + ':' + ('0' + s % 60).slice(-2); };

  /* 進度：每關一個字元，'-' 未完成，'0'～'3' 已完成且取得的星數 */
  const KEY = 'mf-maze-progress-v1';
  function parse(s) { s = String(s || ''); const a = []; for (let i = 0; i < LEVELS.length; i++) { const c = s[i]; a.push(c >= '0' && c <= '3' ? +c : -1); } return a; }
  function encode(a) { return a.map(v => v < 0 ? '-' : String(v)).join(''); }
  function load() { try { return parse(localStorage.getItem(KEY)); } catch (e) { return parse(''); } }
  function save(a) { try { localStorage.setItem(KEY, encode(a)); } catch (e) { /* ignore */ } }

  root.MazeLevels = { LEVELS, MAPS, SIZES, thresholds, starsFor, fmt, parse, encode, load, save, KEY, TOTAL: LEVELS.length * 3 };
})(typeof self !== 'undefined' ? self : this);
