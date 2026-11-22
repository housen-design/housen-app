// 逐項重現 ChatGPT 檢查出的問題（隔離假資料）。PASS = 已被擋下／行為正確
const H = require('./harness.js');
const BE = process.argv[2];
const R = [];
const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); };
const tryRun = (h, who, a, p) => { try { return { ok: true, v: h.run(who, a, p) }; } catch (e) { return { ok: false, e: e.message }; } };
const tab = (h, n) => { const t = h.T[n]; return t.slice(1).map(r => Object.fromEntries(t[0].map((k, i) => [k, r[i]]))); };
// 凱翔 P04 是 C2 的負責設計師，不是 C1 的
{ const h = H(BE);
  const mA = h.run('pf@test.local', 'saveMeeting', { caseId: 'C1', name: 'C1 會議', date: '2026/11/18' });
  const r = tryRun(h, 'kx@test.local', 'saveMeeting', { caseId: 'C2', id: mA, name: '被改掉', date: '2026/11/18' });
  ok('1a 不能用 B 案權限改 A 案會議', !r.ok && tab(h, '會議').find(x => x['會議ID'] === mA)['會議名稱'] === 'C1 會議', r.e);
  const ci = h.run('pf@test.local', 'saveClientIns', { caseId: 'C1', text: 'C1 指示', date: '2026/11/18' });
  const r2 = tryRun(h, 'kx@test.local', 'saveClientIns', { caseId: 'C2', id: ci, text: '被改掉' });
  ok('1b 不能跨案改客戶指示', !r2.ok && tab(h, '客戶指示').find(x => x['指示ID'] === ci)['內容'] === 'C1 指示', r2.e);
  const r2b = tryRun(h, 'kx@test.local', 'saveClientIns', { caseId: 'C2', meetingId: mA, text: '掛到別案會議' });
  ok('1c 客戶指示不能掛到別案的會議', !r2b.ok, r2b.e);
  h.run('pf@test.local', 'saveMilestone', { caseId: 'C1', name: 'C1 里程碑', due: '2026/12/01' });
  const ms = tab(h, '里程碑').slice(-1)[0]['任務ID'];
  const r3 = tryRun(h, 'kx@test.local', 'saveMilestone', { caseId: 'C2', id: ms, name: '被改掉', due: '2026/12/01' });
  ok('1d 不能跨案改里程碑', !r3.ok && tab(h, '里程碑').find(x => x['任務ID'] === ms)['名稱'] === 'C1 里程碑', r3.e);
  h.run('pf@test.local', 'saveRepair', { caseId: 'C1', text: 'C1 報修', owner: 'P03' });
  const rp = tab(h, '保固報修').slice(-1)[0]['報修ID'];
  const r4 = tryRun(h, 'kx@test.local', 'saveRepair', { caseId: 'C2', id: rp, status: '處理中' });
  ok('1e 不能跨案改保固報修', !r4.ok && tab(h, '保固報修').find(x => x['報修ID'] === rp)['狀態'] === '待處理', r4.e);
  const r5 = tryRun(h, 'boss@test.local', 'saveIns', { caseId: 'C2', logId: 'L1', text: '指示掛錯案', to: 'P04' });
  ok('1f 主管指示的日誌必須同案', !r5.ok, r5.e);
}
// 2 結案唯讀繞過：C1 結案，傳 C2 的 caseId + C1 日誌 ID
{ const h = H(BE);
  h.run('boss@test.local', 'setStage', { id: 'C1', stage: '結案' });
  const r = tryRun(h, 'kx@test.local', 'updateLog', { caseId: 'C2', id: 'L1', date: '2026/11/18', trades: ['木工'], text: '結案後被改' });
  ok('2a 結案唯讀不能用別案 caseId 繞過', !r.ok && tab(h, '工程日誌').find(x => x['日誌ID'] === 'L1')['今日狀況'] !== '結案後被改', r.e);
  const ph = tab(h, '日誌照片').find(x => x['案件ID'] === 'C1');
  if (ph) { const r2 = tryRun(h, 'kx@test.local', 'deletePhoto', { caseId: 'C2', id: ph['照片ID'] }); ok('2b 結案案件的照片不能刪', !r2.ok, r2.e); }
}
// 3 權限缺漏
{ const h = H(BE);
  const n = tab(h, '案件').length;
  const r = tryRun(h, 'kx@test.local', 'saveCase', { name: '設計助理自己開案' });
  ok('3a 設計助理不能直接新增案件（暫定：主管、行政可以）', !r.ok && tab(h, '案件').length === n, r.e);
  ok('3b 行政可以新增案件', tryRun(h, 'rita@test.local', 'saveCase', { name: '行政開案' }).ok);
  const m = h.run('pf@test.local', 'saveMeeting', { caseId: 'C1', name: 'C1 會議', date: '2026/11/18' });
  const before = tab(h, '會議').find(x => x['會議ID'] === m)['PDF時間'] || '';
  const r2 = tryRun(h, 'kx@test.local', 'clientPdf', { meetingId: m });
  ok('3c 沒權限產 PDF 時不先寫入 PDF 時間', !r2.ok && (tab(h, '會議').find(x => x['會議ID'] === m)['PDF時間'] || '') === before, r2.e);
}
// 4 新 PDF 失敗時不能先丟掉舊檔
{ const h = H(BE);
  { const t = h.T['工程日誌'], i = t[0].indexOf('修訂時間'), row = t.find(x => x[0] === 'L1'); row[i] = '2099/01/01 00:00:00'; }   // 讓舊 PDF 變成「需要重產」
  globalThis.FAIL_CREATE = true;
  const r = tryRun(h, 'pf@test.local', 'pdfLog', { id: 'L1' });
  globalThis.FAIL_CREATE = false;
  const l1 = tab(h, '工程日誌').find(x => x['日誌ID'] === 'L1');
  ok('4a 日誌 PDF 重產失敗：舊檔沒進垃圾桶、紀錄仍指向舊檔', !r.ok && !h.files.FILE_L1.trashed && l1['PDF檔ID'] === 'FILE_L1', r.e);
  h.run('pf@test.local', 'reportPdf', { caseId: 'C1', kind: 'resume' });
  const d0 = tab(h, '文件紀錄').find(x => x['文件類型'] === '工程履歷'), f0 = d0['檔案ID'];
  globalThis.FAIL_CREATE = true;
  const r2 = tryRun(h, 'pf@test.local', 'reportPdf', { caseId: 'C1', kind: 'resume' });
  globalThis.FAIL_CREATE = false;
  const d1 = tab(h, '文件紀錄').find(x => x['文件類型'] === '工程履歷');
  ok('4b 文件重產失敗：舊檔保留、紀錄不變', !r2.ok && !h.files[f0].trashed && d1['檔案ID'] === f0, r2.e);
}
// 5 多人同時改案件資料
{ const h = H(BE);
  const c0 = tab(h, '案件').find(x => x['案件ID'] === 'C1');
  const seen = { '客戶電話': c0['客戶電話'], '地址': c0['地址'] };
  h.run('pf@test.local', 'saveCaseInfo', { id: 'C1', fields: { '客戶電話': '0911111111' }, orig: { '客戶電話': seen['客戶電話'] } });
  const r = tryRun(h, 'rita@test.local', 'saveCaseInfo', { id: 'C1', fields: { '地址': '台中南屯新地址' }, orig: { '地址': seen['地址'] } });
  const c1 = tab(h, '案件').find(x => x['案件ID'] === 'C1');
  ok('5a 只改不同欄位：兩人的修改都保留', r.ok && c1['客戶電話'] === '0911111111' && c1['地址'] === '台中南屯新地址', r.e);
  const r2 = tryRun(h, 'rita@test.local', 'saveCaseInfo', { id: 'C1', fields: { '客戶電話': '0922222222' }, orig: { '客戶電話': seen['客戶電話'] } });
  ok('5b 改到別人剛改過的同一欄：擋下並說明', !r2.ok && tab(h, '案件').find(x => x['案件ID'] === 'C1')['客戶電話'] === '0911111111', r2.e);
  // 日誌：兩人開同一篇，第一人存檔後，第二人用舊畫面存檔
  const cs = h.run('pf@test.local', 'case', { id: 'C1' });
  const rev = cs.logs.find(l => l.id === 'L1').rev;
  h.run('kx@test.local', 'updateLog', { id: 'L1', rev, date: '2026/11/18', trades: ['木工'], text: '第一人改的' });
  const r3 = tryRun(h, 'pf@test.local', 'updateLog', { id: 'L1', rev, date: '2026/11/18', trades: ['木工'], text: '第二人用舊畫面' });
  ok('5c 日誌：用過期畫面存檔會被擋下', !r3.ok && tab(h, '工程日誌').find(x => x['日誌ID'] === 'L1')['今日狀況'] === '第一人改的', r3.e);
}
// 9、10 照片說明修改、刪照片隨存檔生效
{ const h = H(BE);
  const lid = h.run('kx@test.local', 'saveLog', { caseId: 'C1', date: '2026/11/19', trades: ['木工'], text: 'x', photos: [{ data: 'AAAA', note: '原說明' }, { data: 'AAAA', note: '第二張' }] });
  const phs = tab(h, '日誌照片').filter(x => x['日誌ID'] === lid);
  const r = tryRun(h, 'kx@test.local', 'updateLog', { id: lid, date: '2026/11/19', trades: ['木工'], text: 'x', notes: { [phs[0]['照片ID']]: '改過的說明' }, delPhotos: [phs[1]['照片ID']] });
  const after = tab(h, '日誌照片').filter(x => x['日誌ID'] === lid);
  ok('9 舊照片說明可修改並留下修改紀錄', r.ok && after[0]['說明'] === '改過的說明' && after[0]['說明修改人'] === 'P04', r.e);
  ok('10 刪照片跟著「儲存修改」一起生效', after[1]['刪除時間'] && after[1]['刪除人'] === 'P04');
}
// 8 客戶指示追蹤
{ const h = H(BE);
  const ci = h.run('pf@test.local', 'saveClientIns', { caseId: 'C1', text: '主臥衣櫃改到頂', date: '2026/11/18', owner: 'P04', due: '2026/11/25' });
  h.run('pf@test.local', 'confirmClientIns', { id: ci, method: '其他', status: '已確認', note: '電話確認' });
  let x = tab(h, '客戶指示').find(y => y['指示ID'] === ci);
  ok('8a 客戶確認後仍是「待執行」，不等於完成', x['執行狀態'] === '待執行' && x['執行人'] === 'P04' && x['執行期限'] === '2026/11/25', JSON.stringify([x['執行狀態'], x['執行人'], x['執行期限']]));
  const r0 = tryRun(h, 'rita@test.local', 'actClientIns', { id: ci, act: 'report', text: '已改' });
  ok('8b 只有執行人（或主管、設計師）能回報', !r0.ok, r0.e);
  const r1 = tryRun(h, 'kx@test.local', 'actClientIns', { id: ci, act: 'report', text: '' });
  ok('8c 回報要寫處理結果', !r1.ok, r1.e);
  h.run('kx@test.local', 'actClientIns', { id: ci, act: 'report', text: '木作已改 260cm' });
  x = tab(h, '客戶指示').find(y => y['指示ID'] === ci);
  ok('8d 執行人回報後為「已回報」', x['執行狀態'] === '已回報' && x['處理回報'] === '木作已改 260cm');
  const home = h.run('pf@test.local', 'home', {});
  ok('8e 負責設計師工作總表看到待確認完成', home.items.some(i => i.kind === 'cins' && i.id === ci));
  h.run('pf@test.local', 'actClientIns', { id: ci, act: 'done' });
  ok('8f 設計師確認完成', tab(h, '客戶指示').find(y => y['指示ID'] === ci)['執行狀態'] === '已完成');
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' PASS');
