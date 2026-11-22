// 在電腦上模擬 setupTestEnv（假的 Google 服務），確認匯入後系統能正常運作
const fs = require('fs');
const src = fs.readFileSync('out/TestCode.gs', 'utf8') + '\n' + fs.readFileSync('out/TestEnv.gs', 'utf8');
const props = {}; const sheets = {}; const files = {}; let fid = 0;
function sheetObj(name) {
  const v = sheets[name];
  return { getDataRange: () => ({ getDisplayValues: () => v.map(r => v[0].map((_, i) => r[i] == null ? '' : String(r[i]))), getValues: () => v.map(r => r.slice()) }),
    getRange: (r, c, nr, nc) => ({ setNumberFormat() { return this; }, setValues(rows) { rows.forEach((row, i) => { v[r - 1 + i] = v[r - 1 + i] || []; row.forEach((x, j) => v[r - 1 + i][c - 1 + j] = x); }); return this; },
      getValues: () => [v[r - 1].slice(c - 1, c - 1 + (nc || 1))], setValue: x => { v[r - 1][c - 1] = x; } }),
    getLastColumn: () => v[0].length, getLastRow: () => v.length, appendRow: row => v.push(row.slice()), setFrozenRows() { }, getName: () => name };
}
const ss = { getId: () => 'TESTSS', getUrl: () => 'u', getSheets: () => [{ name: '工作表1' }], insertSheet: n => { sheets[n] = [[]]; return sheetObj(n); }, deleteSheet() { }, getSheetByName: n => sheets[n] ? sheetObj(n) : null };
const folders = {};
function folder(path) { return folders[path] = folders[path] || { getId: () => path, getUrl: () => 'f:' + path, getName: () => path.split('/').pop(),
  getFoldersByName: n => { const p = path + '/' + n; let d = false; return { hasNext: () => !d && !!folders[p], next: () => { d = true; return folders[p]; } }; },
  createFolder: n => folder(path + '/' + n), getFilesByName: n => ({ hasNext: () => false }),
  createFile: b => { const id = 'F' + (++fid); files[id] = { name: b.name || b.getName && b.getName(), dir: path }; return { getId: () => id, getUrl: () => 'file:' + id, getName: () => files[id].name, getBlob: () => ({ getBytes: () => [1, 2] }), setTrashed() { } }; },
  setTrashed() { } }; }
const G = {
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
  SpreadsheetApp: { create: () => ss, openById: id => { if (id !== 'TESTSS') throw new Error('開到不是測試試算表：' + id); return ss; } },
  DriveApp: { createFolder: n => folder('/' + n), getFileById: id => ({ moveTo() { }, getParents: () => ({ next: () => folder('/' + '浩森系統_測試環境（假資料）') }), setTrashed() { } }), getFolderById: id => folder(id) },
  Utilities: { getUuid: () => Math.random().toString(16).slice(2) + 'abcdef1234', base64Decode: s => Buffer.from(s, 'base64'), base64Encode: b => Buffer.from(b).toString('base64'),
    newBlob: (c, t, n) => ({ name: n, getAs() { return { setName(x) { this.name = x; return this; } }; }, getName: () => n }),
    formatDate: (d, tz, p) => { const z = new Date(d.getTime() + 8 * 3600e3); const P = n => String(n).padStart(2, '0'); return p.replace('yyyy', z.getUTCFullYear()).replace('MM', P(z.getUTCMonth() + 1)).replace('dd', P(z.getUTCDate())).replace('HH', P(z.getUTCHours())).replace('mm', P(z.getUTCMinutes())).replace('ss', P(z.getUTCSeconds())).replace(/^u$/, String(z.getUTCDay() || 7)); } },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'pthz@housenaid.com' }) },
  LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) }, CacheService: { getScriptCache: () => ({ get: () => null, put() { } }) },
  UrlFetchApp: { fetch: () => ({ getContent: () => [0] }) }, Logger: { log: m => console.log('  [Logger]', String(m).split('\n')[0]) }, HtmlService: {}, ContentService: {}, MimeType: { PDF: 'application/pdf' }
};
// 第一次執行：SS_ID 還沒設定
let m = {}; new Function(...Object.keys(G), 'exp', src + ';exp.setup=setupTestEnv;')(...Object.values(G), m);
m.setup();
console.log('匯入資料表', Object.keys(sheets).length, '張；照片', Object.keys(files).length, '個；TEST_SS_ID =', props.TEST_SS_ID);
// 第二次執行（像部署後的網頁應用程式）：SS_ID 讀到測試試算表
m = {}; new Function(...Object.keys(G), 'exp', src + ';exp.run_=run_;exp.SS=SS_ID;exp.setup=setupTestEnv;')(...Object.values(G), m);
console.log('後端連到', m.SS);
const boss = 'pthz@housenaid.com';
const h = m.run_(boss, 'home', {}); console.log('Boss 工作總表：', h.me.name, '待辦', h.items.length, '件；案件', h.cases.length);
const c = m.run_(boss, 'case', { id: 'C1' });
const l20 = c.logs.find(l => l.date === '2026/11/20'); console.log('11/20 日誌：', l20.status, '簽核人', l20.signer, '照片', l20.photos.length, '指示', c.ins.filter(i => i.logId === l20.id).length);
try { m.setup(); } catch (e) { console.log('重複執行 setup 被擋：', e.message.slice(0, 20)); }
console.log('photo path sample', sheets['日誌照片'][1][3], '→ 資料夾', Object.values(files)[0].dir);
