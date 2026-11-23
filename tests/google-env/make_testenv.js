// 產生 Google 獨立測試環境的 Apps Script 檔：TestCode.gs（後端，改連測試試算表）＋ TestEnv.gs（建立測試試算表與假資料）
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const [,, codePath = path.join(ROOT, 'backend', 'Code.gs'), seedPath = path.join(ROOT, 'tests', 'out', 'demo-seed.json'), outDir = path.join(__dirname, 'out')] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.dirname(seedPath), { recursive: true });
if (!fs.existsSync(seedPath)) require('child_process').execFileSync('node', [path.join(ROOT, 'tests', 'demo', 'seed.js'), codePath, seedPath]);
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const T = seed.T, files = seed.files;
// 1) 後端：同一份程式，改成透過「隔離層」存取（只能碰測試試算表與測試資料夾）
let code = fs.readFileSync(codePath, 'utf8');
const rep = (from, to, n) => { const c = code.split(from).length - 1; if (c !== n) throw new Error('預期 ' + n + ' 處，實際 ' + c + '：' + from); code = code.split(from).join(to); };
rep("const SS_ID = '1Trazrz1jfOxTaPFA43hb9YFubU5uSaGUZAnD4sWXrCw';", "const SS_ID = PropertiesService.getScriptProperties().getProperty('TEST_SS_ID') || 'TEST_NOT_SET';   // ★ 測試環境：只連測試試算表", 1);
rep('SpreadsheetApp.openById(SS_ID)', 'TSheets.openById(SS_ID)', 1);
rep('SpreadsheetApp.flush()', 'TSheets.flush()', 2);
rep('DriveApp.getFileById(SS_ID).getParents().next()', 'testRoot_()', 2);
// 案件資料夾：網址一定要在測試根資料夾底下，否則拒絕（不默默改用預設資料夾）
rep("  if (m) { try { return DriveApp.getFolderById(m[1]); } catch (e) { } }", "  if (m) return TDrive.getFolderById(m[1]);   // ★ 測試環境：不在測試資料夾底下就拒絕", 1);
rep("    try { patch['Drive資料夾'] = DriveApp.getFolderById(m[1]).getUrl(); }\n    catch (e) { throw new Error('打不開這個資料夾：請確認網址正確，且 Boss 的帳號有權限'); }",
    "    if (!TDrive.inRoot(m[1])) throw new Error('測試環境只能使用測試資料夾，這個資料夾不接受');\n    patch['Drive資料夾'] = TDrive.getFolderById(m[1]).getUrl();", 1);
rep('DriveApp.', 'TDrive.', 4);
if (/SpreadsheetApp|DriveApp/.test(code)) throw new Error('還有沒換掉的 SpreadsheetApp／DriveApp');
if (code.includes('1Trazrz1jfOxTaPFA43hb9YFubU5uSaGUZAnD4sWXrCw')) throw new Error('程式裡還有正式試算表 ID');
fs.writeFileSync(outDir + '/TestCode.gs', code);
fs.writeFileSync(outDir + '/TestShim.gs', fs.readFileSync(__dirname + '/TestShim.template.gs', 'utf8'));
fs.writeFileSync(outDir + '/appsscript.json', JSON.stringify({
  timeZone: 'Asia/Taipei', runtimeVersion: 'V8', exceptionLogging: 'STACKDRIVER',
  dependencies: { enabledAdvancedServices: [{ userSymbol: 'Drive', serviceId: 'drive', version: 'v3' }, { userSymbol: 'Sheets', serviceId: 'sheets', version: 'v4' }] },
  oauthScopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/script.external_request', 'https://www.googleapis.com/auth/userinfo.email'],
  webapp: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' }
}, null, 2));
// 2) 假資料：Boss 的信箱在建立時換成「執行的人」的帳號（才能登入）；其他人維持假信箱
const P = T['人員'], pe = P[0].indexOf('Email');
P.slice(1).forEach(r => { if (r[0] === 'P01') r[pe] = '__OWNER__'; else r[pe] = r[pe].replace('@demo', '@test.invalid'); });
// 試玩版的 PDF 與文件都是瀏覽器裡的假檔：清掉，讓 Google 重新產生
const L = T['工程日誌'], lh = L[0];
L.slice(1).forEach(r => ['PDF檔ID', 'PDF時間', 'PDF錯誤'].forEach(c => { const i = lh.indexOf(c); if (i >= 0) r[i] = ''; }));
T['文件紀錄'] = [T['文件紀錄'][0]];
const C = T['案件'], cf = C[0].indexOf('Drive資料夾'); if (cf >= 0) C.slice(1).forEach(r => r[cf] = '');
const M = T['會議'], mp = M[0].indexOf('PDF時間'); if (mp >= 0) M.slice(1).forEach(r => r[mp] = '');
// 圖片（照片、簽名）：保留原本的資料夾與檔名，讓紀錄裡的路徑對得上
const imgs = Object.keys(files).filter(k => !files[k].html && /^image\//.test(files[k].type || 'image/jpeg') && !files[k].trashed)
  .map(k => ({ dir: String(files[k].dir || 'ROOT').replace(/^ROOT\/?/, ''), name: files[k].name, type: files[k].type || 'image/jpeg', b64: Buffer.from(files[k].content, 'latin1').toString('base64') }));
const data = JSON.stringify({ T, imgs });
const env = fs.readFileSync(__dirname + '/TestEnv.template.gs', 'utf8').replace('/*__TEST_DATA__*/null', data);
fs.writeFileSync(outDir + '/TestEnv.gs', env);
console.log('TestCode.gs', code.length, 'TestShim.gs ok', 'TestEnv.gs', env.length, 'images', imgs.length, imgs.map(x => x.dir).filter((v, i, a) => a.indexOf(v) === i));
