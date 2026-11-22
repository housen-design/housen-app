/**
 * 浩森設計工作管理系統｜Google 獨立測試環境（假資料）
 * 這個 Apps Script 專案與正式系統完全分開：自己的試算表、自己的雲端資料夾、自己的登入金鑰。
 *
 * 使用方式（只做一次）：
 *   1. 執行 setupTestEnv：在「我的雲端硬碟」建立「浩森系統_測試環境（假資料）」資料夾、測試試算表，並放入假案件與假照片。
 *   2. 部署為網頁應用程式（執行身分：我；存取權：所有人），把網址填到測試網站的 config.js。
 * 重來一次：執行 resetTestEnv 會把測試資料夾移到垃圾桶並清掉設定，再重新執行 setupTestEnv。
 * 這裡的任何函式都不會讀寫正式試算表。
 */
const TEST_DATA = /*__TEST_DATA__*/null;
const TEST_ROOT_NAME = '浩森系統_測試環境（假資料）';

function setupTestEnv() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TEST_SS_ID')) throw new Error('測試環境已經建立過了：' + props.getProperty('TEST_SS_ID') + '。要重來請先執行 resetTestEnv');
  if (SS_ID !== 'TEST_NOT_SET') throw new Error('安全檢查：試算表設定不是測試狀態，停止');
  const root = DriveApp.createFolder(TEST_ROOT_NAME);
  const ss = SpreadsheetApp.create('浩森系統_測試資料（假資料）');
  DriveApp.getFileById(ss.getId()).moveTo(root);
  const first = ss.getSheets()[0];
  Object.keys(TEST_DATA.T).forEach(name => {
    const rows = TEST_DATA.T[name], w = rows[0].length;
    const sh = ss.insertSheet(name);
    const vals = rows.map(r => { const o = r.slice(0, w); while (o.length < w) o.push(''); return o.map(v => v == null ? '' : String(v)); });
    const rg = sh.getRange(1, 1, vals.length, w);
    rg.setNumberFormat('@');   // 一律存成文字，日期不會被自動轉格式
    rg.setValues(vals);
    sh.setFrozenRows(1);
  });
  ss.deleteSheet(first);
  // 假照片、簽名：依原本的資料夾放好
  const dirs = {};
  const dirOf = path => {
    if (!path) return root;
    if (dirs[path]) return dirs[path];
    let f = root;
    path.split('/').forEach(n => { const it = f.getFoldersByName(n); f = it.hasNext() ? it.next() : f.createFolder(n); });
    return (dirs[path] = f);
  };
  TEST_DATA.imgs.forEach(x => dirOf(x.dir).createFile(Utilities.newBlob(Utilities.base64Decode(x.b64), x.type, x.name)));
  props.setProperty('TEST_SS_ID', ss.getId());
  props.setProperty('TEST_ROOT_ID', root.getId());
  Logger.log('完成：測試資料夾 ' + root.getUrl() + '\n測試試算表 ' + ss.getUrl());
  return { folder: root.getUrl(), sheet: ss.getUrl() };
}

/** 在測試環境產生幾份文件 PDF（會議記錄、客戶確認單、週報），讓「文件」頁有 Google 產生的樣本 */
function makeSampleDocs() {
  if (SS_ID === 'TEST_NOT_SET') throw new Error('請先執行 setupTestEnv');
  const boss = 'pthz@housenaid.com';
  const meet = readTable_('會議').find(m => m['案件ID'] === 'C1');
  const ci = readTable_('客戶指示').find(x => x['案件ID'] === 'C1' && x['確認狀態'] === '已確認');
  const out = [];
  if (meet) out.push(run_(boss, 'clientPdf', { meetingId: meet['會議ID'] }).name);
  if (ci) out.push(run_(boss, 'clientPdf', { insId: ci['指示ID'] }).name);
  out.push(run_(boss, 'reportPdf', { caseId: 'C1', kind: 'week', from: '2026/11/10', to: '2026/11/16' }).name);
  Logger.log(out.join('\n'));
  return out;
}

/** 重來：把整個測試資料夾移到垃圾桶（只動測試資料夾），清掉設定 */
function resetTestEnv() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('TEST_ROOT_ID');
  if (id) { const f = DriveApp.getFolderById(id); if (f.getName() !== TEST_ROOT_NAME) throw new Error('安全檢查：資料夾名稱不符，停止'); f.setTrashed(true); }
  props.deleteProperty('TEST_SS_ID'); props.deleteProperty('TEST_ROOT_ID');
  Logger.log('已清除測試環境設定' + (id ? '，測試資料夾已移到垃圾桶' : ''));
}
