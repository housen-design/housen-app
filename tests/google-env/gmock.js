// 模擬 Google 服務（Drive v3、Sheets v4 進階服務、UrlFetch、快取…），drive.file 權限的行為也模擬進去：
// 只有這個專案建立的檔案查得到、改得到；其他檔案（例如正式試算表、正式資料夾）一律 404。
const crypto = require('crypto');
module.exports = function (src) {
const cache = {};
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
  get: (id, opt) => { const f = getF(id); return { id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents.slice(), trashed: !!f.trashed, size: String(Buffer.byteLength(f.content || '')), modifiedTime: f.mt || '' }; },
  list: opt => { const q = opt.q; const pm = q.match(/'([^']+)' in parents/), nm = q.match(/name = '((?:[^'\\]|\\.)*)'/), nc = q.match(/name contains '((?:[^'\\]|\\.)*)'/);
    const isF = /mimeType = 'application\/vnd.google-apps.folder'/.test(q), notF = /mimeType != /.test(q), mt = q.match(/mimeType = '([^']+)'/);
    return { files: Object.values(files).filter(f => f.app && !f.trashed && (!pm || f.parents[0] === pm[1]) && (!nm || f.name === nm[1].replace(/\\'/g, "'")) && (!nc || f.name.indexOf(nc[1]) >= 0)
      && (!isF || f.mimeType === 'application/vnd.google-apps.folder') && (!notF || f.mimeType !== 'application/vnd.google-apps.folder') && (!mt || isF || f.mimeType === mt[1])).map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents, modifiedTime: f.mt || '' })) }; },
  update: (meta, id, blob, opt) => { const f = getF(id); f.mt = String(Date.now()); if ('trashed' in meta) f.trashed = meta.trashed; if (opt && opt.addParents) f.parents = [opt.addParents]; return { id }; }
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
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, setProperties: o => Object.assign(props, o), deleteProperty: k => { delete props[k]; }, getProperties: () => Object.assign({}, props) }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'pthz@housenaid.com' }) },
  ScriptApp: { getOAuthToken: () => 'tok' },
  UrlFetchApp: { fetch: (u, o) => { fetchLog.push(u); const m = u.match(/drive\/v3\/files\/([^?]+)\?alt=media/);
    if (m) { const f = getF(m[1]); return { getBlob: () => ({ setName() { return this; }, getBytes: () => Buffer.from(f.content || 'x'), getContentType: () => f.mimeType }), getContentText: () => String(f.content || '') }; }
    if (/tokeninfo/.test(u)) return { getResponseCode: () => 400, getContentText: () => '{}' };
    return { getContent: () => [1, 2, 3], getResponseCode: () => 200, getContentText: () => '' }; } },
  Utilities: { sleep: ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(ms, 1500)), getUuid: () => crypto.randomUUID(), base64Decode: s => Buffer.from(s, 'base64'), base64Encode: b => Buffer.from(b).toString('base64'),
    base64EncodeWebSafe: s => Buffer.from(typeof s === 'string' ? s : Buffer.from(s)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
    computeHmacSha256Signature: (s, k) => crypto.createHmac('sha256', k).update(s).digest(),
    newBlob: (c, t, n) => { const b = { content: typeof c === 'string' ? c : Buffer.from(c || []).toString('latin1'), type: t, name: n, getName: () => b.name, getContentType: () => b.type, getDataAsString: () => String(b.content),
      setName(x) { b.name = x; return b; }, getAs: tt => { const p = Object.assign({}, b, { type: tt }); p.setName = x => { p.name = x; return p; }; p.getName = () => p.name; p.getContentType = () => tt; return p; }, getBytes: () => Buffer.from(String(b.content)) }; return b; },
    formatDate: (d, tz, p) => { const z = new Date(d.getTime() + 8 * 3600e3); const P = n => String(n).padStart(2, '0'); return p.replace('yyyy', z.getUTCFullYear()).replace('MM', P(z.getUTCMonth() + 1)).replace('dd', P(z.getUTCDate())).replace('HH', P(z.getUTCHours())).replace('mm', P(z.getUTCMinutes())).replace('ss', P(z.getUTCSeconds())).replace(/^u$/, String(z.getUTCDay() || 7)); } },
  LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) }, CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; } }) },
  Logger: { log() { } }, HtmlService: {}, ContentService: { createTextOutput: s => ({ setMimeType() { return JSON.parse(s); } }), MimeType: { JSON: 'json' } }, MimeType: { PDF: 'application/pdf' }
};
const boot = () => { const m = {}; new Function(...Object.keys(G), 'exp', src + ';Object.assign(exp,{setupTestEnv,resetTestEnv,run_,doPost,sign_,checkIsolation,SS_ID});')(...Object.values(G), m); return m; };
// 每次請求都是一個新的執行（就像 Google 上每次呼叫）
const call = (m, body) => boot().doPost({ postData: { contents: JSON.stringify(body) } });
return { G, files, books, props, PROD, snapProd, prod0, boot, call, getF, cache, fetchLog: () => fetchLog };
};
