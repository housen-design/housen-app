// 上線前阻擋項目：正式後端不開切換身分、分享紀錄檢查、兩人同時產 PDF、產檔期間內容變動、照片中途失敗、重送不重複
// 用法：node tests/blockers.js backend/Code.gs
const path = require('path');
const backend = process.argv[2] || path.join(__dirname, '..', 'backend', 'Code.gs');
const fs = require('fs');
const H = require('./harness')(backend);
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + String(i).slice(0, 100) : '')); };
const BOSS = 'boss@test.local', PF = 'pf@test.local', KX = 'kx@test.local', CANDY = 'candy@test.local';
const run = (who, a, d) => H.run(who, a, d || {});
const err = (who, a, d) => { try { run(who, a, d); return null; } catch (e) { return e.message || String(e); } };
const rows = n => { const t = H.T[n]; return t.slice(1).map(r => Object.fromEntries(t[0].map((k, i) => [k, r[i] == null ? '' : String(r[i])]))); };
const log = id => rows('工程日誌').find(l => l['日誌ID'] === id);
const live = () => Object.keys(H.files).filter(k => k.startsWith('GEN') && !H.files[k].trashed);
const pdfsOf = id => live().filter(k => /\.pdf$/.test(H.files[k].name || '') && H.files[k].name.indexOf(id.slice(0, 4)) >= 0);
const PH = Buffer.from('fakejpeg').toString('base64');

// ---------- 1. 正式後端不提供切換身分 ----------
const src = fs.readFileSync(backend, 'utf8');
ok('正式後端 TEST_MODE = false', /const TEST_MODE = false;/.test(src));
ok('工作總表回傳 testMode=false（畫面不會出現切換身分）', run(BOSS, 'home').testMode === false);
ok('Boss 帶 as 要求看別人畫面 → 拒絕', /沒有預覽權限/.test(err(BOSS, 'home', { as: 'P04' }) || ''));

// ---------- 3. 分享紀錄的後端檢查 ----------
const L2 = 'L2';   // C2：已簽核、還沒有 PDF；負責設計師 P04
ok('分享紀錄：kind 不是 share／download → 拒絕', /不明的紀錄類型/.test(err(BOSS, 'shareLog', { id: L2, kind: 'x' }) || ''));
ok('分享紀錄：沒有 kind → 拒絕', /不明的紀錄類型/.test(err(BOSS, 'shareLog', { id: L2 }) || ''));
ok('分享紀錄：還沒有 PDF → 拒絕', /不是最新|找不到/.test(err(BOSS, 'shareLog', { id: L2, kind: 'download' }) || ''));
let r = run(BOSS, 'buildLogPdf', { id: L2 });
ok('產生 PDF 後狀態為最新', r.ready && pdfsOf(L2).length === 1);
const d0 = +log(L2)['下載次數'] || 0;
run(KX, 'shareLog', { id: L2, kind: 'download' });
ok('負責設計師記錄下載 → 成功、次數 +1', +log(L2)['下載次數'] === d0 + 1);
ok('沒有分享權限的人（行政）→ 拒絕', /只有案件負責設計師或主管/.test(err(CANDY, 'shareLog', { id: L2, kind: 'share' }) || ''));
run(BOSS, 'saveIns', { caseId: 'C2', logId: L2, text: '請補拍配管照片', to: 'P04' });
ok('之後有新指示（PDF 待更新）→ 分享紀錄拒絕', /不是最新/.test(err(KX, 'shareLog', { id: L2, kind: 'share' }) || ''));
run(BOSS, 'buildLogPdf', { id: L2 });
ok('更新 PDF 後可以記錄分享', !err(KX, 'shareLog', { id: L2, kind: 'share' }));
const draft = run(KX, 'saveLog', { caseId: 'C2', date: '2026/11/22', trades: ['水電'], text: '草稿' });
ok('還沒簽核的日誌 → 分享紀錄拒絕', /尚未簽核/.test(err(BOSS, 'shareLog', { id: draft, kind: 'share' }) || ''));
H.files[log(L2)['PDF檔ID']].trashed = true;
ok('PDF 檔已被移除 → 分享紀錄拒絕', /找不到這篇的 PDF/.test(err(BOSS, 'shareLog', { id: L2, kind: 'share' }) || ''));
r = run(BOSS, 'buildLogPdf', { id: L2 });
ok('檔案被移除後可重新產生', r.ready && pdfsOf(L2).length === 1);

// ---------- 4. 兩人同時產同一份 PDF ----------
// 兩個請求都在「還不是最新」時進來（例如快取被清掉）：A 建檔的同時，B 從頭到尾產完一份
run(BOSS, 'saveIns', { caseId: 'C2', logId: L2, text: '第二個指示', to: 'P04' });
let n0 = Object.keys(H.files).length;
globalThis.ON_CREATE = () => { delete H.cache['pdfb_' + L2]; run(PF, 'buildLogPdf', { id: L2 }); };
run(BOSS, 'buildLogPdf', { id: L2 });
ok('同時產檔：最後只留一份 PDF，沒有孤兒檔', pdfsOf(L2).length === 1, pdfsOf(L2).join(','));
ok('同時產檔：紀錄指到留下的那一份，而且是最新', log(L2)['PDF檔ID'] === pdfsOf(L2)[0] && run(BOSS, 'case', { id: 'C2' }).logs.find(l => l.id === L2).pdfState === 'ready');
ok('同時產檔：兩份都建過（真的重現了同時產檔）', Object.keys(H.files).length - n0 === 2);
// 有人正在產：第二個請求等前一個做完，直接用那份，不另外產
run(BOSS, 'saveIns', { caseId: 'C2', logId: L2, text: '第三個指示', to: 'P04' });
H.cache['pdfb_' + L2] = 'someone';
n0 = Object.keys(H.files).length;
let waited = 0;
globalThis.ON_SLEEP = () => { waited++; if (waited === 1) { delete H.cache['pdfb_' + L2]; run(PF, 'buildLogPdf', { id: L2 }); H.cache['pdfb_' + L2] = 'someone'; delete H.cache['pdfb_' + L2]; } };
r = run(BOSS, 'buildLogPdf', { id: L2 });
globalThis.ON_SLEEP = null;
ok('有人正在產：第二個請求會等，然後直接用那份', waited >= 1 && r.already && Object.keys(H.files).length - n0 === 1 && pdfsOf(L2).length === 1);
// 已是最新：重複按不會再產
n0 = Object.keys(H.files).length;
r = run(BOSS, 'buildLogPdf', { id: L2 });
ok('已是最新再按一次：不產新檔', r.already && Object.keys(H.files).length === n0);
// 產檔期間有人新增指示：完成後必須維持「待更新」
run(BOSS, 'saveIns', { caseId: 'C2', logId: L2, text: '第四個指示', to: 'P04' });
globalThis.ON_CREATE = () => run(BOSS, 'saveIns', { caseId: 'C2', logId: L2, text: '產檔期間的新指示', to: 'P04' });
r = run(BOSS, 'buildLogPdf', { id: L2 });
let st = run(BOSS, 'case', { id: 'C2' }).logs.find(l => l.id === L2);
ok('產檔期間新增指示 → 完成後顯示「待更新」，不是最新', !r.ready && st.pdfState === 'pending' && st.hasPdf, st.pdfState);
ok('產檔期間新增指示 → 分享紀錄拒絕', /不是最新/.test(err(KX, 'shareLog', { id: L2, kind: 'share' }) || ''));
// 產檔期間有人回報
const insId = rows('主管指示').filter(i => i['日誌ID'] === L2).pop()['指示ID'];
globalThis.ON_CREATE = () => run(KX, 'actIns', { id: insId, act: 'reply', text: '產檔期間回報' });
r = run(BOSS, 'buildLogPdf', { id: L2 });
st = run(BOSS, 'case', { id: 'C2' }).logs.find(l => l.id === L2);
ok('產檔期間回報 → 完成後仍是「待更新」', !r.ready && st.pdfState === 'pending');
ok('產檔期間內容變動：舊檔已收回，只留一份', pdfsOf(L2).length === 1);
r = run(BOSS, 'buildLogPdf', { id: L2 });
ok('再產一次 → 最新', r.ready && run(BOSS, 'case', { id: 'C2' }).logs.find(l => l.id === L2).pdfState === 'ready');
// 下載時（pdfLog）期間有變動：回傳 fresh=false，畫面會請使用者再按一次
run(BOSS, 'saveIns', { caseId: 'C2', logId: L2, text: '第五個指示', to: 'P04' });
globalThis.ON_CREATE = () => run(BOSS, 'saveIns', { caseId: 'C2', logId: L2, text: '下載期間的新指示', to: 'P04' });
r = run(KX, 'pdfLog', { id: L2 });
ok('下載期間內容變動 → 回傳 fresh=false', r.fresh === false);
r = run(KX, 'pdfLog', { id: L2 });
ok('再按一次 → 拿到最新版', r.fresh === true && pdfsOf(L2).length === 1);
globalThis.ON_CREATE = null;

// ---------- 5. 照片中途失敗 ----------
const logsN = () => rows('工程日誌').length, phN = () => rows('日誌照片').length;
let a0 = logsN(), p0 = phN(), f0 = live().length;
globalThis.FAIL_AFTER = 1;   // 第 1 張成功、第 2 張失敗
let e = err(KX, 'saveLog', { caseId: 'C1', date: '2026/11/22', trades: ['木工'], text: '新日誌含三張照片', photos: [{ data: PH }, { data: PH }, { data: PH }], submit: true, reqId: 'r1s' });
globalThis.FAIL_AFTER = null;
ok('新增日誌：第 2 張照片失敗 → 顯示失敗', /照片上傳失敗/.test(e || ''), e);
ok('新增日誌失敗：沒有新增日誌', logsN() === a0);
ok('新增日誌失敗：沒有新增照片紀錄', phN() === p0);
ok('新增日誌失敗：已上傳的那張收回，雲端沒有多出檔案', live().length === f0);
const nid = run(KX, 'saveLog', { caseId: 'C1', date: '2026/11/22', trades: ['木工'], text: '新日誌含三張照片', photos: [{ data: PH }, { data: PH }, { data: PH }], submit: true, reqId: 'r1s' });
ok('重按一次 → 只有一篇日誌、三張照片', logsN() === a0 + 1 && rows('日誌照片').filter(p => p['日誌ID'] === nid).length === 3);
const again = run(KX, 'saveLog', { caseId: 'C1', date: '2026/11/22', trades: ['木工'], text: '新日誌含三張照片', photos: [{ data: PH }, { data: PH }, { data: PH }], submit: true, reqId: 'r1s' });
ok('成功後同一次送出又被重送（網路斷線）→ 不會多一篇', again === nid && logsN() === a0 + 1 && rows('日誌照片').filter(p => p['日誌ID'] === nid).length === 3);
// 修改日誌：同時刪一張、改一張說明、改內容、加兩張新照片，新照片失敗
const ph = rows('日誌照片').filter(p => p['日誌ID'] === nid);
const before = JSON.stringify([log(nid), rows('日誌照片').filter(p => p['日誌ID'] === nid)]);
f0 = live().length;
globalThis.FAIL_AFTER = 1;
e = err(KX, 'updateLog', { id: nid, caseId: 'C1', date: '2026/11/22', trades: ['木工'], text: '內容改了', delPhotos: [ph[0]['照片ID']], notes: { [ph[1]['照片ID']]: '新說明' }, photos: [{ data: PH }, { data: PH }], reqId: 'u1d' });
globalThis.FAIL_AFTER = null;
ok('修改日誌：新照片中途失敗 → 顯示失敗', /照片上傳失敗/.test(e || ''), e);
ok('修改失敗：內容、刪除、說明都沒有生效', JSON.stringify([log(nid), rows('日誌照片').filter(p => p['日誌ID'] === nid)]) === before);
ok('修改失敗：已上傳的新照片收回', live().length === f0);
run(KX, 'updateLog', { id: nid, caseId: 'C1', date: '2026/11/22', trades: ['木工'], text: '內容改了', delPhotos: [ph[0]['照片ID']], notes: { [ph[1]['照片ID']]: '新說明' }, photos: [{ data: PH }, { data: PH }], reqId: 'u1d' });
const after = rows('日誌照片').filter(p => p['日誌ID'] === nid);
ok('重按一次 → 刪除、改說明、內容、兩張新照片各生效一次', log(nid)['今日狀況'] === '內容改了' && after.length === 5 && after.filter(p => p['刪除時間']).length === 1 && after.find(p => p['照片ID'] === ph[1]['照片ID'])['說明'] === '新說明');
const cnt = log(nid)['修改次數'];
run(KX, 'updateLog', { id: nid, caseId: 'C1', date: '2026/11/22', trades: ['木工'], text: '內容改了', delPhotos: [ph[0]['照片ID']], notes: { [ph[1]['照片ID']]: '新說明' }, photos: [{ data: PH }, { data: PH }], reqId: 'u1d' });
ok('同一次修改被重送 → 不重複加照片、修改次數不變', rows('日誌照片').filter(p => p['日誌ID'] === nid).length === 5 && log(nid)['修改次數'] === cnt);
// 只刪照片＋改說明（沒有新照片）不受影響
const ph2 = rows('日誌照片').filter(p => p['日誌ID'] === nid && !p['刪除時間']);
run(KX, 'updateLog', { id: nid, caseId: 'C1', date: '2026/11/22', trades: ['木工'], text: '內容改了', delPhotos: [ph2[0]['照片ID']], notes: {}, photos: [], reqId: 'u2d' });
ok('沒有新照片的修改照常生效', rows('日誌照片').filter(p => p['日誌ID'] === nid && p['刪除時間']).length === 2);

// ---------- 偽造案件編號 ----------
const n1 = logsN();
ok('偽造案件編號寫日誌 → 拒絕且不新增', /找不到案件/.test(err(KX, 'saveLog', { caseId: 'C999', date: '2026/11/22', trades: ['木工'], text: 'x', photos: [{ data: PH }] }) || '') && logsN() === n1);

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' PASS');
process.exit(R.every(Boolean) ? 0 : 1);
