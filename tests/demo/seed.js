// 產生試玩版的假資料：用真正的後端程式一步一步操作出來，資料彼此一致
const fs = require('fs'), path = require('path');
const makeEngine = require('./engine.js');
const src = fs.readFileSync(process.argv[2], 'utf8');
// 取用測試環境的資料表欄位（與正式欄位一致）
const hs = fs.readFileSync('/tmp/qa/harness.js', 'utf8');
const T = eval('(' + hs.slice(hs.indexOf('const T={') + 8, hs.indexOf('\n};') + 2) + ')');
for (const n of Object.keys(T)) if (!/^範本_/.test(n)) T[n] = [T[n][0]];
T['範本_工序'] = [T['範本_工序'][0],
  ['W01', '1', '保護工程', '保護工程', '1', '', '', 'Y'], ['W02', '2', '拆除', '拆除與清運', '3', '', '', 'Y'], ['W03', '3', '水電', '水電配管', '5', '水電封板前', '', 'Y'],
  ['W04', '4', '冷氣', '冷氣管路', '2', '', '可與水電同步', 'Y'], ['W05', '5', '泥作', '砌牆、粉光', '6', '', '', 'Y'], ['W06', '6', '防水', '浴室防水與試水', '3', '防水試水', '試水 48 小時', 'Y'],
  ['W07', '7', '木工', '木作', '12', '木作封板前', '', 'Y'], ['W08', '8', '油漆', '油漆批土與面漆', '7', '', '', 'Y'], ['W09', '9', '系統櫃', '系統櫃安裝', '3', '', '', 'Y'],
  ['W10', '10', '清潔', '細清與完工檢查', '2', '完工驗收', '', 'Y']];
T['範本_查驗清單'] = [T['範本_查驗清單'][0],
  ['Q01', '水電封板前', '1', '全室管線照片（含標示）', 'Y', 'Y'], ['Q02', '水電封板前', '2', '插座、開關位置對照圖面', 'Y', 'Y'], ['Q03', '水電封板前', '3', '冷熱水管保壓測試', 'Y', 'Y'],
  ['Q04', '防水試水', '1', '防水塗佈高度（淋浴區到頂）', 'Y', 'Y'], ['Q05', '防水試水', '2', '試水 48 小時無滲漏', 'Y', 'Y'],
  ['Q06', '木作封板前', '1', '天花板吊筋間距', 'Y', 'Y'], ['Q07', '木作封板前', '2', '維修孔位置', 'N', 'Y'], ['Q08', '完工驗收', '1', '五金、門片調整', 'N', 'Y']];
T['範本_開案SOP'] = [T['範本_開案SOP'][0],
  ['SOP01', '1', '全套圖面完成', '平面、立面、水電、天花', '設計師', 'Y'], ['SOP02', '2', '圖面完整性檢查', '開工前由 Boss 看過', 'Boss', 'Y'],
  ['SOP03', '3', '大樓／管委會裝修申請', '', '設計師', 'Y'], ['SOP04', '4', '鄰居公告與保護工程', '', '設計師', 'Y'], ['SOP05', '5', '工程款第一期請款', '', '行政', 'Y']];
T['範本_里程碑'] = [T['範本_里程碑'][0],
  ['M01', '提案', '1', '接洽、記錄需求', 'Boss', '-8', '', 'Y'], ['M02', '提案', '2', '現場丈量', '設計師', '-6', '', 'Y'], ['M03', '提案', '3', '平面配置', '設計師', '-3', '', 'Y'],
  ['M04', '提案', '4', '客戶現場提案', 'Boss', '0', '', 'Y'], ['D01', '設計', '1', '設計約簽回', 'Boss', '0', '', 'Y'], ['D02', '設計', '2', '平面定稿', '設計師', '7', '', 'Y'],
  ['D03', '設計', '3', '3D 透視圖', '設計師', '21', '', 'Y'], ['D04', '設計', '4', '施工圖', '設計師', '35', '', 'Y'], ['D05', '設計', '5', '工程報價', 'Boss', '42', '', 'Y']];
T['人員'].push(['P01', '林柏元', 'boss@demo', '創辦人', 'Boss', 'Y', 'Y', 'Y'], ['P02', '林妙娟', 'rita@demo', '行政財務經理', '行政', 'Y', 'Y', 'Y'],
  ['P03', '施蘋芳', 'pf@demo', '設計主任', '主管', 'N', 'N', 'Y'], ['P04', '許凱翔', 'kx@demo', '設計助理', '設計師', 'N', 'N', 'Y'], ['P05', '施明媛', 'candy@demo', '行政助理', '行政', 'Y', 'Y', 'Y']);
[['保護工程', '#9AA39B'], ['拆除', '#7C6F64'], ['水電', '#5B6F8C'], ['冷氣', '#5E8FA3'], ['泥作', '#9A8F80'], ['防水', '#4F7F88'], ['木工', '#8A6A4B'], ['油漆', '#B08D57'], ['系統櫃', '#6E6A63'], ['清潔', '#8C8274']]
  .forEach((t, i) => T['工種清單'].push([t[0], t[1], String(i + 1), 'Y']));
const H = T['案件'][0], row = o => H.map(h => o[h] || '');
T['案件'].push(
  row({ 案件ID: 'C1', 案件名稱: '南屯王公館｜老屋翻新', 客戶姓名: '王先生', 客戶電話: '0912-000-111', 地址: '台中市南屯區（示範）', 類型: '住宅', 來源: '舊客戶介紹', 負責設計師: 'P03', 階段: '施工', 狀態: '進行中', 建立日期: '2026/09/02', 提案日: '2026/09/12', 設計約簽約日: '2026/09/20', 工程約簽約日: '2026/10/25', 預計開工日: '2026/11/10', 預計完工日: '2027/01/22', 設計費: '280000', 工程金額: '2860000' }),
  row({ 案件ID: 'C2', 案件名稱: '北屯陳宅｜新成屋', 客戶姓名: '陳小姐', 客戶電話: '0922-000-222', 地址: '台中市北屯區（示範）', 類型: '住宅', 來源: '官網', 負責設計師: 'P04', 階段: '施工', 狀態: '進行中', 建立日期: '2026/09/20', 提案日: '2026/10/01', 設計約簽約日: '2026/10/08', 工程約簽約日: '2026/11/05', 預計開工日: '2026/11/12', 預計完工日: '2027/01/08', 設計費: '160000', 工程金額: '1450000' }),
  row({ 案件ID: 'C3', 案件名稱: '西屯林宅｜三房改兩房', 客戶姓名: '林太太', 客戶電話: '0933-000-333', 地址: '台中市西屯區（示範）', 類型: '住宅', 來源: '轉介', 負責設計師: 'P04', 階段: '設計', 狀態: '進行中', 建立日期: '2026/10/28', 提案日: '2026/11/06', 設計約簽約日: '2026/11/13', 設計費: '120000' }),
  row({ 案件ID: 'C4', 案件名稱: '大里張宅｜毛胚屋', 客戶姓名: '張先生', 地址: '台中市大里區（示範）', 類型: '住宅', 來源: 'IG', 負責設計師: 'P03', 階段: '提案', 狀態: '進行中', 建立日期: '2026/11/16', 提案日: '2026/11/28' }),
  row({ 案件ID: 'C5', 案件名稱: '太平李宅｜局部翻修', 客戶姓名: '李先生', 地址: '台中市太平區（示範）', 類型: '住宅', 來源: '舊客戶', 負責設計師: 'P03', 階段: '完工', 狀態: '進行中', 建立日期: '2026/06/01', 工程約簽約日: '2026/07/10', 預計開工日: '2026/07/20', 預計完工日: '2026/09/30', 實際完工日: '2026/10/05', 工程金額: '680000' }));
const files = {};
const E = makeEngine(src, T, files, fs.readFileSync('/home/claude/housen-app/icons/logo.png').toString('latin1'));
const EM = { P01: 'boss@demo', P02: 'rita@demo', P03: 'pf@demo', P04: 'kx@demo', P05: 'candy@demo' };
const run = (p, a, d) => { try { return E.run(EM[p], a, d); } catch (e) { throw new Error(a + ' as ' + p + ': ' + e.message); } };
const ph = n => fs.readFileSync(path.join(__dirname, 'photos', n)).toString('base64');
const last = (t) => T[t][T[t].length - 1], col = (t, r, c) => r[T[t][0].indexOf(c)];
const logRow = id => T['工程日誌'].find(r => r[0] === id);
function log(p, caseId, date, trades, text, opt) {
  opt = opt || {};
  const id = run(p, 'saveLog', { caseId, date, trades, text, issue: opt.issue || '', photos: (opt.photos || []).map(([f, note]) => ({ data: ph(f + '.jpg'), note })), submit: true });
  if (opt.stop === 'submit') return id;
  let st = col('工程日誌', logRow(id), '日誌狀態');
  if (st === '待設計師確認') { if (opt.stop === 'designer') return id; run(caseId === 'C1' ? 'P03' : 'P04', 'confirmLog', { id }); st = col('工程日誌', logRow(id), '日誌狀態'); }
  if (st === '待簽核' && opt.stop !== 'sign') { const s = col('工程日誌', logRow(id), '簽核人'); const who = Object.keys(EM).find(k => k === s) || 'P01'; run(who, 'signLog', { id }); run(who, 'buildLogPdf', { id }); }
  return id;
}
// ── C1 南屯王公館：施工中 ──
run('P03', 'applyTemplate', { caseId: 'C1' }); run('P03', 'lockPlan', { caseId: 'C1' });
const P1 = n => T['進度計畫'].find(r => r[1] === 'C1' && col('進度計畫', r, '工序名稱') === n)[0];
run('P03', 'setActualStart', { id: P1('保護工程'), date: '2026/11/10' }); run('P03', 'setDone', { id: P1('保護工程'), date: '2026/11/10' });
run('P03', 'setActualStart', { id: P1('拆除與清運'), date: '2026/11/11' }); run('P03', 'setDone', { id: P1('拆除與清運'), date: '2026/11/14', reason: '拆除發現舊管線鏽蝕，多清運一車' });
run('P03', 'setActualStart', { id: P1('水電配管'), date: '2026/11/17' });
run('P03', 'setActualStart', { id: P1('冷氣管路'), date: '2026/11/18' });
run('P03', 'saveCheck', { itemId: P1('水電配管'), checkId: 'Q01', done: true, status: '通過', note: '照片已拍', photo: ph('wire.jpg') });
run('P03', 'saveCheck', { itemId: P1('水電配管'), checkId: 'Q02', done: true, status: '需修正', note: '主臥床頭插座要再往左 20cm' });
log('P03', 'C1', '2026/11/10', ['保護工程'], '電梯、走道、地坪保護完成，鄰居公告已張貼。', { photos: [['done', '走道保護']] });
log('P04', 'C1', '2026/11/11', ['拆除'], '拆除廚房、浴室磁磚與舊櫃體。', { photos: [['wall', '浴室拆除後']] });
log('P04', 'C1', '2026/11/12', ['拆除'], '持續拆除，下午清運兩車。', { issue: '主臥牆面拆開後發現舊水管鏽蝕嚴重，建議全室更換。' });
log('P04', 'C1', '2026/11/13', ['拆除'], '拆除完成，現場清理。');
run('P03', 'markNoWork', { caseId: 'C1', date: '2026/11/14', reason: '等清運車，工班休息' });
log('P04', 'C1', '2026/11/17', ['水電'], '水電放樣、開始配管。', { photos: [['wire', '廚房配管'], ['wire', '主臥插座位置']] });
const L19 = log('P04', 'C1', '2026/11/19', ['水電', '冷氣'], '水電配管 70%，冷氣銅管進場。', { photos: [['ac', '冷氣管路走向'], ['wire', '浴室給水']], issue: '客廳冷氣排水坡度不足，需要降天花 3cm，已請設計確認。', stop: 'sign' });
// 蘋芳自己寫的日誌 → 由 Boss 簽核（試玩時 Boss 可以親手簽這篇）
log('P03', 'C1', '2026/11/20', ['水電', '冷氣'], '水電配管完成 90%，冷氣排水改走地板已打鑿完成。下週一封板前查驗。', { photos: [['wire', '主臥插座已移位'], ['ac', '冷氣排水改走地板']], issue: '主臥床頭插座依客戶要求往左移 20cm，已完成。', stop: 'sign' });
// 指示：一個已回報待 Boss 結案、一個逾期未回報
run('P01', 'saveIns', { caseId: 'C1', logId: L19, text: '冷氣排水改走地板？請和冷氣師傅確認可行性，拍照回報。', to: 'P04', due: '2026/11/21' });
const I1 = last('主管指示')[0];
run('P04', 'actIns', { id: I1, act: 'reply', text: '師傅確認可改走地板，需打鑿 2 米，不影響工期。' });
run('P01', 'saveIns', { caseId: 'C1', text: '浴室防水做到天花板，試水前通知我去看。', to: 'P03', due: '2026/11/16' });
// 客戶指示
run('P03', 'saveMeeting', { caseId: 'C1', name: '水電配置確認', date: '2026/11/16', attendees: '王先生、王太太、蘋芳、凱翔', audio: '', summary: '確認廚房插座位置；主臥衣櫃改做到頂；客廳冷氣位置不變。' });
const MT = last('會議')[0];
run('P03', 'saveClientIns', { caseId: 'C1', meetingId: MT, source: '會議', date: '2026/11/16', text: '主臥衣櫃改做到頂（原 220cm 改 260cm）', impact: true, amount: '18000', days: '1', owner: 'P04', due: '2026/11/27' });
const CI1 = last('客戶指示')[0];
run('P03', 'confirmClientIns', { id: CI1, status: '已確認', method: '現場簽名', sign: ph('sign.png'), shot: '', note: '' });
run('P04', 'actClientIns', { id: CI1, act: 'report', text: '木作師傅已依 260cm 重新放樣，追加材料已叫料。' });
run('P03', 'saveClientIns', { caseId: 'C1', meetingId: '', source: 'LINE', date: '2026/11/19', text: '廚房吊櫃改成開放層板', impact: true, amount: '-6000', days: '', owner: 'P03', due: '2026/11/24' });
run('P03', 'applySop', { caseId: 'C1' });
// 文件：會議記錄、客戶確認單、週報、工程履歷
run('P03', 'clientPdf', { meetingId: MT });
run('P03', 'clientPdf', { insId: CI1 });
run('P03', 'reportPdf', { caseId: 'C1', kind: 'week', from: '2026/11/10', to: '2026/11/16' });
run('P03', 'reportPdf', { caseId: 'C1', kind: 'resume' });
T['案件SOP'].filter(r => r[1] === 'C1').slice(0, 4).forEach(r => run('P03', 'setSop', { id: r[0], done: true }));
// ── C2 北屯陳宅：施工中（凱翔負責） ──
run('P04', 'applyTemplate', { caseId: 'C2' }); run('P03', 'lockPlan', { caseId: 'C2' });
const P2 = n => T['進度計畫'].find(r => r[1] === 'C2' && col('進度計畫', r, '工序名稱') === n)[0];
run('P04', 'setActualStart', { id: P2('保護工程'), date: '2026/11/12' }); run('P04', 'setDone', { id: P2('保護工程'), date: '2026/11/12' });
run('P04', 'cancelPlanItem', { id: P2('拆除與清運'), reason: '新成屋不需要拆除' });
run('P04', 'setActualStart', { id: P2('水電配管'), date: '2026/11/16' });
log('P04', 'C2', '2026/11/12', ['保護工程'], '保護工程完成。');
log('P04', 'C2', '2026/11/16', ['水電'], '水電放樣。', { photos: [['wire', '客廳放樣']] });
log('P04', 'C2', '2026/11/18', ['水電'], '配管中，預計週五完成。', { stop: 'sign' });
// ── C3 西屯林宅：設計中 ──
run('P04', 'applyMilestones', { caseId: 'C3', stage: '提案' }); run('P04', 'applyMilestones', { caseId: 'C3', stage: '設計' });
T['里程碑'].filter(r => r[1] === 'C3' && col('里程碑', r, '階段') === '提案').forEach(r => run(col('里程碑', r, '負責人') || 'P04', 'setMilestone', { id: r[0], act: 'done' }));
const D1 = T['里程碑'].find(r => r[1] === 'C3' && col('里程碑', r, '名稱') === '設計約簽回'); run('P01', 'setMilestone', { id: D1[0], act: 'done' });
// ── C4 大里張宅：提案中 ──
run('P03', 'applyMilestones', { caseId: 'C4', stage: '提案' });
// ── C5 太平李宅：結案、保固報修 ──
run('P01', 'setStage', { id: 'C5', stage: '結案' });
run('P02', 'saveRepair', { caseId: 'C5', date: '2026/11/18', text: '主臥衣櫃門片下垂，客戶來電', owner: 'P03' });
// 待辦、建議
run('P01', 'saveTodo', { text: '確認王公館燈具型號', caseId: 'C1', to: 'P03', due: '2026/11/21' });
run('P04', 'saveTodo', { text: '整理陳宅追加減報價', caseId: 'C2', to: 'P04', due: '' });
run('P03', 'suggestTemplate', { source: '手動', text: '老屋翻新拆除後一律檢查舊水管，列入拆除工序備註', tpl: '範本_工序' });
// 示範資料是今天一次產生的：把時間改回「當天就寫、當天簽」，才不會全部顯示成補登
const nextWork = d => { const t = new Date(d.replace(/\//g, '-') + 'T00:00:00+08:00'); do { t.setDate(t.getDate() + 1); } while (t.getDay() === 0 || t.getDay() === 6); return t.getFullYear() + '/' + String(t.getMonth() + 1).padStart(2, '0') + '/' + String(t.getDate()).padStart(2, '0'); };
const LH = T['工程日誌'][0], li = c => LH.indexOf(c);
T['工程日誌'].slice(1).forEach(r => {
  const d = r[li('日期')];
  const set = (c, v) => { if (li(c) >= 0 && r[li(c)]) r[li(c)] = v; };
  set('建立時間', d + ' 18:20:00'); set('最後修改時間', d + ' 18:20:00'); set('送出時間', d + ' 18:25:00');
  set('簽核期限', nextWork(d) + ' 12:00'); set('簽核時間', nextWork(d) + ' 09:40:00'); set('PDF時間', nextWork(d) + ' 09:40:00'); set('修訂時間', '');
  if (r[li('簽核內容')]) { try { const j = JSON.parse(r[li('簽核內容')]); r[li('簽核內容')] = JSON.stringify(j); } catch (e) { } }
});
const PH = T['日誌照片'][0];
T['日誌照片'].slice(1).forEach(r => { const l = T['工程日誌'].find(x => x[0] === r[PH.indexOf('日誌ID')]); if (l) r[PH.indexOf('拍攝時間')] = l[li('日期')] + ' 16:00:00'; });
fs.writeFileSync(process.argv[3], JSON.stringify({ T, files }));
console.log('ok', Object.keys(files).length, 'files', JSON.stringify({ T, files }).length, 'bytes');
