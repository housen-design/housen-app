/**
 * 浩森設計工作管理系統｜Google 獨立測試環境（假資料）
 * 這個 Apps Script 專案與正式系統完全分開：自己的試算表、自己的雲端資料夾、自己的登入金鑰。
 * 權限只要求 drive.file：Google 層級只允許碰「這個專案自己建立的檔案」，看不到也改不了其他檔案（包括正式試算表）。
 *
 * 使用方式：
 *   1. 執行 setupTestEnv：在「我的雲端硬碟」建立「浩森系統_測試環境（假資料）」資料夾、測試試算表，放入假案件與假照片。
 *   2. 部署為網頁應用程式（執行身分：我；存取權：所有人），把網址填到測試網站的 config.js。
 *   重來：執行 resetTestEnv，只會把「建立時記下 ID、而且裡面有建立時放的標記檔」的那個測試資料夾移到垃圾桶。
 */
const TEST_DATA = /*__TEST_DATA__*/null;
const TEST_ROOT_NAME = '浩森系統_測試環境_1123（假資料）';
const TEST_MARK_NAME = '測試環境標記（請勿刪除）.txt';

function setupTestEnv() {
  if (TEST_PROPS.getProperty('TEST_SS_ID')) throw new Error('測試環境已經建立過了。要重來請先執行 resetTestEnv');
  const owner = Session.getEffectiveUser().getEmail();   // 建立的人＝測試環境裡的 Boss
  if (!/@housenaid\.com$/.test(owner)) throw new Error('請用公司帳號執行：' + owner);
  // 1) 測試根資料夾＋標記檔（重來時用 ID 與標記內容雙重確認）
  const root = Drive.Files.create({ name: TEST_ROOT_NAME, mimeType: 'application/vnd.google-apps.folder' }, null, { fields: 'id' });
  const token = Utilities.getUuid();
  const mark = Drive.Files.create({ name: TEST_MARK_NAME, parents: [root.id], mimeType: 'text/plain' },
    Utilities.newBlob('浩森系統測試環境\n' + token + '\n建立者：' + owner + '\n', 'text/plain', TEST_MARK_NAME), { fields: 'id' });
  TEST_PROPS.setProperties({ TEST_ROOT_ID: root.id, TEST_MARK_ID: mark.id, TEST_MARK_TOKEN: token });
  // 2) 測試試算表（全部用純文字寫入，日期不會被自動轉格式）
  TEST_DATA.T['人員'].forEach(r => { for (let i = 0; i < r.length; i++) if (r[i] === '__OWNER__') r[i] = owner; });
  const names = Object.keys(TEST_DATA.T);
  const ss = Sheets.Spreadsheets.create({ properties: { title: '浩森系統_測試資料_1123（假資料）' }, sheets: names.map(n => ({ properties: { title: n } })) });
  try { Drive.Files.update({}, ss.spreadsheetId, null, { addParents: root.id, removeParents: 'root' }); } catch (e) { Logger.log('試算表留在雲端硬碟最上層（移動失敗不影響）：' + e.message); }
  const data = names.map(n => { const rows = TEST_DATA.T[n], w = rows[0].length;
    return { range: "'" + n + "'!A1", values: rows.map(r => { const o = r.slice(0, w); while (o.length < w) o.push(''); return o.map(v => v == null ? '' : String(v)); }) }; });
  Sheets.Spreadsheets.Values.batchUpdate({ valueInputOption: 'RAW', data: data }, ss.spreadsheetId);
  TEST_PROPS.setProperty('TEST_SS_ID', ss.spreadsheetId);
  // 3) 假照片、簽名：依原本的子資料夾放好（都在測試根資料夾底下）
  const dirs = {};
  const dirOf = path => {
    if (!path) return root.id;
    if (dirs[path]) return dirs[path];
    let parent = root.id;
    path.split('/').forEach(n => {
      const f = (Drive.Files.list({ q: "'" + parent + "' in parents and name = '" + n.replace(/'/g, "\\'") + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false", fields: 'files(id)' }).files || [])[0];
      parent = f ? f.id : Drive.Files.create({ name: n, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }, null, { fields: 'id' }).id;
    });
    return (dirs[path] = parent);
  };
  TEST_DATA.imgs.forEach(x => Drive.Files.create({ name: x.name, parents: [dirOf(x.dir)], mimeType: x.type }, Utilities.newBlob(Utilities.base64Decode(x.b64), x.type, x.name), { fields: 'id' }));
  const msg = '完成：測試資料夾 https://drive.google.com/drive/folders/' + root.id + '\n測試試算表 https://docs.google.com/spreadsheets/d/' + ss.spreadsheetId;
  Logger.log(msg);
  return msg;
}

/** 重來：只把「建立時記下 ID」且「標記檔內容相符」的測試資料夾移到垃圾桶 */
function resetTestEnv() {
  const rootId = TEST_PROPS.getProperty('TEST_ROOT_ID'), markId = TEST_PROPS.getProperty('TEST_MARK_ID'), token = TEST_PROPS.getProperty('TEST_MARK_TOKEN');
  if (rootId) {
    if (!markId || !token) throw new Error('安全檢查：缺少建立時的標記紀錄，停止（不刪任何東西）');
    const mk = Drive.Files.get(markId, { fields: 'id,parents,trashed' });
    if ((mk.parents || [])[0] !== rootId) throw new Error('安全檢查：標記檔不在記錄的測試資料夾裡，停止');
    const body = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + markId + '?alt=media', { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }).getContentText();
    if (body.indexOf(token) < 0) throw new Error('安全檢查：標記內容不符，停止');
    const rf = Drive.Files.get(rootId, { fields: 'id,name' });
    if (rf.name !== TEST_ROOT_NAME) throw new Error('安全檢查：資料夾名稱不符，停止');
    Drive.Files.update({ trashed: true }, rootId);
  }
  const ssId = TEST_PROPS.getProperty('TEST_SS_ID');
  if (ssId) { try { const f = Drive.Files.get(ssId, { fields: 'parents' }); if ((f.parents || [])[0] !== rootId) Drive.Files.update({ trashed: true }, ssId); } catch (e) { } }   // 試算表若沒移進資料夾，單獨移到垃圾桶（它是本專案建立的）
  ['TEST_SS_ID', 'TEST_ROOT_ID', 'TEST_MARK_ID', 'TEST_MARK_TOKEN'].forEach(k => TEST_PROPS.deleteProperty(k));
  Logger.log('已清除測試環境' + (rootId ? '，測試資料夾已移到垃圾桶' : ''));
}

/** 授權後自我檢查：確認讀不到雲端硬碟裡其他檔案（只看得到本專案建立的） */
function checkIsolation() {
  const seen = (Drive.Files.list({ q: 'trashed = false', fields: 'files(id,name)', pageSize: 100 }).files || []).map(f => f.name);
  Logger.log('這個專案在你的雲端硬碟看得到 ' + seen.length + ' 個檔案：\n' + seen.join('\n'));
  return seen;
}


/** 只清掉 11/22 舊版留下的兩個設定（不碰任何檔案）。新版設定（有標記檔）存在時拒絕。 */
function clearOldPropsOnly() {
  if (TEST_PROPS.getProperty('TEST_MARK_ID')) throw new Error('目前是新版測試環境，不清除');
  const before = { TEST_ROOT_ID: TEST_PROPS.getProperty('TEST_ROOT_ID'), TEST_SS_ID: TEST_PROPS.getProperty('TEST_SS_ID') };
  TEST_PROPS.deleteProperty('TEST_ROOT_ID'); TEST_PROPS.deleteProperty('TEST_SS_ID');
  Logger.log('已清除舊設定（檔案沒動）：' + JSON.stringify(before) + '\n剩下的設定鍵：' + Object.keys(TEST_PROPS.getProperties()).join(','));
}

/** 唯讀盤點：列出這個程式看得到的所有檔案，標示屬於哪個測試根資料夾。不建立、不修改、不刪除。 */
function inspectVisibleFilesReadOnly() {
  const fs = Drive.Files.list({ q: 'trashed = false', pageSize: 200, fields: 'files(id,name,mimeType,parents,createdTime,owners(emailAddress))' }).files || [];
  const byId = {}; fs.forEach(f => byId[f.id] = f);
  const newRoot = TEST_PROPS.getProperty('TEST_ROOT_ID');
  const top = f => { let c = f, path = [f.name]; for (let i = 0; i < 12; i++) { const p = (c.parents || [])[0]; if (!byId[p]) return { root: c, path: path }; c = byId[p]; path.unshift(c.name); } return { root: c, path: path }; };
  const groups = {};
  fs.sort((a, b) => a.createdTime < b.createdTime ? -1 : 1).forEach(f => { const t = top(f), k = t.root.id === newRoot ? '新測試根資料夾' : ('其他：' + t.root.name + ' ' + t.root.id);
    (groups[k] = groups[k] || []).push(f.createdTime + ' ｜ ' + t.path.join(' / ') + ' ｜ ' + f.mimeType.replace('application/vnd.google-apps.', 'google-') + ' ｜ ' + (f.owners || []).map(o => o.emailAddress).join(',')); });
  Object.keys(groups).forEach(k => Logger.log(k + '（' + groups[k].length + ' 個）\n' + groups[k].join('\n')));
  Logger.log('設定鍵：' + Object.keys(TEST_PROPS.getProperties()).join(','));
}

/* ========== 真實 Google 上的實測（只用測試試算表與測試資料夾） ========== */
const TEST_OWNER_ = () => Session.getEffectiveUser().getEmail();
/** 記下測試網址（部署後執行一次）：之後的拒絕測試會對這個網址送真正的 HTTP 要求 */
const TEST_EXEC_URL = '';   // 部署後填入「網頁應用程式」的 /exec 網址（在編輯器執行時 Google 只會給 /dev 網址）
function setWebAppUrl() {
  const u = TEST_EXEC_URL || ScriptApp.getService().getUrl();
  if (!u) throw new Error('還沒有部署網頁應用程式');
  if (!/\/exec$/.test(u)) throw new Error('需要部署後的 /exec 網址，不是 ' + u);
  TEST_PROPS.setProperty('TEST_WEBAPP_URL', u);
  Logger.log('測試網址：' + u);
}
/** 整份測試試算表＋測試資料夾裡所有檔案的狀態（用來比對「完全沒變」） */
function envSnapshot_() {
  TSheets.flush();
  const id = testSsId_();
  const names = (Sheets.Spreadsheets.get(id, { fields: 'sheets.properties.title' }).sheets || []).map(s => s.properties.title);
  const vals = Sheets.Spreadsheets.Values.batchGet(id, { ranges: names.map(n => "'" + n.replace(/'/g, "''") + "'") }).valueRanges.map(v => v.values || []);
  // 試算表本身的修改時間由內容比對負責（Google 會在寫入後延遲更新它）；其他檔案比對編號＋修改時間
  const list = (Drive.Files.list({ q: 'trashed = false', pageSize: 500, fields: 'files(id,name,modifiedTime)' }).files || []);
  const fs = list.map(f => f.id === id ? f.id : f.id + '@' + f.modifiedTime).sort();
  const rows = {}; names.forEach((n, i) => rows[n] = Math.max(0, vals[i].length - 1));
  const names2 = {}; list.forEach(f => names2[f.id] = f.name);
  return { key: JSON.stringify([vals, fs]), rows: rows, files: fs.length, list: fs, names: names2 };
}
function post_(url, body) {
  const r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'text/plain', payload: JSON.stringify(body), muteHttpExceptions: true, followRedirects: true });
  try { return JSON.parse(r.getContentText()); } catch (e) { return { ok: false, error: 'HTTP ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 80) }; }
}
function tokenAt_(email, x) { const body = Utilities.base64EncodeWebSafe(JSON.stringify({ e: String(email).toLowerCase(), x: x })); return body + '.' + mac_(body); }

/** 對已部署的測試網址送不合法的要求：全部要被拒絕，試算表內容與檔案完全不變 */
function liveRejectTests() {
  const url = TEST_PROPS.getProperty('TEST_WEBAPP_URL');
  if (!url) throw new Error('請先部署並執行 setWebAppUrl');
  if (url.indexOf('script.google.com') < 0) throw new Error('網址不對：' + url);
  const R = [], ok = (n, c, i) => { R.push(!!c); Logger.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + String(i).slice(0, 90) : '')); };
  const boss = sign_(TEST_OWNER_());
  const logs = readTable_('工程日誌'), signed = logs.find(l => l['日誌狀態'] === LS.SIGNED && l['案件ID'] === 'C1'), pend = logs.find(l => l['日誌狀態'] === LS.PENDING);
  const ph = readTable_('日誌照片')[0];
  const before = envSnapshot_();
  const cases = [
    ['沒有登入金鑰', { action: 'saveLog', payload: { caseId: 'C1', date: '2026/11/23', trades: ['木工'], text: 'x', submit: true } }],
    ['亂寫的金鑰', { action: 'saveLog', token: 'abc.def', payload: { caseId: 'C1', date: '2026/11/23', trades: ['木工'], text: 'x' } }],
    ['偽造簽章的金鑰', { action: 'signLog', token: Utilities.base64EncodeWebSafe(JSON.stringify({ e: TEST_OWNER_(), x: Date.now() + 864e5 })) + '.FAKE', payload: { id: pend['日誌ID'] } }],
    ['過期的金鑰', { action: 'deletePhoto', token: tokenAt_(TEST_OWNER_(), Date.now() - 60000), payload: { id: ph['照片ID'] } }],
    ['不在人員名單的公司帳號', { action: 'saveLog', token: tokenAt_('nobody@housenaid.com', Date.now() + 864e5), payload: { caseId: 'C1', date: '2026/11/23', trades: ['木工'], text: 'x' } }],
    ['假的 Google 登入憑證', { action: 'login', idToken: 'forged' }],
    ['Boss 要求切換身分寫入（正式版沒有這功能）', { action: 'saveTodo', token: boss, payload: { as: 'P04', text: 'x' } }],
    ['偽造案件編號：寫日誌（含照片）', { action: 'saveLog', token: boss, payload: { caseId: 'C999', date: '2026/11/23', trades: ['木工'], text: 'x', photos: [{ data: '/9j/AA==' }], submit: true } }],
    ['偽造案件編號：改階段', { action: 'setStage', token: boss, payload: { id: 'C999', stage: '結案' } }],
    ['偽造案件編號：改案件資料', { action: 'saveCaseInfo', token: boss, payload: { id: 'C999', fields: { '地址': 'x' } } }],
    ['偽造案件編號：產週報', { action: 'reportPdf', token: boss, payload: { caseId: 'C999', kind: 'week', from: '2026/11/01', to: '2026/11/20' } }],
    ['偽造日誌編號：簽核', { action: 'signLog', token: boss, payload: { id: 'L999' } }],
    ['偽造日誌編號：產 PDF', { action: 'buildLogPdf', token: boss, payload: { id: 'L999' } }],
    ['偽造日誌編號：下載 PDF', { action: 'pdfLog', token: boss, payload: { id: 'L999' } }],
    ['偽造照片編號：刪照片', { action: 'deletePhoto', token: boss, payload: { id: 'P999' } }],
    ['真的日誌＋別的案件編號（跨案）', { action: 'updateLog', token: boss, payload: { id: signed['日誌ID'], caseId: 'C2', date: '2026/11/23', trades: ['木工'], text: '被改' } }],
    ['分享紀錄：不明類型', { action: 'shareLog', token: boss, payload: { id: signed['日誌ID'], kind: 'hack' } }],
    ['分享紀錄：還沒有最新 PDF', { action: 'shareLog', token: boss, payload: { id: signed['日誌ID'], kind: 'share' } }],
    ['待簽核日誌：下載 PDF', { action: 'pdfLog', token: boss, payload: { id: pend['日誌ID'] } }]
  ];
  cases.forEach(([n, body]) => { const r = post_(url, body); ok(n + ' → 拒絕', r && r.ok === false, r && r.error); });
  const after = envSnapshot_();
  ok('以上要求之後：試算表內容完全沒變', after.key.split('],[')[0] === before.key.split('],[')[0] && JSON.stringify(after.rows) === JSON.stringify(before.rows));
  const diff = after.list.filter(x => before.list.indexOf(x) < 0).concat(before.list.filter(x => after.list.indexOf(x) < 0)).map(x => (before.names[x.split('@')[0]] || after.names[x.split('@')[0]] || '') + ' ' + x);
  ok('以上要求之後：檔案完全沒有新增、修改或刪除', after.files === before.files && !diff.length, before.files + ' → ' + after.files + (diff.length ? '；不同：' + diff.join('、') : ''));
  const okHome = post_(url, { action: 'home', token: boss, payload: {} });
  ok('對照：正確的 Boss 金鑰可以讀取工作總表（測試網址本身正常）', okHome.ok && okHome.data && okHome.data.testMode === false);
  Logger.log('拒絕測試 ' + R.filter(Boolean).length + '/' + R.length + ' PASS');
  return R.every(Boolean);
}

/** 完整流程：凱翔送出（2 張照片）→ 蘋芳確認 → Boss 下指示 → 蘋芳回報 → Boss 簽核 → Google 產生 PDF → 下載；再測 PDF 更新、重複請求、兩人同時產檔 */
function runFlowTest() {
  const R = [], ok = (n, c, i) => { R.push(!!c); Logger.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + String(i).slice(0, 120) : '')); };
  const BOSS = TEST_OWNER_(), KX = 'kx@test.invalid', PF = 'pf@test.invalid';
  const run = (who, a, d) => run_(who, a, d || {});   // 寫入動作會在鎖內自己重新讀取
  const L = id => { TSheets.flush(); return getLog_(id); };
  // 用測試資料夾裡現有的兩張假照片
  const imgs = readTable_('日誌照片').slice(0, 2).map(p => Utilities.base64Encode(TDrive.getFolderById(testRootId_()).getFoldersByName(PHOTO_DIR).next().getFilesByName(p['照片'].split('/').pop()).next().getBlob().getBytes()));
  const id = run(KX, 'saveLog', { caseId: 'C1', date: '2026/11/23', trades: ['系統櫃'], text: '【1123 實測】系統櫃進場安裝，主臥衣櫃到頂 260cm。', issue: '收邊需再確認', submit: true, reqId: 'flow' + Date.now(),
    photos: [{ data: imgs[0], note: '1123 實測照片一：衣櫃到頂' }, { data: imgs[1], note: '1123 實測照片二：收邊細節' }] });
  ok('凱翔送出日誌（2 張照片）', readTable_('日誌照片').filter(p => p['日誌ID'] === id).length === 2 && L(id)['日誌狀態'] === LS.DESIGNER, id);
  run(PF, 'confirmLog', { id: id });
  ok('蘋芳確認 → 待簽核', L(id)['日誌狀態'] === LS.PENDING);
  run(BOSS, 'saveIns', { caseId: 'C1', logId: id, text: '【1123 實測】收邊請拍近照給我看', to: 'P03' });
  const ins = readTable_('主管指示').filter(i => i['日誌ID'] === id).pop();
  run(PF, 'actIns', { id: ins['指示ID'], act: 'reply', text: '【1123 實測】已補拍近照，收邊平整' });
  ok('Boss 下指示、蘋芳回報', readTable_('主管指示').find(i => i['指示ID'] === ins['指示ID'])['狀態'] === IS.REPLIED);
  run(BOSS, 'signLog', { id: id });
  ok('Boss 簽核', L(id)['日誌狀態'] === LS.SIGNED);
  let r = run(BOSS, 'buildLogPdf', { id: id });
  let l = L(id), f = TDrive.getFileById(l['PDF檔ID']);
  ok('Google 產生 PDF：狀態最新', r.ready && pdfFresh_(l));
  const path = []; let p = (Drive.Files.get(l['PDF檔ID'], { fields: 'parents' }).parents || [])[0];
  while (p && p !== testRootId_()) { const x = Drive.Files.get(p, { fields: 'name,parents' }); path.unshift(x.name); p = (x.parents || [])[0]; }
  ok('PDF 位置：測試根資料夾／' + path.join('／'), p === testRootId_() && path.join('/') === CASE_ROOT + '/南屯王公館｜老屋翻新/' + LOG_PDF_DIR);
  const meta = Drive.Files.get(l['PDF檔ID'], { fields: 'name,mimeType,size' });
  ok('PDF 檔案：' + meta.name + '（' + Math.round(meta.size / 1024) + ' KB）', meta.mimeType === 'application/pdf' && +meta.size > 20000);
  const firstPdf = l['PDF檔ID'];
  r = run(BOSS, 'buildLogPdf', { id: id });
  ok('已是最新再按一次：不產新檔', r.already && L(id)['PDF檔ID'] === firstPdf);
  r = run(PF, 'pdfLog', { id: id });
  ok('下載：拿到 PDF 內容', r.fresh && /\.pdf$/.test(r.name) && Utilities.base64Decode(r.data).length === +meta.size);
  run(PF, 'shareLog', { id: id, kind: 'download' });
  ok('下載紀錄 +1', +L(id)['下載次數'] === 1);
  // 指示有變動 → 待更新 → 更新後換新檔、舊檔收回
  run(PF, 'actIns', { id: ins['指示ID'], act: 'reply', text: '【1123 實測】補充：收邊已用矽利康修飾' });
  ok('回報有變動 → PDF 待更新', pdfState_(L(id)) === 'pending');
  ok('待更新時分享紀錄被拒絕', (() => { try { run(PF, 'shareLog', { id: id, kind: 'share' }); return false; } catch (e) { return /不是最新/.test(e.message); } })());
  r = run(BOSS, 'buildLogPdf', { id: id });
  l = L(id);
  ok('更新 PDF → 新檔、最新', r.ready && l['PDF檔ID'] !== firstPdf && pdfFresh_(l));
  ok('舊 PDF 已移到垃圾桶', Drive.Files.get(firstPdf, { fields: 'trashed' }).trashed === true);
  // 兩人同時產同一份（真的同時送兩個 HTTP 要求）
  const url = TEST_PROPS.getProperty('TEST_WEBAPP_URL');
  if (url) {
    run(BOSS, 'saveIns', { caseId: 'C1', logId: id, text: '【1123 實測】同時產檔前的新指示', to: 'P03' });
    const tok = sign_(BOSS);
    const req = { url: url, method: 'post', contentType: 'text/plain', muteHttpExceptions: true, followRedirects: true, payload: JSON.stringify({ action: 'buildLogPdf', token: tok, payload: { id: id } }) };
    const out = UrlFetchApp.fetchAll([req, req]).map(x => { try { return JSON.parse(x.getContentText()); } catch (e) { return { ok: false, error: x.getContentText().slice(0, 60) }; } });
    l = L(id);
    const live = (Drive.Files.list({ q: "trashed = false and name contains '" + id.slice(0, 4) + "' and mimeType = 'application/pdf'", fields: 'files(id)' }).files || []);
    ok('兩人同時產檔：兩個請求都成功', out.every(x => x.ok), JSON.stringify(out.map(x => x.ok ? 'ok' : x.error)));
    ok('兩人同時產檔：只留一份 PDF、紀錄指到它、狀態最新', live.length === 1 && live[0].id === l['PDF檔ID'] && pdfFresh_(l), live.length + ' 份');
    // 產檔與新增指示同時發生：不能把舊內容標成最新
    const req2 = { url: url, method: 'post', contentType: 'text/plain', muteHttpExceptions: true, followRedirects: true, payload: JSON.stringify({ action: 'saveIns', token: tok, payload: { caseId: 'C1', logId: id, text: '【1123 實測】產檔同時新增的指示', to: 'P03' } }) };
    run(PF, 'actIns', { id: ins['指示ID'], act: 'reply', text: '【1123 實測】再補充一次，讓 PDF 需要更新' });
    UrlFetchApp.fetchAll([req, req2]);
    l = L(id);
    const lastIns = insAtMap_('C1')[id] || '';
    ok('產檔與新增指示同時：若標成最新，PDF 時間一定晚於最後的指示', !pdfFresh_(l) || String(l['PDF時間']) > String(lastIns), l['PDF時間'] + ' vs ' + lastIns);
    r = run(BOSS, 'buildLogPdf', { id: id });
    ok('之後再產一次 → 最新', r.ready && pdfFresh_(L(id)));
  } else ok('同時產檔測試需要先部署並執行 setWebAppUrl', false);
  TEST_PROPS.setProperty('TEST_FLOW_LOG', id);
  Logger.log('實測日誌 ' + id + '　PDF：https://drive.google.com/file/d/' + L(id)['PDF檔ID'] + '/view');
  Logger.log('完整流程 ' + R.filter(Boolean).length + '/' + R.length + ' PASS');
  return R.every(Boolean);
}
