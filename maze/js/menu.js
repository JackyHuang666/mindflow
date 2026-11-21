'use strict';
/* 36 關選單：顯示每關的星星、解鎖狀態；從學院開啟時，進度以學院的資料為準 */
(function () {
  const ML = window.MazeLevels, $ = id => document.getElementById(id);
  const QS = new URLSearchParams(location.search);
  const EMBED = QS.get('embed') === '1' && window.parent !== window;
  // 學院開啟時會帶入這位玩家的進度（p=36 個字元）與測試模式（all=1）
  if (QS.get('p') != null) ML.save(ML.parse(QS.get('p')));
  if (QS.get('all') != null) { try { sessionStorage.setItem('mf-maze-all', QS.get('all') === '1' ? '1' : '0'); } catch (e) { /* ignore */ } }
  let ALL = false; try { ALL = sessionStorage.getItem('mf-maze-all') === '1'; } catch (e) { /* ignore */ }
  if (EMBED) {
    $('mClose').hidden = false;
    $('mClose').onclick = () => { try { window.parent.postMessage({ type: 'mfc-lab-close' }, location.origin === 'null' ? '*' : location.origin); } catch (e) { /* ignore */ } };
    addEventListener('keydown', e => { if (e.key === 'Escape') $('mClose').click(); });
  }
  // 學院在玩家過關後會回傳最新進度
  addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.type === 'mf-maze-sync') { ML.save(ML.parse(e.data.p)); render(); } });

  const COL = ['#5f9a4e', '#4fa3c0', '#d99a5c', '#9bb3cc', '#6a5fc0', '#d4732c'];
  const ICO = ['🎋', '🪸', '🏜️', '🌲', '🌌', '🍁'];
  const TIER = ['13×13・有小地圖', '13×13・沒有小地圖', '19×19・有小地圖', '19×19・沒有小地圖', '25×25・有小地圖', '25×25・沒有小地圖'];
  function render() {
    const prog = ML.load();
    const total = prog.reduce((a, v) => a + Math.max(0, v), 0);
    $('mStars').textContent = total; $('mTotal').textContent = ML.TOTAL;
    let h = '';
    for (let t = 0; t < 6; t++) {
      const lv = ML.LEVELS.filter(l => l.tier === t), got = lv.reduce((a, l) => a + Math.max(0, prog[l.id - 1]), 0);
      h += '<section class="mtier"><h3><span>' + (t < 2 ? '入門' : t < 4 ? '進階' : '挑戰') + '</span>' + TIER[t] + '<em>⭐ ' + got + ' / 18</em></h3><div class="mgrid">';
      lv.forEach(l => {
        const v = prog[l.id - 1], open = ALL || l.id === 1 || prog[l.id - 2] >= 0;
        const stars = [1, 2, 3].map(k => '<i class="' + (v >= k ? 'on' : '') + '">★</i>').join('');
        h += '<a class="mcard' + (open ? '' : ' lock') + (v >= 0 ? ' done' : '') + '" style="--c:' + COL[l.th] + '"' + (open ? ' href="play.html?lvl=' + l.id + (EMBED ? '&embed=1' : '') + '"' : '') + '>' +
          '<span class="mno">' + l.id + '</span><span class="mico">' + (open ? ICO[l.th] : '🔒') + '</span><b>' + l.mapName + '</b>' +
          '<span class="mst">' + stars + '</span>' + (l.map ? '' : '<span class="mtag">無小地圖</span>') + '</a>';
      });
      h += '</div></section>';
    }
    $('mList').innerHTML = h;
  }
  render();
})();
