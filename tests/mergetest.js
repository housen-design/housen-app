// 兩人同時編輯：沒改的欄位要保留同事的新內容；同一欄兩人改得不同才擋（隔離假資料）
const H = require('./harness.js'), BE = process.argv[2], R = [];
const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); };
const tr = (h, w, a, p) => { try { return { ok: true, v: h.run(w, a, p) }; } catch (e) { return { ok: false, e: e.message }; } };
const tab = (h, n) => { const t = h.T[n]; return t.slice(1).map(r => Object.fromEntries(t[0].map((k, i) => [k, r[i]]))); };
const rec = (h, w, list, id) => h.run(w, 'case', { id: 'C1' })[list].find(x => x.id === id);
const h = H(BE);
// 會議：我開舊表單只改名稱；同事剛補摘要
const mid = h.run('pf@test.local', 'saveMeeting', { caseId: 'C1', name: '水電確認', date: '2026/11/18', attendees: '王先生', summary: '' });
const mine = rec(h, 'boss@test.local', 'meetings', mid);   // Boss 打開表單
h.run('pf@test.local', 'saveMeeting', { caseId: 'C1', id: mid, name: '水電確認', date: '2026/11/18', attendees: '王先生', summary: '插座改到床頭左側', orig: rec(h, 'pf@test.local', 'meetings', mid).fv });
let r = tr(h, 'boss@test.local', 'saveMeeting', { caseId: 'C1', id: mid, name: '水電與燈具確認', date: mine.date, attendees: mine.attendees, summary: mine.summary || '', orig: mine.fv });
let m = tab(h, '會議').find(x => x['會議ID'] === mid);
ok('會議：我只改名稱，同事剛補的摘要保留', r.ok && m['會議名稱'] === '水電與燈具確認' && m['AI摘要'] === '插座改到床頭左側', r.e || JSON.stringify([m['會議名稱'], m['AI摘要']]));
const mine2 = rec(h, 'boss@test.local', 'meetings', mid);
h.run('pf@test.local', 'saveMeeting', { caseId: 'C1', id: mid, name: m['會議名稱'], date: '2026/11/18', attendees: '王先生', summary: '蘋芳版摘要', orig: rec(h, 'pf@test.local', 'meetings', mid).fv });
r = tr(h, 'boss@test.local', 'saveMeeting', { caseId: 'C1', id: mid, name: m['會議名稱'], date: '2026/11/18', attendees: '王先生', summary: 'Boss 版摘要', orig: mine2.fv });
ok('會議：兩人改同一欄且不同 → 擋下並指出欄位', !r.ok && /AI摘要/.test(r.e) && tab(h, '會議').find(x => x['會議ID'] === mid)['AI摘要'] === '蘋芳版摘要', r.e);
// 日誌：我改問題，同事改今日狀況與工種
const lid = 'L1', lmine = rec(h, 'boss@test.local', 'logs', lid);
h.run('kx@test.local', 'updateLog', { id: lid, date: lmine.date, trades: ['木工', '水電'], text: '凱翔補：天花板封板完成', issue: lmine.issue || '', orig: rec(h, 'kx@test.local', 'logs', lid).fv });
r = tr(h, 'boss@test.local', 'updateLog', { id: lid, date: lmine.date, trades: lmine.trades, text: lmine.text, issue: 'Boss：維修孔位置要再確認', orig: lmine.fv });
let l = tab(h, '工程日誌').find(x => x['日誌ID'] === lid);
ok('日誌：我只改問題，同事改的內容和工種保留', r.ok && l['今日狀況'] === '凱翔補：天花板封板完成' && /水電/.test(l['工種']) && l['發現問題'] === 'Boss：維修孔位置要再確認', r.e || JSON.stringify([l['今日狀況'], l['工種'], l['發現問題']]));
// 客戶指示：我改期限，同事改金額
const ci = h.run('pf@test.local', 'saveClientIns', { caseId: 'C1', text: '衣櫃到頂', date: '2026/11/18', impact: true, amount: '18000', owner: 'P04' });
const cmine = rec(h, 'boss@test.local', 'cins', ci);
h.run('pf@test.local', 'saveClientIns', { caseId: 'C1', id: ci, text: '衣櫃到頂', date: '2026/11/18', impact: true, amount: '21000', owner: 'P04', due: '', source: cmine.source, orig: rec(h, 'pf@test.local', 'cins', ci).fv });
r = tr(h, 'boss@test.local', 'saveClientIns', { caseId: 'C1', id: ci, text: cmine.text, date: cmine.date, impact: cmine.impact, amount: cmine.amount, days: cmine.days, owner: cmine.owner, due: '2026-11-30', source: cmine.source, orig: cmine.fv });
let c = tab(h, '客戶指示').find(x => x['指示ID'] === ci);
ok('客戶指示：我只改期限，同事改的金額保留', r.ok && c['追加減金額'] === '21000' && c['執行期限'] === '2026/11/30', r.e || JSON.stringify([c['追加減金額'], c['執行期限']]));
// 工序：我改名稱，同事改日期
h.run('pf@test.local', 'savePlanItem', { caseId: 'C1', name: '木作', trade: '木工', start: '2026/11/20', end: '2026/11/30' });
const pid = tab(h, '進度計畫').slice(-1)[0]['工序ID'], pmine = rec(h, 'boss@test.local', 'plan', pid);
h.run('pf@test.local', 'savePlanItem', { caseId: 'C1', id: pid, name: '木作', trade: '木工', start: '2026/11/22', end: '2026/12/02', orig: rec(h, 'pf@test.local', 'plan', pid).fv });
r = tr(h, 'boss@test.local', 'savePlanItem', { caseId: 'C1', id: pid, name: '木作（天花板＋櫃體）', trade: pmine.trade, start: pmine.start, end: pmine.end, orig: pmine.fv });
let pi = tab(h, '進度計畫').find(x => x['工序ID'] === pid);
ok('工序：我只改名稱，同事改的日期保留', r.ok && pi['工序名稱'] === '木作（天花板＋櫃體）' && pi['目前計畫開始'] === '2026/11/22', r.e || JSON.stringify([pi['工序名稱'], pi['目前計畫開始']]));
// 里程碑：我改名稱，同事改負責人
h.run('pf@test.local', 'saveMilestone', { caseId: 'C1', name: '平面定稿', owner: 'P03', due: '2026/12/01' });
const msid = tab(h, '里程碑').slice(-1)[0]['任務ID'], mmine = rec(h, 'boss@test.local', 'ms', msid);
h.run('pf@test.local', 'saveMilestone', { caseId: 'C1', id: msid, name: '平面定稿', owner: 'P04', due: mmine.due, orig: rec(h, 'pf@test.local', 'ms', msid).fv });
r = tr(h, 'boss@test.local', 'saveMilestone', { caseId: 'C1', id: msid, name: '平面配置定稿', owner: mmine.owner, due: mmine.due, orig: mmine.fv });
let ms = tab(h, '里程碑').find(x => x['任務ID'] === msid);
ok('里程碑：我只改名稱，同事改的負責人保留', r.ok && ms['名稱'] === '平面配置定稿' && ms['負責人'] === 'P04', r.e || JSON.stringify([ms['名稱'], ms['負責人']]));
// 保固報修：我改負責人，同事寫處理結果
h.run('pf@test.local', 'saveRepair', { caseId: 'C1', text: '門片下垂', owner: 'P03' });
const rid = tab(h, '保固報修').slice(-1)[0]['報修ID'], rmine = rec(h, 'boss@test.local', 'repairs', rid);
h.run('pf@test.local', 'saveRepair', { caseId: 'C1', id: rid, status: '處理中', result: '已約週五調整', owner: 'P03', orig: rec(h, 'pf@test.local', 'repairs', rid).fv });
r = tr(h, 'boss@test.local', 'saveRepair', { caseId: 'C1', id: rid, status: rmine.status, result: rmine.result || '', owner: 'P04', orig: rmine.fv });
let rp = tab(h, '保固報修').find(x => x['報修ID'] === rid);
ok('保固報修：我只改負責人，同事寫的處理結果與狀態保留', r.ok && rp['處理結果'] === '已約週五調整' && rp['狀態'] === '處理中' && rp['負責人'] === 'P04', r.e || JSON.stringify([rp['處理結果'], rp['狀態'], rp['負責人']]));
// 兩人改成一樣的內容 → 不算衝突
const mine3 = rec(h, 'boss@test.local', 'meetings', mid);
h.run('pf@test.local', 'saveMeeting', { caseId: 'C1', id: mid, name: '最終名稱', date: '2026/11/18', attendees: '王先生', summary: '蘋芳版摘要', orig: rec(h, 'pf@test.local', 'meetings', mid).fv });
r = tr(h, 'boss@test.local', 'saveMeeting', { caseId: 'C1', id: mid, name: '最終名稱', date: '2026/11/18', attendees: '王先生', summary: mine3.summary, orig: mine3.fv });
ok('兩人改成一樣的內容不算衝突', r.ok, r.e);
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' PASS');
