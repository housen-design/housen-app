// 試玩版：用假資料在手機上直接跑整套系統（後端是同一份 Code.gs，在瀏覽器裡執行）。不連正式試算表、不碰正式資料。
(function () {
  // 有些瀏覽器框架不允許 localStorage：換成只存在記憶體的版本，畫面照常運作
  try { const k = '__t'; localStorage.setItem(k, 1); localStorage.removeItem(k); } catch (e) {
    const m = {}; try { Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: k => k in m ? m[k] : null, setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, clear: () => { for (const k in m) delete m[k]; } } }); } catch (e2) { }
  }
  const DB_KEY = 'housen_demo_db_v2', USER_KEY = 'housen_demo_user';
  const PEOPLE = [['boss@demo', '林柏元', 'Boss：看全部、下指示、簽核蘋芳的日誌、改設定'], ['pf@demo', '施蘋芳', '主管：簽核凱翔的日誌、排進度'],
    ['kx@demo', '許凱翔', '設計助理：寫日誌、回報指示'], ['rita@demo', '林妙娟', '行政財務：看金額、統計、報修'], ['candy@demo', '施明媛', '行政助理']];
  const mem = {};
  const LS = { get: k => { try { const v = localStorage.getItem(k); return v === null ? (k in mem ? mem[k] : null) : v; } catch (e) { return k in mem ? mem[k] : null; } },
    set: (k, v) => { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) { } }, del: k => { delete mem[k]; try { localStorage.removeItem(k); } catch (e) { } } };
  let db;
  try { db = JSON.parse(LS.get(DB_KEY) || 'null'); } catch (e) { db = null; }
  if (!db) db = JSON.parse(JSON.stringify(window.SEED));
  let E = makeEngine(window.CODE_SRC, db.T, db.files, window.LOGO_B64 ? atob(window.LOGO_B64) : '');
  function note(msg) {
    let n = document.getElementById('demoNote');
    if (!n) { n = document.createElement('div'); n.id = 'demoNote'; document.body.appendChild(n); }
    n.textContent = msg; n.style.display = 'block'; clearTimeout(note.t); note.t = setTimeout(() => { n.style.display = 'none'; }, 3500);
  }
  window.alert = m => note(String(m));
  window.confirm = () => true;   // 試玩版：需要再確認的動作直接當作「確定」
  let saveWarned = false;
  const save = () => { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { mem[DB_KEY] = null; if (!saveWarned) { saveWarned = true; note('手機空間不足，試玩資料只會保留到關掉頁面為止。'); } } };
  const READS = ['home', 'case', 'thumbs', 'pdfView', 'stats', 'admin'];
  const user = () => LS.get(USER_KEY);
  const PDF_B64 = btoa('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length 60>>stream\nBT /F1 14 Tf 20 60 Td (HOUSEN DEMO - sample PDF) Tj ET\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

  window.MOCK = async function (action, p) {
    if (!user()) await pick(true);
    await new Promise(r => setTimeout(r, action === 'home' || action === 'case' ? 120 : 250));
    let r;
    try { r = E.run(user(), action, JSON.parse(JSON.stringify(p || {}))); } catch (e) { throw String(e && e.message || e); }
    if (r && r.data && r.name && /\.pdf$/i.test(r.name)) r = Object.assign({}, r, { data: PDF_B64 });
    if (READS.indexOf(action) < 0) save();
    return r ? JSON.parse(JSON.stringify(r)) : r;
  };

  // ── 選擇扮演的人 ──
  let pickWait = [];
  function pick(fromLoad) {
    return new Promise(res => {
      if (fromLoad) pickWait.push(res); else res();
      let o = document.getElementById('demoPick');
      if (!o) { o = document.createElement('div'); o.id = 'demoPick'; document.body.appendChild(o); }
      o.innerHTML = `<div class="dp-box"><img src="icons/logo.png" alt="" class="dp-logo"><h2>浩森設計工作管理系統</h2><div class="dp-tag">試玩版・全部是假資料</div>
        <p>選一位同事的身分進去操作。怎麼按都不會影響正式資料。</p>
        ${PEOPLE.map(x => `<button class="dp-p" data-e="${x[0]}"><b>${x[1]}</b><span>${x[2]}</span></button>`).join('')}
        <button class="dp-reset" id="dpReset">把試玩資料還原成一開始的樣子</button></div>`;
      o.style.display = 'flex';
      o.querySelectorAll('[data-e]').forEach(b => b.onclick = () => {
        const was = user();
        LS.set(USER_KEY, b.dataset.e);
        LS.set('housen_tip', '1');
        o.style.display = 'none';
        const w = pickWait; pickWait = []; w.forEach(f => f());
        bar();
        if (was || !w.length) restart();
      });
      document.getElementById('dpReset').onclick = function () { if (this.dataset.sure) { LS.del(DB_KEY); db = JSON.parse(JSON.stringify(window.SEED)); E = makeEngine(window.CODE_SRC, db.T, db.files, window.LOGO_B64 ? atob(window.LOGO_B64) : ''); this.textContent = '已還原，請選一位同事進入'; delete this.dataset.sure; } else { this.dataset.sure = 1; this.textContent = '再按一次確定還原（你做的操作會全部清掉）'; } };
    });
  }
  function bar() {
    let b = document.getElementById('demoBar');
    if (!b) { b = document.createElement('div'); b.id = 'demoBar'; document.body.insertBefore(b, document.body.firstChild); }
    const me = PEOPLE.find(x => x[0] === user());
    let cur = 'graphite'; try { cur = localStorage.getItem('housen_theme') || 'graphite'; } catch (e) { }
    b.innerHTML = `試玩・假資料｜<b>${me ? me[1] : '—'}</b> <a id="demoSwitch">切換身分</a>｜配色 <select id="demoTheme">${Object.keys(window.THEMES || {}).map(k => `<option value="${k}" ${k === cur ? 'selected' : ''}>${THEMES[k][0]}</option>`).join('')}</select>`;
    document.getElementById('demoSwitch').onclick = () => { pick(); };
    document.getElementById('demoTheme').onchange = e => { setTheme(e.target.value); };
  }
  function restart() { try { S.as = ''; S.real = null; S.thumbs = {}; S.cur = null; S.home = null; S.data = null; $('#top').style.display = ''; $('#main').style.padding = ''; boot(); } catch (e) { location.reload(); } }
  // 登出 → 回到選身分
  window.addEventListener('load', () => {
    window.showLogin = function () { LS.del(USER_KEY); pick(); };
    if (user()) bar(); else if (!pickWait.length) pick();
  });

  // ── 雲端檔案（PDF、照片、資料夾）在試玩版裡直接預覽 ──
  function viewer(html) {
    let v = document.getElementById('demoView');
    if (!v) { v = document.createElement('div'); v.id = 'demoView'; document.body.appendChild(v); }
    v.innerHTML = `<div class="dv-top"><span>試玩版預覽（正式版會是 Google 雲端裡的 PDF）</span><button id="dvx">關閉</button></div><div class="dv-body"></div>`;
    const body = v.querySelector('.dv-body');
    if (typeof html === 'string') body.innerHTML = html; else body.appendChild(html);
    v.style.display = 'flex';
    document.getElementById('dvx').onclick = () => { v.style.display = 'none'; v.innerHTML = ''; };
  }
  function openDemo(url) {
    const fm = url.match(/^https:\/\/demo\.file\/(.+)$/), dm = url.match(/^https:\/\/demo\.folder\/(.+)$/);
    if (fm) {
      const f = db.files[fm[1]];
      if (!f) return viewer('<div class="dv-msg">找不到這個檔案</div>');
      if (f.html) { const fr = document.createElement('iframe'); fr.className = 'dv-frame'; fr.srcdoc = f.html; return viewer(fr); }
      if (/^image\//.test(f.type)) return viewer(`<img class="dv-img" src="data:${f.type};base64,${btoa(f.content)}">`);
      return viewer('<div class="dv-msg">這是示範用的 PDF，正式版會在 Google 雲端開啟。</div>');
    }
    if (dm) {
      const path = decodeURIComponent(dm[1]);
      const list = Object.keys(db.files).filter(k => (db.files[k].dir || '').indexOf(path) === 0 && !db.files[k].trashed);
      return viewer(`<div class="dv-msg"><b>${path.replace(/^ROOT\//, '')}</b><br>${list.length ? list.map(k => `<a href="https://demo.file/${k}">${db.files[k].dir.slice(path.length + 1) ? db.files[k].dir.slice(path.length + 1) + '／' : ''}${db.files[k].name}</a>`).join('<br>') : '資料夾是空的'}</div>`);
    }
    return false;
  }
  const _open = window.open;
  window.open = function (url) { if (/^https:\/\/demo\.(file|folder)\//.test(String(url))) { openDemo(String(url)); return null; } return _open.apply(window, arguments); };
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && /^https:\/\/demo\.(file|folder)\//.test(a.href)) { e.preventDefault(); e.stopPropagation(); openDemo(a.href); }
  }, true);

  const css = document.createElement('style');
  css.textContent = `#demoBar{background:#1f2328;color:#eef0f3;font-size:12px;padding:calc(5px + env(safe-area-inset-top)) 12px 5px;text-align:center}
#demoBar select{font:inherit;font-size:12px;background:#3a342f;color:#f3ede4;border:1px solid #5a524b;border-radius:8px;padding:1px 4px;margin-left:4px}
#demoBar a{color:#e7c9a0;text-decoration:underline;margin-left:6px;cursor:pointer}
#demoPick{position:fixed;inset:0;z-index:200;background:#f6f2ec;display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:calc(24px + env(safe-area-inset-top)) 16px 30px}
.dp-box{width:100%;max-width:420px;text-align:center}.dp-logo{width:120px;margin:10px auto 6px;display:block}.dp-box h2{font-size:19px;margin:6px 0}
.dp-tag{display:inline-block;background:#8a6a4b;color:#fff;border-radius:12px;padding:3px 12px;font-size:13px}.dp-box p{color:#6d655c;font-size:14px;margin:12px 0 16px}
.dp-p{display:block;width:100%;text-align:left;background:#fff;border:1px solid #e3ddd2;border-radius:14px;padding:13px 16px;margin-bottom:10px;font:inherit;cursor:pointer}
.dp-p b{display:block;font-size:16px;margin-bottom:2px;color:#2b2622}.dp-p span{font-size:13px;color:#7a7168}
.dp-reset{margin-top:14px;background:none;border:none;color:#9a8f80;text-decoration:underline;font:inherit;font-size:13px;cursor:pointer}
#demoView{position:fixed;inset:0;z-index:300;background:#fff;display:none;flex-direction:column}
.dv-top{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;background:#2b2622;color:#f3ede4;font-size:13px}
.dv-top button{background:#f3ede4;color:#2b2622;border:none;border-radius:16px;padding:7px 16px;font:inherit;font-weight:600}
.dv-body{flex:1;overflow:auto;-webkit-overflow-scrolling:touch}.dv-frame{width:100%;height:100%;border:0;display:block}.dv-img{max-width:100%;display:block;margin:0 auto}
#demoNote{position:fixed;left:16px;right:16px;top:calc(40px + env(safe-area-inset-top));z-index:400;background:#2b2622;color:#fff;border-radius:12px;padding:12px 14px;font-size:14px;display:none;white-space:pre-line}
.dv-msg{padding:24px;font-size:15px;line-height:1.9}.dv-msg a{color:#8a6a4b}`;
  document.head.appendChild(css);
})();
