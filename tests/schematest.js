// 正式試算表補欄位（fixSchema）：用 11/23 唯讀取得的正式表頭與格子寬度（只有欄名，沒有資料）模擬
// Apps Script 的規則：寫到超過格子寬度的地方會出錯 → 必須先加欄
const fs = require('fs'), path = require('path');
const backend = process.argv[2] || path.join(__dirname, '..', 'backend', 'Code.gs');
const HEAD = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'prod_headers_20261123.json'), 'utf8'));
const MAXC = { '工程日誌': 30, '待辦': 10 };   // 11/23 正式表的格子寬度；其餘都是 26
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + String(i).slice(0, 120) : '')); };
function makeSS(withData) {
  const T = {}, MX = {};
  Object.keys(HEAD).forEach(n => { T[n] = [HEAD[n].slice()]; MX[n] = MAXC[n] || 26; if (withData) T[n].push(HEAD[n].map((h, i) => n + '#' + i)); });
  const sheet = n => T[n] ? {
    getLastColumn: () => Math.max(...T[n].map(r => r.length)), getMaxColumns: () => MX[n],
    insertColumnsAfter: (after, k) => { MX[n] += k; },
    getRange: (r, c, nr, nc) => {
      if (c + (nc || 1) - 1 > MX[n]) throw new Error('範圍超出試算表的大小（' + n + '）');
      return { getValues: () => [T[n][r - 1].slice(c - 1, c - 1 + (nc || 1))], setValues: v => v.forEach((row, i) => row.forEach((x, j) => { T[n][r - 1 + i][c - 1 + j] = x; })) };
    }
  } : null;
  const ss = { getSheetByName: sheet, insertSheet: n => { T[n] = [[]]; MX[n] = 26; return sheet(n); } };
  return { T, MX, ss };
}
function boot(ss) {
  const G = { SpreadsheetApp: { flush() { }, openById: () => ss }, Logger: { log() { } }, PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    CacheService: {}, LockService: {}, Utilities: {}, DriveApp: {}, UrlFetchApp: {}, HtmlService: {}, ContentService: {}, Session: {} };
  const m = {}; new Function(...Object.keys(G), 'exp', fs.readFileSync(backend, 'utf8') + ';exp.checkSchema=checkSchema;exp.fixSchema=fixSchema;')(...Object.values(G), m); return m;
}
const A = makeSS(true), before = JSON.stringify(Object.fromEntries(Object.keys(A.T).map(n => [n, A.T[n][1]])));
let m = boot(A.ss);
const gaps = m.checkSchema();
ok('正式表目前缺的資料表與欄位（與唯讀盤點一致）', gaps.length === 17, gaps.length + ' 項');
let err = null; try { m.fixSchema(); } catch (e) { err = e.message; }
ok('補欄位：格子不夠寬的表也能補（工程日誌 30→33、客戶指示 26→33、案件 26→28）', !err && A.MX['工程日誌'] >= 33 && A.MX['客戶指示'] >= 33 && A.MX['案件'] >= 28, err || JSON.stringify([A.MX['工程日誌'], A.MX['客戶指示'], A.MX['案件']]));
ok('補完再檢查：欄位齊全', boot(A.ss).checkSchema().length === 0);
ok('既有資料列一格都沒變', JSON.stringify(Object.fromEntries(Object.keys(HEAD).map(n => [n, A.T[n][1]]))) === before);
ok('既有欄位的順序沒變（新欄位都加在最右邊）', Object.keys(HEAD).every(n => HEAD[n].every((h, i) => A.T[n][0][i] === h)));
ok('新增三張資料表：進度異動紀錄、範本建議、日誌豁免', ['進度異動紀錄', '範本建議', '日誌豁免'].every(n => A.T[n] && A.T[n][0].length > 0));
ok('不會刪除舊表（說明、案件選擇仍在）', A.T['說明'] && A.T['案件選擇']);
const B = makeSS(false); boot(B.ss).fixSchema();
ok('再執行一次 fixSchema：不重複加欄', (() => { const w = JSON.stringify(B.T); boot(B.ss).fixSchema(); return JSON.stringify(B.T) === w; })());
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' PASS');
process.exit(R.every(Boolean) ? 0 : 1);
