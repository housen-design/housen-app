// 在電腦上模擬：建立測試環境、清舊設定、唯讀盤點、真實環境用的拒絕測試與完整流程（假的 Google 服務）
// 用法：node tests/google-env/sim_setup.js（先執行 make_testenv.js 產生 out/）
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'out');
const src = ['TestShim.gs', 'TestEnv.gs', 'TestCode.gs'].map(f => fs.readFileSync(path.join(OUT, f), 'utf8')).join('\n');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + String(i).slice(0, 110) : '')); };
const M = require('./gmock')(src);
const { G, files, props, snapProd, prod0 } = M;
// 部署後的網址：模擬「對自己的測試網址送 HTTP 要求」＝開一個新的執行跑 doPost
const URL = 'https://script.google.com/macros/s/TEST/exec';
const logs = [];
G.Logger = { log: m => logs.push(String(m)) };
G.ScriptApp.getService = () => ({ getUrl: () => URL });
const fetch0 = G.UrlFetchApp.fetch;
G.UrlFetchApp.fetch = (u, o) => {
  if (u === URL) { const out = M.boot().doPost({ postData: { contents: o.payload } }); return { getContentText: () => JSON.stringify(out), getResponseCode: () => 200 }; }
  return fetch0(u, o);
};
G.UrlFetchApp.fetchAll = reqs => reqs.map(q => G.UrlFetchApp.fetch(q.url, q));
const boot = () => { const m = {}; new Function(...Object.keys(G), 'exp', src + ';Object.assign(exp,{setupTestEnv,resetTestEnv,checkIsolation,clearOldPropsOnly,inspectVisibleFilesReadOnly,setWebAppUrl,liveRejectTests,runFlowTest});')(...Object.values(G), m); return m; };

// 舊版只留下兩個設定：clearOldPropsOnly 只清這兩個，不碰檔案
props.TEST_ROOT_ID = 'OLD_ROOT'; props.TEST_SS_ID = 'OLD_SS';
const nFiles = Object.keys(files).length;
boot().clearOldPropsOnly();
ok('只清舊設定：兩個舊編號清掉、檔案一個都沒動', !props.TEST_ROOT_ID && !props.TEST_SS_ID && Object.keys(files).length === nFiles);
boot().setupTestEnv();
ok('建立測試環境：根資料夾、標記檔、試算表、設定都在', props.TEST_ROOT_ID && props.TEST_MARK_ID && props.TEST_MARK_TOKEN && props.TEST_SS_ID);
const root = props.TEST_ROOT_ID;
const under = id => { let p = id; for (let i = 0; i < 8 && p; i++) { if (p === root) return true; p = (files[p] || {}).parents && files[p].parents[0]; } return false; };
ok('所有新檔案都在測試根資料夾底下', Object.values(files).filter(f => f.app && f.id !== root).every(f => under(f.id)));
ok('試算表名稱與資料夾名稱帶 1123', /_1123（假資料）$/.test(files[root].name) && /_1123（假資料）$/.test(files[props.TEST_SS_ID].name));
let e = null; try { boot().setupTestEnv(); } catch (x) { e = x.message; }
ok('已經建立過再執行 → 拒絕，不會再建一份', /已經建立過/.test(e || ''));
e = null; try { boot().clearOldPropsOnly(); } catch (x) { e = x.message; }
ok('新版環境存在時 clearOldPropsOnly 拒絕', /新版測試環境/.test(e || ''));
logs.length = 0; boot().inspectVisibleFilesReadOnly();
ok('唯讀盤點：全部列在「新測試根資料夾」', logs.some(l => /^新測試根資料夾/.test(l)) && !logs.some(l => /^其他/.test(l)), logs[0]);
boot().setWebAppUrl();
ok('記下測試網址', props.TEST_WEBAPP_URL === URL);
logs.length = 0;
const rej = boot().liveRejectTests();
ok('拒絕測試（模擬）全部通過', rej, logs.filter(l => /^FAIL/.test(l)).join(' / ') || logs.slice(-1)[0]);
logs.length = 0;
const flow = boot().runFlowTest();
ok('完整流程（模擬）全部通過', flow, logs.filter(l => /^FAIL/.test(l)).join(' / ') || logs.slice(-1)[0]);
ok('全部過程正式資料沒被動到', snapProd() === prod0);
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' PASS');
process.exit(R.every(Boolean) ? 0 : 1);
