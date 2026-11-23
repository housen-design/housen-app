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
