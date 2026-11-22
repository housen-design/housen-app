// 產生 Google 獨立測試環境的 Apps Script 檔：TestCode.gs（後端，改連測試試算表）＋ TestEnv.gs（建立測試試算表與假資料）
const fs = require('fs');
const [,, codePath, seedPath, outDir] = process.argv;
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const T = seed.T, files = seed.files;
// 1) 後端：同一份程式，只把試算表改成「測試環境」那一份
let code = fs.readFileSync(codePath, 'utf8');
const a = "const SS_ID = '1Trazrz1jfOxTaPFA43hb9YFubU5uSaGUZAnD4sWXrCw';";
if (!code.includes(a)) throw new Error('SS_ID line not found');
code = code.replace(a, "const SS_ID = PropertiesService.getScriptProperties().getProperty('TEST_SS_ID') || 'TEST_NOT_SET';   // ★ 測試環境：只連測試試算表");
fs.writeFileSync(outDir + '/TestCode.gs', code);
// 2) 假資料：Boss 的帳號換成真的（才能登入）；其他人維持假信箱
const P = T['人員'], pe = P[0].indexOf('Email');
P.slice(1).forEach(r => { if (r[0] === 'P01') r[pe] = 'pthz@housenaid.com'; else r[pe] = r[pe].replace('@demo', '@test.invalid'); });
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
console.log('TestCode.gs', code.length, 'TestEnv.gs', env.length, 'images', imgs.length, imgs.map(x => x.dir).filter((v, i, a) => a.indexOf(v) === i));
