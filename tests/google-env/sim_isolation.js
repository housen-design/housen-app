// 在電腦上模擬 Google（drive.file 權限的行為也模擬進去），測試「測試環境」的隔離與完整流程。
// drive.file 模擬：只有這個專案建立的檔案查得到、改得到；其他檔案（例如正式試算表、正式資料夾）一律 404。
const fs = require('fs'), crypto = require('crypto');
const OUT = __dirname + '/out/';
const src = ['TestShim.gs', 'TestEnv.gs', 'TestCode.gs'].map(f => fs.readFileSync(OUT + f, 'utf8')).join('\n');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + String(i).slice(0, 110) : '')); };

// ---- 模擬雲端硬碟 ----
let seq = 0; const files = {};
const PROD = { folder: 'PROD_FOLDER_1', sheet: '1Trazrz1jfOxTaPFA43hb9YFubU5uSaGUZAnD4sWXrCw', file: 'PROD_FILE_1' };
files[PROD.folder] = { id: PROD.folder, name: '案件資料夾（正式）', mimeType: 'application/vnd.google-apps.folder', parents: ['root'], app: false };
files[PROD.sheet] = { id: PROD.sheet, name: '正式試算表', mimeType: 'application/vnd.google-apps.spreadsheet', parents: ['root'], app: false };
files[PROD.file] = { id: PROD.file, name: '正式日誌.pdf', mimeType: 'application/pdf', parents: [PROD.folder], app: false };
const snapProd = () => JSON.stringify([files[PROD.folder], files[PROD.sheet], files[PROD.file]]);
const prod0 = snapProd();
const nf = () => { const e = new Error('File not found'); e.code = 404; return e; };
const getF = id => { const f = files[id]; if (!f || !f.app) throw nf(); return f; };   // drive.file：看不到非本專案的檔案
const Drive = { Files: {
  create: (meta, blob, opt) => { const id = 'T' + (++seq); (meta.parents || []).forEach(p => { if (p !== 'root') getF(p); });
    files[id] = { id, name: meta.name, mimeType: meta.mimeType || (blob && blob.type) || '', parents: meta.parents || ['root'], app: true, trashed: false, content: blob ? blob.content : '' }; return { id, name: meta.name, mimeType: files[id].mimeType, parents: files[id].parents.slice() }; },
  get: (id, opt) => { const f = getF(id); return { id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents.slice(), trashed: f.trashed }; },
  list: opt => { const q = opt.q; const pm = q.match(/'([^']+)' in parents/), nm = q.match(/name = '((?:[^'\\]|\\.)*)'/);
    const isF = /mimeType = 'application\/vnd.google-apps.folder'/.test(q), notF = /mimeType != /.test(q);
    return { files: Object.values(files).filter(f => f.app && !f.trashed && (!pm || f.parents[0] === pm[1]) && (!nm || f.name === nm[1].replace(/\\'/g, "'"))
      && (!isF || f.mimeType === 'application/vnd.google-apps.folder') && (!notF || f.mimeType !== 'application/vnd.google-apps.folder')).map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents })) }; },
  update: (meta, id, blob, opt) => { const f = getF(id); if ('trashed' in meta) f.trashed = meta.trashed; if (opt && opt.addParents) f.parents = [opt.addParents]; return { id }; }
} };
// ---- 模擬試算表（Sheets API；只能開本專案建立的） ----
const books = {};
const Sheets = { Spreadsheets: {
  create: r => { const id = 'SS' + (++seq); files[id] = { id, name: r.properties.title, mimeType: 'application/vnd.google-apps.spreadsheet', parents: ['root'], app: true }; books[id] = {}; r.sheets.forEach(s => books[id][s.properties.title] = []); return { spreadsheetId: id }; },
  get: (id) => { getF(id); return { sheets: Object.keys(books[id]).map(t => ({ properties: { title: t } })) }; },
  batchUpdate: (r, id) => { getF(id); r.requests.forEach(q => { if (q.addSheet) books[id][q.addSheet.properties.title] = []; }); },
  Values: {
    batchGet: (id, o) => { getF(id); return { valueRanges: o.ranges.map(n => ({ values: books[id][n.slice(1, -1).replace(/''/g, "'")].map(r => r.slice()) })) }; },
    batchUpdate: (r, id) => { getF(id); r.data.forEach(d => { const n = d.range.match(/^'(.*)'!/)[1]; books[id][n] = d.values.map(x => x.slice()); }); },
    update: (r, id, a1) => { getF(id); const m = a1.match(/^'(.*)'!([A-Z]+)(\d+)/); const n = m[1], c = m[2].split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0), row = +m[3];
      r.values.forEach((vals, i) => { const t = books[id][n]; t[row - 1 + i] = t[row - 1 + i] || []; vals.forEach((v, j) => t[row - 1 + i][c - 1 + j] = v); }); },
    append: (r, id, a1) => { getF(id); const n = a1.match(/^'(.*)'!/)[1]; r.values.forEach(v => books[id][n].push(v.slice())); }
  } } };
const props = {};
let fetchLog = [];
const G = {
  Drive, Sheets,
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, setProperties: o => Object.assign(props, o), deleteProperty: k => { delete props[k]; } }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'pthz@housenaid.com' }) },
  ScriptApp: { getOAuthToken: () => 'tok' },
  UrlFetchApp: { fetch: (u, o) => { fetchLog.push(u); const m = u.match(/drive\/v3\/files\/([^?]+)\?alt=media/);
    if (m) { const f = getF(m[1]); return { getBlob: () => ({ setName() { return this; }, getBytes: () => Buffer.from(f.content || 'x'), getContentType: () => f.mimeType }), getContentText: () => String(f.content || '') }; }
    if (/tokeninfo/.test(u)) return { getResponseCode: () => 400, getContentText: () => '{}' };
    return { getContent: () => [1, 2, 3], getResponseCode: () => 200, getContentText: () => '' }; } },
  Utilities: { getUuid: () => crypto.randomUUID(), base64Decode: s => Buffer.from(s, 'base64'), base64Encode: b => Buffer.from(b).toString('base64'),
    base64EncodeWebSafe: s => Buffer.from(typeof s === 'string' ? s : Buffer.from(s)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
    computeHmacSha256Signature: (s, k) => crypto.createHmac('sha256', k).update(s).digest(),
    newBlob: (c, t, n) => { const b = { content: typeof c === 'string' ? c : Buffer.from(c || []).toString('latin1'), type: t, name: n, getName: () => b.name, getContentType: () => b.type, getDataAsString: () => String(b.content),
      setName(x) { b.name = x; return b; }, getAs: tt => { const p = Object.assign({}, b, { type: tt }); p.setName = x => { p.name = x; return p; }; p.getName = () => p.name; p.getContentType = () => tt; return p; }, getBytes: () => Buffer.from(String(b.content)) }; return b; },
    formatDate: (d, tz, p) => { const z = new Date(d.getTime() + 8 * 3600e3); const P = n => String(n).padStart(2, '0'); return p.replace('yyyy', z.getUTCFullYear()).replace('MM', P(z.getUTCMonth() + 1)).replace('dd', P(z.getUTCDate())).replace('HH', P(z.getUTCHours())).replace('mm', P(z.getUTCMinutes())).replace('ss', P(z.getUTCSeconds())).replace(/^u$/, String(z.getUTCDay() || 7)); } },
  LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) }, CacheService: { getScriptCache: () => ({ get: () => null, put() { } }) },
  Logger: { log() { } }, HtmlService: {}, ContentService: { createTextOutput: s => ({ setMimeType() { return JSON.parse(s); } }), MimeType: { JSON: 'json' } }, MimeType: { PDF: 'application/pdf' }
};
const boot = () => { const m = {}; new Function(...Object.keys(G), 'exp', src + ';Object.assign(exp,{setupTestEnv,resetTestEnv,run_,doPost,sign_,checkIsolation,SS_ID});')(...Object.values(G), m); return m; };
// 每次請求都是一個新的執行（就像 Google 上每次呼叫）
const call = (m, body) => boot().doPost({ postData: { contents: JSON.stringify(body) } });

// ===== 1. 建立 =====
let m = boot();
m.setupTestEnv();
ok('建立測試環境：記下測試試算表、根資料夾、標記檔', props.TEST_SS_ID && props.TEST_ROOT_ID && props.TEST_MARK_ID && props.TEST_MARK_TOKEN);
ok('照片都放在測試根資料夾底下', Object.values(files).filter(f => f.app && /image/.test(f.mimeType)).every(f => { let p = f.parents[0]; for (let i = 0; i < 5 && p !== props.TEST_ROOT_ID; i++) p = (files[p] || {}).parents ? files[p].parents[0] : null; return p === props.TEST_ROOT_ID; }));
m = boot();
ok('後端只連到測試試算表', m.SS_ID === props.TEST_SS_ID);
const tok = e => m.sign_(e);
const BOSS = tok('pthz@housenaid.com'), KX = tok('kx@test.invalid'), PF = tok('pf@test.invalid');
const sheet = n => { const t = books[props.TEST_SS_ID][n]; return t.slice(1).map(r => Object.fromEntries(t[0].map((k, i) => [k, r[i] || '']))); };
const countFiles = () => Object.values(files).filter(f => f.app && !f.trashed).length;
const snapshot = () => JSON.stringify(books[props.TEST_SS_ID]) + '|' + JSON.stringify(Object.values(files).map(f => [f.id, f.trashed, f.parents]));

// ===== 2. 隔離：不能用正式試算表、正式資料夾、正式檔案 =====
let r = call(m, { action: 'saveCaseInfo', token: BOSS, payload: { id: 'C1', fields: { 'Drive資料夾': 'https://drive.google.com/drive/folders/' + PROD.folder } } });
ok('案件資料夾貼正式資料夾網址 → 拒絕', !r.ok && /測試資料夾/.test(r.error), r.error);
books[props.TEST_SS_ID]['案件'][1][books[props.TEST_SS_ID]['案件'][0].indexOf('Drive資料夾')] = 'https://drive.google.com/drive/folders/' + PROD.folder;   // 假設有人直接改試算表塞進去
const lid0 = sheet('工程日誌').find(l => l['日誌狀態'] === '已簽核' && l['案件ID'] === 'C1')['日誌ID'];
r = call(m, { action: 'buildLogPdf', token: BOSS, payload: { id: lid0 } });
ok('就算試算表被塞進正式資料夾網址，產 PDF 也拒絕，不會存進正式資料夾', !r.ok && !Object.values(files).some(f => f.parents[0] === PROD.folder && f.app), r.error);
books[props.TEST_SS_ID]['案件'][1][books[props.TEST_SS_ID]['案件'][0].indexOf('Drive資料夾')] = '';
const LH = books[props.TEST_SS_ID]['工程日誌'][0], lrow = books[props.TEST_SS_ID]['工程日誌'].find(x => x[0] === lid0);
lrow[LH.indexOf('PDF檔ID')] = PROD.file; lrow[LH.indexOf('PDF時間')] = '2099/01/01 00:00:00';
r = call(m, { action: 'pdfView', token: BOSS, payload: { id: lid0 } });
ok('日誌的 PDF 編號被改成正式檔案 → 讀不到、也不會被移到垃圾桶', !r.ok && !files[PROD.file].trashed, r.error);
r = call(m, { action: 'buildLogPdf', token: BOSS, payload: { id: lid0 } });
ok('重產 PDF 時也不會去回收正式檔案', !files[PROD.file].trashed);
lrow[LH.indexOf('PDF檔ID')] = ''; lrow[LH.indexOf('PDF時間')] = '';
props.TEST_SS_ID_BAK = props.TEST_SS_ID;
try { boot(); const mm = {}; } catch (e) { }
ok('正式資料完全沒被動到', snapProd() === prod0);

// ===== 3. 未登入、錯誤金鑰、偽造編號：全部不能寫、不能產檔、不能刪 =====
const before = snapshot(), n0 = countFiles();
const bad = [
  ['沒有登入金鑰', { action: 'saveLog', payload: { caseId: 'C1', date: '2026/11/22', trades: ['木工'], text: 'x', submit: true } }],
  ['亂寫的金鑰', { action: 'saveLog', token: 'abc.def', payload: { caseId: 'C1', date: '2026/11/22', trades: ['木工'], text: 'x' } }],
  ['偽造簽章的金鑰', { action: 'signLog', token: Buffer.from(JSON.stringify({ e: 'pthz@housenaid.com', x: Date.now() + 1e9 })).toString('base64') + '.FAKE', payload: { id: lid0 } }],
  ['過期的金鑰', { action: 'deletePhoto', token: (() => { const body = Buffer.from(JSON.stringify({ e: 'pthz@housenaid.com', x: Date.now() - 1000 })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'); return body + '.' + crypto.createHmac('sha256', props.SESSION_SECRET).update(body).digest('base64').replace(/\+/g, '-').replace(/\//g, '_'); })(), payload: { id: 'x' } }],
  ['不在人員名單的公司帳號', { action: 'saveLog', token: tok('someone@housenaid.com'), payload: { caseId: 'C1', date: '2026/11/22', trades: ['木工'], text: 'x' } }],
  ['登入驗證用假的 Google 憑證', { action: 'login', idToken: 'forged' }],
  ['偽造案件編號：寫日誌', { action: 'saveLog', token: BOSS, payload: { caseId: 'C999', date: '2026/11/22', trades: ['木工'], text: 'x', photos: [{ data: 'AAAA' }], submit: true } }],
  ['偽造案件編號：改階段', { action: 'setStage', token: BOSS, payload: { id: 'C999', stage: '結案' } }],
  ['偽造案件編號：改案件資料', { action: 'saveCaseInfo', token: BOSS, payload: { id: 'C999', fields: { '地址': 'x' } } }],
  ['偽造日誌編號：簽核', { action: 'signLog', token: BOSS, payload: { id: 'L999' } }],
  ['偽造日誌編號：產 PDF', { action: 'buildLogPdf', token: BOSS, payload: { id: 'L999' } }],
  ['偽造會議編號：產會議記錄 PDF', { action: 'clientPdf', token: BOSS, payload: { meetingId: 'M999' } }],
  ['偽造案件編號：產週報', { action: 'reportPdf', token: BOSS, payload: { caseId: 'C999', kind: 'week', from: '2026/11/01', to: '2026/11/20' } }],
  ['偽造照片編號：刪照片', { action: 'deletePhoto', token: BOSS, payload: { id: 'P999' } }],
  ['真的日誌＋偽造案件編號（跨案）', { action: 'updateLog', token: BOSS, payload: { id: lid0, caseId: 'C999', date: '2026/11/22', trades: ['木工'], text: '被改' } }]
];
bad.forEach(([name, body]) => { const x = call(m, body); ok(name + ' → 拒絕', !x.ok, x.error); });
ok('以上要求全部沒有新增、修改任何資料', snapshot() === before);
ok('以上要求全部沒有產生或刪除任何檔案', countFiles() === n0);

// ===== 4. 完整流程：送出 → 確認 → 指示 → 回報 → 簽核 → Google 產 PDF → 下載 =====
const ph = fs.readFileSync('/home/claude/demo/photos/cab.jpg').toString('base64');
r = call(m, { action: 'saveLog', token: KX, payload: { caseId: 'C1', date: '2026/11/22', trades: ['系統櫃'], text: '系統櫃進場安裝，主臥衣櫃到頂 260cm。', issue: '', photos: [{ data: ph, note: '主臥衣櫃到頂' }, { data: ph, note: '收邊細節' }], submit: true } });
const L = r.data; ok('凱翔送出日誌（含 2 張照片）', r.ok && sheet('日誌照片').filter(p => p['日誌ID'] === L).length === 2, r.error);
ok('照片存在測試根資料夾的「日誌照片」裡', Object.values(files).filter(f => f.app && f.name && f.name.startsWith(sheet('日誌照片').find(p => p['日誌ID'] === L)['照片'].split('/')[1])).every(f => files[f.parents[0]].parents[0] === props.TEST_ROOT_ID));
ok('狀態：待設計師確認', sheet('工程日誌').find(l => l['日誌ID'] === L)['日誌狀態'] === '待設計師確認');
r = call(m, { action: 'confirmLog', token: PF, payload: { id: L } }); ok('蘋芳確認', r.ok && sheet('工程日誌').find(l => l['日誌ID'] === L)['日誌狀態'] === '待簽核', r.error);
r = call(m, { action: 'saveIns', token: BOSS, payload: { caseId: 'C1', logId: L, text: '收邊請拍近照給我看', to: 'P03' } }); ok('Boss 下指示', r.ok, r.error);
const I = sheet('主管指示').slice(-1)[0]['指示ID'];
r = call(m, { action: 'actIns', token: PF, payload: { id: I, act: 'reply', text: '已補拍近照，收邊平整' } }); ok('蘋芳回報', r.ok, r.error);
r = call(m, { action: 'signLog', token: BOSS, payload: { id: L } }); ok('Boss 簽核（Boss 可簽任何日誌）', r.ok && sheet('工程日誌').find(l => l['日誌ID'] === L)['日誌狀態'] === '已簽核', r.error);
r = call(m, { action: 'buildLogPdf', token: BOSS, payload: { id: L } });
const pdfId = sheet('工程日誌').find(l => l['日誌ID'] === L)['PDF檔ID'];
ok('Google 產生 PDF，存在測試根資料夾／案件資料夾／南屯王公館／工程日誌', r.ok && pdfId && (() => { let p = files[pdfId].parents[0], path = []; while (p && p !== 'root') { path.unshift(files[p].name); p = files[p].parents[0]; } return path.join('/'); })() === '浩森系統_測試環境_1123（假資料）/案件資料夾/南屯王公館｜老屋翻新/工程日誌', r.error);
const html = files[pdfId].content;
ok('PDF 內容含案件名稱、2 張照片、指示、回報、頁尾', /南屯王公館/.test(html) && (html.match(/<img[^>]+data:image\/jpeg/g) || []).length >= 2 && /收邊請拍近照給我看/.test(html) && /已補拍近照，收邊平整/.test(html) && /狀態截至/.test(html));
r = call(m, { action: 'pdfLog', token: BOSS, payload: { id: L } }); ok('手機下載：拿到 PDF 檔', r.ok && r.data.data && /\.pdf$/.test(r.data.name), r.error);
r = call(m, { action: 'thumbs', token: BOSS, payload: { paths: sheet('日誌照片').filter(p => p['日誌ID'] === L).map(p => p['照片']) } }); ok('照片縮圖讀得到', r.ok && Object.keys(r.data).length === 2, r.error);
ok('整個流程後，正式資料完全沒被動到', snapProd() === prod0);

// ===== 5. 重來：用 ID＋標記檔確認 =====
const keep = props.TEST_MARK_TOKEN; props.TEST_MARK_TOKEN = 'tampered';
try { boot().resetTestEnv(); ok('標記內容不符 → 不刪', false); } catch (e) { ok('標記內容不符 → 不刪', !files[props.TEST_ROOT_ID].trashed, e.message); }
props.TEST_MARK_TOKEN = keep; const markId = props.TEST_MARK_ID; props.TEST_MARK_ID = PROD.file;
try { boot().resetTestEnv(); ok('標記檔編號被換成別的檔案 → 不刪', false); } catch (e) { ok('標記檔編號被換成別的檔案 → 不刪', !files[props.TEST_ROOT_ID].trashed && !files[PROD.file].trashed, e.message); }
props.TEST_MARK_ID = markId; const rootId = props.TEST_ROOT_ID; props.TEST_ROOT_ID = PROD.folder;
try { boot().resetTestEnv(); ok('根資料夾編號被換成正式資料夾 → 不刪', false); } catch (e) { ok('根資料夾編號被換成正式資料夾 → 不刪', !files[PROD.folder].trashed, e.message); }
props.TEST_ROOT_ID = rootId;
boot().resetTestEnv();
ok('全部相符 → 只把測試根資料夾移到垃圾桶，設定清空', files[rootId].trashed && !props.TEST_SS_ID && !props.TEST_ROOT_ID);
ok('正式資料完全沒被動到', snapProd() === prod0);
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' PASS');
