/**
 * 浩森設計工作管理系統｜後端 v4.4（統計、結案唯讀、保固報修；日誌漏填追蹤；文件頁：週報、工程履歷；查驗紀錄、SOP、里程碑；客戶頁；現場總覽與指示追蹤；進度計畫；案件主檔修改；日誌簽核與 PDF；分享／下載分開記錄、唯讀查看 PDF）
 * 資料庫：Google Sheet「浩森設計工作管理系統_資料庫」（與 AppSheet 共用）
 * 所有前端呼叫都走 api(action, payload)，之後改成 PWA 時只需換「身分驗證」這一層。
 * 欄位一律用「表頭名稱」對應，不依賴欄位順序。
 */

const SS_ID = '1Trazrz1jfOxTaPFA43hb9YFubU5uSaGUZAnD4sWXrCw';
const PHOTO_DIR = '日誌照片_Images';
const CONFIRM_DIR = '客戶確認_Images';  // 客戶簽名、LINE 回覆截圖
const CASE_ROOT = '案件資料夾';        // 案件沒有指定雲端資料夾時，自動建在這裡
const LOG_PDF_DIR = '工程日誌';        // 每個案件資料夾裡放日誌 PDF 的子資料夾
const APP_URL = 'https://housen-design.github.io/housen-app/';  // 網站網址（PDF 取 Logo 用）

/* 日誌狀態與指示狀態（改名時只改這裡） */
const LS = { DRAFT: '草稿', DESIGNER: '待設計師確認', PENDING: '待簽核', SIGNED: '已簽核' };
const IS = { TODO: '待處理', REPLIED: '已回報', CLOSED: '已結案' };
function insStatus_(s) { return s === '處理中' ? IS.TODO : s === '待確認' ? IS.REPLIED : (s || IS.TODO); }
const LEADER_ROLES = ['Boss', '主管'];   // 可以下指示、指派待辦給別人、管理工種
const TEST_MODE = true;                 // 測試期：Boss 可切換看員工畫面；正式上線改成 false

/* ========== 入口 ========== */
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('浩森設計工作管理系統')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/* ========== PWA 入口（app.housenaid.com 透過 POST 呼叫） ========== */
const CLIENT_ID = '473235039295-dnrf8007tmjrnt93m09e4qli00qa473l.apps.googleusercontent.com'; // Google 登入用戶端 ID
const DOMAIN = 'housenaid.com';  // 只允許公司網域帳號
const SESSION_DAYS = 30;         // 登入有效天數

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    if (req.action === 'login') out = { ok: true, data: login_(req.idToken) };
    else out = { ok: true, data: run_(session_(req.token), req.action, req.payload || {}) };
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err), auth: !!(err && err.auth) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function login_(idToken) {
  if (!CLIENT_ID) throw authErr_('系統尚未設定 Google 登入');
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken || ''), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw authErr_('Google 登入驗證失敗，請再試一次');
  const t = JSON.parse(r.getContentText());
  if (t.aud !== CLIENT_ID) throw authErr_('登入來源不符');
  if (String(t.email_verified) !== 'true') throw authErr_('帳號尚未驗證');
  if ((t.hd || '') !== DOMAIN) throw authErr_('請使用公司帳號（@' + DOMAIN + '）登入');
  const me = user_(t.email);
  return { token: sign_(t.email), name: me.name, email: me.email, picture: t.picture || '' };
}

function secret_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('SESSION_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SESSION_SECRET', s); }
  return s;
}
function mac_(s) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, secret_())); }
function sign_(email) {
  const body = Utilities.base64EncodeWebSafe(JSON.stringify({ e: String(email).toLowerCase(), x: Date.now() + SESSION_DAYS * 864e5 }));
  return body + '.' + mac_(body);
}
function session_(tok) {
  const parts = String(tok || '').split('.');
  if (parts.length !== 2 || mac_(parts[0]) !== parts[1]) throw authErr_('請重新登入');
  const d = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  if (Date.now() > d.x) throw authErr_('登入已過期，請重新登入');
  return d.e;
}
function authErr_(m) { const e = new Error(m); e.auth = true; return e; }

/** 舊版網頁（Apps Script 直接開啟）入口 */
function api(action, payload) {
  return run_(Session.getActiveUser().getEmail(), action, payload);
}

/** 共用：依登入者 email 執行動作。payload.as = 測試模式下 Boss 預覽員工畫面（唯讀） */
function run_(email, action, payload) {
  payload = payload || {};
  let real;
  try { real = user_(email); } catch (e) { throw authErr_(e.message); }
  let me = real;
  if (payload.as && payload.as !== real.id) {
    if (real.role !== 'Boss' || !TEST_MODE) throw new Error('沒有預覽權限');
    me = Object.assign(userById_(payload.as), { preview: true });
  }
  const READ = { home: getHome_, case: getCase_, thumbs: getThumbs_, pdfView: pdfView_, stats: stats_ };   // 只讀，預覽模式也可用
  const SLOW = { pdfLog: pdfLog_, clientPdf: clientPdf_, reportPdf: reportPdf_ };   // 產生 PDF 較久，不鎖住其他人
  const WRITE = {
    saveLog: saveLog_, updateLog: updateLog_, deletePhoto: deletePhoto_,
    submitLog: submitLog_, confirmLog: confirmLog_, signLog: signLog_, returnLog: returnLog_,
    escalateLog: escalateLog_, seenLog: seenLog_, shareLog: shareLog_,
    saveIns: saveIns_, actIns: actIns_, saveTodo: saveTodo_, setTodo: setTodo_,
    saveCase: saveCase_, saveCaseInfo: saveCaseInfo_, setStage: setStage_, saveTrade: saveTrade_,
    savePlanItem: savePlanItem_, cancelPlanItem: cancelPlanItem_, applyTemplate: applyTemplate_, lockPlan: lockPlan_,
    setActualStart: setActualStart_, setDone: setDone_,
    saveMeeting: saveMeeting_, reviewMeeting: reviewMeeting_, saveClientIns: saveClientIns_, confirmClientIns: confirmClientIns_,
    markNoWork: markNoWork_, saveCheck: saveCheck_, saveRepair: saveRepair_, applySop: applySop_, setSop: setSop_, applyMilestones: applyMilestones_, saveMilestone: saveMilestone_, setMilestone: setMilestone_
  };
  if (READ[action]) return READ[action](me, payload);
  if (SLOW[action]) { if (me.preview) throw new Error('預覽模式只能看'); return SLOW[action](me, payload); }
  if (WRITE[action]) {
    if (me.preview) throw new Error('預覽模式只能看，不能存檔');
    closedGuard_(action, payload);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try { return WRITE[action](me, payload); } finally { lock.releaseLock(); }
  }
  throw new Error('未知的動作：' + action);
}

/* ========== 共用工具 ========== */
let _ss;
function ss_() { return _ss || (_ss = SpreadsheetApp.openById(SS_ID)); }

function readTable_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('找不到資料表：' + name);
  const v = sh.getDataRange().getDisplayValues();
  const head = v.shift() || [];
  return v.filter(r => r.some(c => c !== '')).map(r => {
    const o = {};
    head.forEach((h, i) => { if (h) o[h] = r[i]; });
    return o;
  });
}

function tryTable_(name) { return ss_().getSheetByName(name) ? readTable_(name) : []; }

/** 發布前在編輯器執行：檢查新版需要的資料表與欄位是否都已建立 */
function checkSchema() {
  const need = {
    '工程日誌': ['日誌狀態', '簽核人', '簽核期限', '簽核內容', 'PDF檔ID', '分享次數', '下載次數', '最後下載人', '最後下載時間'],
    '日誌照片': ['刪除時間', '刪除人'],
    '案件': ['最後修改時間', '最後修改人', '進度定案時間', '進度定案人'],
    '進度計畫': ['工序ID', '案件ID', '順序', '工種', '工序名稱', '原計畫開始', '原計畫完成', '目前計畫開始', '目前計畫完成', '實際開始', '實際完成', '查驗點', '改期原因',
      '狀態', '實際開始確認人', '實際完成確認人', '範本工序ID', '最後修改人', '最後修改時間'],
    '進度異動紀錄': ['紀錄ID', '案件ID', '工序ID', '項目', '原值', '新值', '原因', '修改人', '時間']
  };
  const miss = [];
  Object.keys(need).forEach(n => {
    const sh = ss_().getSheetByName(n);
    if (!sh) { miss.push('缺資料表：' + n); return; }
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    need[n].forEach(h => { if (head.indexOf(h) < 0) miss.push(n + ' 缺欄位：' + h); });
  });
  Logger.log(miss.length ? miss.join('\n') : '欄位齊全，可以部署');
  return miss;
}

function appendRow_(name, obj) {
  const sh = ss_().getSheetByName(name);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(head.map(h => (obj[h] === undefined || obj[h] === null) ? '' : obj[h]));
}

function findRow_(name, keyCol, key) {
  const sh = ss_().getSheetByName(name);
  const v = sh.getDataRange().getDisplayValues();
  const head = v[0], k = head.indexOf(keyCol);
  for (let r = 1; r < v.length; r++) if (String(v[r][k]) === String(key)) return { sh, head, row: r + 1, vals: v[r] };
  throw new Error('找不到資料：' + name + ' ' + key);
}

function updateRow_(name, keyCol, key, patch) {
  const f = findRow_(name, keyCol, key);
  Object.keys(patch).forEach(col => {
    const c = f.head.indexOf(col);
    if (c >= 0) f.sh.getRange(f.row, c + 1).setValue(patch[col]);
  });
}

function rowObj_(f) { const o = {}; f.head.forEach((h, i) => { if (h) o[h] = f.vals[i]; }); return o; }
function getLog_(id) { return rowObj_(findRow_('工程日誌', '日誌ID', id)); }
function caseRow_(id) { return readTable_('案件').find(c => c['案件ID'] === id) || null; }
function h_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function uid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 8); }
function fmt_(d, p) { return Utilities.formatDate(d, 'Asia/Taipei', p); }
function today_() { return fmt_(new Date(), 'yyyy/MM/dd'); }
function now_() { return fmt_(new Date(), 'yyyy/MM/dd HH:mm:ss'); }
function ymd_(s) { return s ? String(s).replace(/-/g, '/') : ''; }

function person_(p) {
  return {
    id: p['人員ID'], name: p['姓名'], email: (p['Email'] || '').toLowerCase(), title: p['職稱'], role: p['系統角色'],
    leader: LEADER_ROLES.indexOf(p['系統角色']) >= 0, seeMoney: p['可看金額'] === 'Y', seePerf: p['可看績效'] === 'Y',
    active: p['在職'] !== 'N'
  };
}
let _people;
function people_() { return _people || (_people = readTable_('人員').map(person_)); }
function user_(email) {
  email = String(email || '').toLowerCase();
  const p = people_().find(x => x.email === email && x.active);
  if (!p) throw new Error('你的帳號（' + (email || '未登入') + '）不在「人員」名單中，請聯絡管理者。');
  return Object.assign({}, p);
}
function userById_(id) {
  const p = people_().find(x => x.id === id);
  if (!p) throw new Error('找不到人員');
  return Object.assign({}, p);
}
function pname_(id) { return (people_().find(p => p.id === id) || {}).name || id || ''; }

/* ========== 簽核規則 ========== */

/** 依「日誌填寫人」決定簽核人：一般員工→主管（蘋芳）；主管填寫→Boss；Boss 填寫→自己 */
function signerFor_(writerId) {
  const ppl = people_().filter(p => p.active), w = ppl.find(p => p.id === writerId) || {};
  const boss = (ppl.find(p => p.role === 'Boss') || {}).id || '';
  if (w.role === 'Boss') return w.id;
  if (w.role === '主管') return boss;
  const sup = ppl.find(p => p.role === '主管');
  return sup ? sup.id : boss;
}
function bossId_() { return (people_().find(p => p.role === 'Boss' && p.active) || {}).id || ''; }

/** 簽核期限：下一個工作天中午 12:00（週六日不計） */
function deadline_() {
  let t = Date.now();
  do { t += 864e5; } while (['6', '7'].indexOf(fmt_(new Date(t), 'u')) >= 0);
  return fmt_(new Date(t), 'yyyy/MM/dd') + ' 12:00';
}
function overdue_(dl) { return !!dl && fmt_(new Date(), 'yyyy/MM/dd HH:mm') > String(dl).slice(0, 16); }

function logStatus_(l) { return l['日誌狀態'] || LS.PENDING; }
function signerOf_(l) { return l['簽核人'] || signerFor_(l['填寫人']); }
function canSign_(me, l) { return me.id === signerOf_(l) || me.role === 'Boss'; }
function canShare_(me, c) { return me.leader || (c && c['負責設計師'] === me.id); }
function parseSnap_(l) { try { return l['簽核內容'] ? JSON.parse(l['簽核內容']) : null; } catch (e) { return null; } }

function activePhotos_(logId, all) {
  return (all || readTable_('日誌照片')).filter(p => p['日誌ID'] === logId && !p['刪除時間']);
}
function snapshot_(l, photos) {
  return { date: l['日期'], trades: l['工種'], text: l['今日狀況'], issue: l['發現問題'], photos: photos.map(p => ({ id: p['照片ID'], note: p['說明'] || '' })) };
}

/** 進入待簽核 */
function pendingPatch_(writerId) {
  return { '日誌狀態': LS.PENDING, '簽核人': signerFor_(writerId), '簽核期限': deadline_(), '轉Boss確認': '' };
}
/** 送出：填寫人就是負責設計師（或 Boss、案件未指定設計師）→ 直接待簽核；否則先給設計師確認 */
function submitPatch_(writerId, c) {
  const designer = c ? c['負責設計師'] : '';
  const w = people_().find(p => p.id === writerId) || {};
  const p = { '送出時間': now_(), '退回原因': '' };
  if (!designer || designer === writerId || w.role === 'Boss') Object.assign(p, pendingPatch_(writerId));
  else p['日誌狀態'] = LS.DESIGNER;
  return p;
}
/** 已簽核的日誌被重大修改 → 回到待簽核，主管只看差異 */
function resignPatch_(l) { return Object.assign(pendingPatch_(l['填寫人']), { '修改待簽': 'Y', '小修待看': '', '退回原因': '' }); }

/* ========== 讀取 ========== */

function getHome_(me) {
  const people = people_().filter(p => p.active).map(x => ({ id: x.id, name: x.name, role: x.role, leader: x.leader }));
  const trades = readTable_('工種清單').filter(t => t['啟用'] !== 'N')
    .sort((a, b) => (+a['排序'] || 0) - (+b['排序'] || 0))
    .map(t => ({ name: t['工種'], color: t['色碼'] }));
  const logs = readTable_('工程日誌');
  const ins = readTable_('主管指示').filter(i => i['指示內容']);
  ins.forEach(i => i['狀態'] = insStatus_(i['狀態']));
  const todos = readTable_('待辦');
  const caseRows = readTable_('案件');
  const cases = caseRows.map(c => {
    const cl = logs.filter(l => l['案件ID'] === c['案件ID']);
    const dates = cl.map(l => l['日期']).sort();
    const acts = cl.map(l => [l['建立時間'], l['最後修改時間']].sort().pop() || '').sort();
    return {
      id: c['案件ID'], name: c['案件名稱'], client: c['客戶姓名'], address: c['地址'],
      stage: c['階段'], status: c['狀態'], designer: c['負責設計師'],
      lastLog: dates.length ? dates[dates.length - 1] : '', act: acts.length ? acts[acts.length - 1] : '',
      openIns: ins.filter(i => i['案件ID'] === c['案件ID'] && i['狀態'] !== IS.CLOSED).length
    };
  });
  const cname = id => (cases.find(c => c.id === id) || {}).name || '';
  const items = [];
  // 待辦事項
  todos.filter(t => t['負責人'] === me.id).forEach(t => items.push({
    kind: 'todo', id: t['待辦ID'], caseId: t['案件ID'], caseName: cname(t['案件ID']), text: t['內容'],
    due: t['期限'], done: t['狀態'] === '已完成', doneAt: t['完成時間'], from: t['建立人'], created: t['建立時間']
  }));
  // 指示：交給我的、等我確認的
  ins.filter(i => (i['負責人'] === me.id && i['狀態'] !== IS.CLOSED) || (i['下指示人'] === me.id && i['狀態'] === IS.REPLIED))
    .forEach(i => items.push({
      kind: 'ins', id: i['指示ID'], caseId: i['案件ID'], caseName: cname(i['案件ID']), text: i['指示內容'],
      due: i['期限'], status: i['狀態'], to: i['負責人'], from: i['下指示人'], created: i['建立時間'],
      mine: i['負責人'] === me.id
    }));
  // 日誌：要我簽核、確認、傳送、重寫的
  logs.forEach(l => {
    const st = logStatus_(l), cid = l['案件ID'], c = caseRows.find(x => x['案件ID'] === cid);
    const designer = c ? c['負責設計師'] : '', signer = signerOf_(l);
    const base = { kind: 'log', id: l['日誌ID'], caseId: cid, caseName: cname(cid), date: l['日期'], by: l['填寫人'], created: l['送出時間'] || l['建立時間'] };
    const add = (task, more) => items.push(Object.assign({ status: task }, base, more || {}));
    if (st === LS.PENDING && signer === me.id) add(l['修改待簽'] === 'Y' ? 'resign' : 'sign', { due: l['簽核期限'], overdue: overdue_(l['簽核期限']), escal: l['轉Boss確認'] === 'Y' });
    else if (st === LS.PENDING && me.role === 'Boss' && overdue_(l['簽核期限'])) add('overdue', { due: l['簽核期限'], overdue: true, signer: signer });
    if (st === LS.DESIGNER && designer === me.id) add('confirm');
    if (st === LS.DRAFT && l['填寫人'] === me.id) add(l['退回原因'] ? 'returned' : 'draft', { note: l['退回原因'] });
    if (st === LS.SIGNED && designer === me.id && !(+l['分享次數'])) add('send');
    if (st === LS.SIGNED && l['小修待看'] === 'Y' && signer === me.id) add('minor');
  });
  // 日誌漏填：提醒負責設計師（最近 5 天）
  const rule = logRule_(), exempt = tryTable_('日誌豁免');
  const missMap = {};
  caseRows.forEach(c => { const m = missingDays_(c, logs, exempt, rule); missMap[c['案件ID']] = m;
    if (c['負責設計師'] === me.id) m.slice(0, 5).forEach(dd => items.push({ kind: 'miss', id: c['案件ID'] + ':' + dd, caseId: c['案件ID'], caseName: c['案件名稱'], date: dd, status: 'miss', created: dd })); });
  items.forEach(i => { if (i.kind === 'ins' && i.status === IS.TODO && !i.due && i.created) i.staleDays = Math.floor((Date.now() - new Date(String(i.created).replace(/\//g, '-').replace(' ', 'T') + '+08:00').getTime()) / 864e5); });
  // 保固報修：交給我、還沒完成的
  tryTable_('保固報修').filter(x => x['負責人'] === me.id && x['狀態'] !== '已完成').forEach(x => items.push({
    kind: 'wr', id: x['報修ID'], caseId: x['案件ID'], caseName: cname(x['案件ID']), text: x['內容'], status: x['狀態'], created: x['報修日期'], due: ''
  }));
  // 設計階段里程碑：交給我、未完成的（期限 7 天內或已逾期）
  const soon = fmt_(new Date(Date.now() + 7 * 864e5), 'yyyy/MM/dd');
  tryTable_('里程碑').filter(x => x['負責人'] === me.id && x['狀態'] !== '已完成' && x['目前期限'] && x['目前期限'] <= soon).forEach(x => items.push({
    kind: 'ms', id: x['任務ID'], caseId: x['案件ID'], caseName: cname(x['案件ID']), text: x['名稱'], due: x['目前期限'], status: '未完成', created: x['原定日期']
  }));
  // 工序超過計畫日期（只提醒負責設計師，不需任何批准）
  const lateDays = +setting_('延誤警告門檻（天）', 1) || 0, lim = fmt_(new Date(Date.now() - lateDays * 864e5), 'yyyy/MM/dd');
  tryTable_('進度計畫').filter(r => r['狀態'] !== '取消').forEach(r => {
    const c = caseRows.find(x => x['案件ID'] === r['案件ID']);
    if (!c || c['負責設計師'] !== me.id) return;
    const lateEnd = r['目前計畫完成'] && r['目前計畫完成'] < lim && !r['實際完成'], lateStart = r['目前計畫開始'] && r['目前計畫開始'] < lim && !r['實際開始'];
    if (lateEnd || lateStart) items.push({ kind: 'plan', id: r['工序ID'], caseId: r['案件ID'], caseName: cname(r['案件ID']), text: r['工序名稱'],
      due: lateEnd ? r['目前計畫完成'] : r['目前計畫開始'], status: lateEnd ? '超過計畫完成日' : '超過計畫開始日', created: r['目前計畫開始'] });
  });
  // 主管的現場總覽：施工中與開案前案件的最新日誌、照片、問題、指示與進度差異（只讀、不設任何批准）
  let overview = [], tracking = [];
  if (me.leader) {
    const t = today_(), cut = fmt_(new Date(Date.now() - 14 * 864e5), 'yyyy/MM/dd');
    const photos = readTable_('日誌照片'), plan = tryTable_('進度計畫');
    overview = caseRows.filter(c => c['狀態'] !== '已結案' && c['狀態'] !== '未成交' && ['施工', '開案前'].indexOf(c['階段']) >= 0).map(c => {
      const cid = c['案件ID'];
      const cl = logs.filter(l => l['案件ID'] === cid).sort((a, b) => (b['日期'] + b['建立時間']).localeCompare(a['日期'] + a['建立時間']));
      const last = cl[0], issue = cl.find(l => l['發現問題'] && l['日期'] >= cut);
      const ci = ins.filter(i => i['案件ID'] === cid), pl = plan.filter(r => r['案件ID'] === cid && r['狀態'] !== '取消');
      const lp = last ? activePhotos_(last['日誌ID'], photos) : [];
      return {
        id: cid, name: c['案件名稱'], designer: c['負責設計師'], stage: c['階段'],
        last: last ? { id: last['日誌ID'], date: last['日期'], by: last['填寫人'], text: String(last['今日狀況'] || '').slice(0, 90), status: logStatus_(last), photos: lp.slice(0, 3).map(x => x['照片']), nPhotos: lp.length } : null,
        logs7: cl.filter(l => l['日期'] >= fmt_(new Date(Date.now() - 7 * 864e5), 'yyyy/MM/dd')).length,
        issue: issue ? { id: issue['日誌ID'], date: issue['日期'], text: String(issue['發現問題']).slice(0, 90) } : null,
        missing: (missMap[cid] || []).length,
        insOpen: ci.filter(i => i['狀態'] === IS.TODO).length,
        insLate: ci.filter(i => i['狀態'] === IS.TODO && i['期限'] && i['期限'] < t).length,
        insWait: ci.filter(i => i['狀態'] === IS.REPLIED).length,
        plan: pl.length ? {
          total: pl.length, done: pl.filter(r => r['實際完成']).length,
          lateEnd: pl.filter(r => r['目前計畫完成'] && r['目前計畫完成'] < t && !r['實際完成']).length,
          lateStart: pl.filter(r => r['目前計畫開始'] && r['目前計畫開始'] < t && !r['實際開始']).length
        } : null
      };
    });
    tracking = ins.filter(i => i['下指示人'] === me.id && i['狀態'] === IS.TODO).map(i => ({
      id: i['指示ID'], caseId: i['案件ID'], caseName: cname(i['案件ID']), text: i['指示內容'], to: i['負責人'], due: i['期限'],
      created: i['建立時間'], late: !!i['期限'] && i['期限'] < t
    })).sort((a, b) => a.created.localeCompare(b.created));
  }
  return { me, people, trades, cases, items, overview, tracking, rule: rule, today: today_(), now: fmt_(new Date(), 'yyyy/MM/dd HH:mm'), testMode: TEST_MODE };
}

function getCase_(me, p) {
  const c = readTable_('案件').find(x => x['案件ID'] === p.id);
  if (!c) throw new Error('找不到案件');
  if (!me.seeMoney) { delete c['設計費']; delete c['工程金額']; }
  const photos = readTable_('日誌照片').filter(x => x['案件ID'] === p.id);
  const ph = x => ({ id: x['照片ID'], path: x['照片'], note: x['說明'] || [x['空間'], x['位置']].filter(String).join('・') });
  const logs = readTable_('工程日誌').filter(l => l['案件ID'] === p.id).map(l => {
    const mine = photos.filter(x => x['日誌ID'] === l['日誌ID']);
    const resign = l['修改待簽'] === 'Y';
    return {
      id: l['日誌ID'], date: l['日期'], trades: (l['工種'] || '').split(/\s*,\s*/).filter(String),
      text: l['今日狀況'], issue: l['發現問題'], by: l['填寫人'], created: l['建立時間'],
      edited: l['最後修改時間'], edits: +l['修改次數'] || 0, editor: l['最後修改人'],
      photos: mine.filter(x => !x['刪除時間']).map(ph),
      gone: resign ? mine.filter(x => x['刪除時間']).map(ph) : [],
      status: logStatus_(l), submitted: l['送出時間'], signer: signerOf_(l), deadline: l['簽核期限'],
      overdue: logStatus_(l) === LS.PENDING && overdue_(l['簽核期限']), escal: l['轉Boss確認'] === 'Y',
      signedBy: l['簽核者'], signedAt: l['簽核時間'], resign: resign, snap: resign ? parseSnap_(l) : null,
      signedOnce: !!l['簽核內容'], minor: l['小修待看'] === 'Y', returnNote: l['退回原因'],
      pdfAt: l['PDF時間'], hasPdf: !!l['PDF檔ID'], revisedAt: l['修訂時間'], shares: +l['分享次數'] || 0, sharedBy: l['最後分享人'], sharedAt: l['最後分享時間'],
      downloads: +l['下載次數'] || 0, downloadedBy: l['最後下載人'], downloadedAt: l['最後下載時間']
    };
  }).sort((a, b) => (b.date + b.created).localeCompare(a.date + a.created));
  const ins = readTable_('主管指示').filter(i => i['案件ID'] === p.id && i['指示內容']).map(i => ({
    id: i['指示ID'], logId: i['日誌ID'], text: i['指示內容'], to: i['負責人'], due: i['期限'],
    status: insStatus_(i['狀態']), reply: i['回報內容'], returns: +i['退回次數'] || 0, from: i['下指示人'], created: i['建立時間']
  })).sort((a, b) => b.created.localeCompare(a.created));
  const todos = readTable_('待辦').filter(t => t['案件ID'] === p.id).map(t => ({
    id: t['待辦ID'], text: t['內容'], to: t['負責人'], due: t['期限'], done: t['狀態'] === '已完成', from: t['建立人']
  }));
  const plan = readTable_('進度計畫').filter(r => r['案件ID'] === p.id).map(r => ({
    id: r['工序ID'], order: +r['順序'] || 0, trade: r['工種'], name: r['工序名稱'],
    baseStart: r['原計畫開始'], baseEnd: r['原計畫完成'], start: r['目前計畫開始'], end: r['目前計畫完成'],
    actStart: r['實際開始'], actStartBy: r['實際開始確認人'], actEnd: r['實際完成'], actEndBy: r['實際完成確認人'],
    check: r['查驗點'], cancelled: r['狀態'] === '取消', tpl: r['範本工序ID']
  })).sort((a, b) => a.order - b.order);
  const planLog = tryTable_('進度異動紀錄').filter(r => r['案件ID'] === p.id).map(r => ({
    item: r['工序ID'], what: r['項目'], from: r['原值'], to: r['新值'], why: r['原因'], by: r['修改人'], at: r['時間']
  })).reverse();
  const meetings = tryTable_('會議').filter(m => m['案件ID'] === p.id).map(m => ({
    id: m['會議ID'], date: m['日期'], name: m['會議名稱'], attendees: m['出席人'], audio: m['錄音檔'], summary: m['AI摘要'],
    reviewedBy: m['核對人'], reviewedAt: m['核對時間'], by: m['記錄人'], pdfAt: m['PDF時間']
  })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const cins = tryTable_('客戶指示').filter(x => x['案件ID'] === p.id).map(x => ({
    id: x['指示ID'], meetingId: x['會議ID'], type: x['類型'], source: x['來源'], date: x['日期'], text: x['內容'],
    impact: x['影響費用或工期'] === 'Y', amount: x['追加減金額'], days: x['影響工期天數'], status: x['確認狀態'] || '待確認',
    method: x['確認方式'], sign: x['客戶簽名'], shot: x['確認截圖'], confirmedAt: x['確認時間'], note: x['確認備註'],
    by: x['記錄人'], created: x['建立時間'], locked: x['鎖定'] === 'Y'
  })).sort((a, b) => ((b.date || '') + b.created).localeCompare((a.date || '') + a.created));
  const checks = tryTable_('查驗紀錄').filter(x => x['案件ID'] === p.id).map(x => ({
    id: x['紀錄ID'], item: x['工序ID'], point: x['查驗點'], checkId: x['檢查ID'], label: x['檢查項目'], photo: x['照片'], done: x['完成'] === 'Y',
    status: x['狀態'], note: x['備註'], by: x['檢查人'], at: x['檢查時間']
  }));
  const checkTpl = tryTable_('範本_查驗清單').map(t => ({ id: t['檢查ID'], point: t['查驗點'], order: +t['順序'] || 0, label: t['檢查項目'], photo: t['需拍照'] === 'Y' }));
  const sop = tryTable_('案件SOP').filter(x => x['案件ID'] === p.id).map(x => ({ id: x['ID'], tpl: x['項目ID'], label: x['項目'], done: x['完成'] === 'Y', date: x['完成日'], by: x['完成人'], note: x['備註'], role: x['負責角色'], order: +x['順序'] || 0 }))
    .sort((a, b) => a.order - b.order);
  const ms = tryTable_('里程碑').filter(x => x['案件ID'] === p.id).map(x => ({
    id: x['任務ID'], stage: x['階段'], name: x['名稱'], owner: x['負責人'], base: x['原定日期'], due: x['目前期限'], done: x['完成日'],
    status: x['狀態'], returns: +x['退回次數'] || 0, why: x['改期原因'], note: x['備註'], order: +x['順序'] || 0
  })).sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || a.order - b.order);
  return { info: c, canEdit: canEditCase_(me, c), canPlan: canPlan_(me, c), logs, ins, todos, plan, planLog, meetings, cins, checks, checkTpl, sop, ms,
    settings: settings_(), closed: c['階段'] === '結案',
    repairs: tryTable_('保固報修').filter(x => x['案件ID'] === p.id).map(x => ({ id: x['報修ID'], date: x['報修日期'], text: x['內容'], owner: x['負責人'], status: x['狀態'], result: x['處理結果'], done: x['完成日'], by: x['記錄人'] }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    docs: tryTable_('文件紀錄').filter(x => x['案件ID'] === p.id).map(x => ({ id: x['文件ID'], date: x['日期'], name: x['文件名稱'], type: x['文件類型'], url: x['檔案連結'], by: x['產生人'], at: x['產生時間'] || x['日期'] }))
      .sort((a, b) => String(b.at).localeCompare(String(a.at))),
    planLocked: c['進度定案時間'] || '', planLockedBy: c['進度定案人'] || '' };
}

function getThumbs_(me, p) {
  const out = {};
  (p.paths || []).forEach(path => {
    try {
      const it = dirFor_(path).getFilesByName(String(path).split('/').pop());
      if (!it.hasNext()) return;
      const f = it.next(), blob = f.getThumbnail() || f.getBlob();
      out[path] = { src: 'data:image/jpeg;base64,' + Utilities.base64Encode(blob.getBytes()), url: f.getUrl() };
    } catch (e) { }
  });
  return out;
}

const _dirs = {};
/** 試算表所在資料夾下的子資料夾（沒有就建立），例如 日誌照片_Images、客戶確認_Images */
function subDir_(name) {
  if (_dirs[name]) return _dirs[name];
  const parent = DriveApp.getFileById(SS_ID).getParents().next();
  const it = parent.getFoldersByName(name);
  return (_dirs[name] = it.hasNext() ? it.next() : parent.createFolder(name));
}
function photoDir_() { return subDir_(PHOTO_DIR); }
function dirFor_(path) { const d = String(path).split('/')[0]; return d === CONFIRM_DIR ? subDir_(CONFIRM_DIR) : photoDir_(); }

/* ========== 寫入：日誌 ========== */

function savePhotos_(caseId, logId, photos) {
  if (!photos || !photos.length) return;
  const dir = photoDir_();
  photos.forEach(ph => {
    const pid = uid_();
    const name = pid + '.照片.' + fmt_(new Date(), 'HHmmss') + '.jpg';
    dir.createFile(Utilities.newBlob(Utilities.base64Decode(ph.data), 'image/jpeg', name));
    appendRow_('日誌照片', { '照片ID': pid, '日誌ID': logId, '案件ID': caseId, '照片': PHOTO_DIR + '/' + name, '說明': ph.note || '', '拍攝時間': now_() });
  });
}

/** 新增日誌。d.submit = true 時直接送出，否則存成草稿。建立時間之後不能改，用來判斷補登。 */
function saveLog_(me, d) {
  if (!d.caseId) throw new Error('缺少案件');
  const id = uid_();
  const row = {
    '日誌ID': id, '案件ID': d.caseId, '日期': ymd_(d.date) || today_(), '工種': (d.trades || []).join(' , '),
    '今日狀況': d.text || '', '發現問題': d.issue || '', '填寫人': me.id, '建立時間': now_(), '修改次數': 0,
    '日誌狀態': LS.DRAFT, '分享次數': 0
  };
  if (d.submit) Object.assign(row, submitPatch_(me.id, caseRow_(d.caseId)));
  appendRow_('工程日誌', row);
  savePhotos_(d.caseId, id, d.photos);
  return id;
}

/**
 * 修改日誌：每個人都能改。
 * 已簽核過的日誌：改到 日期／工種／施工內容／問題 → 回到待簽核（主管只看差異）；
 * 只新增照片 → 不必重簽，主管那邊出現「已修改」提示。
 */
function updateLog_(me, d) {
  const l = getLog_(d.id), st = logStatus_(l), snap = parseSnap_(l);
  const patch = {
    '日期': ymd_(d.date), '工種': (d.trades || []).join(' , '), '今日狀況': d.text || '', '發現問題': d.issue || '',
    '最後修改時間': now_(), '修改次數': (+l['修改次數'] || 0) + 1, '最後修改人': me.id
  };
  if (snap && st !== LS.DRAFT) {
    const major = snap.date !== patch['日期'] || snap.trades !== patch['工種'] || snap.text !== patch['今日狀況'] || snap.issue !== patch['發現問題'];
    if (major) Object.assign(patch, resignPatch_(l));
    else if (d.photos && d.photos.length && st === LS.SIGNED) { patch['小修待看'] = 'Y'; patch['修訂時間'] = now_(); }
  } else if (d.submit && st === LS.DRAFT) {
    Object.assign(patch, snap ? resignPatch_(l) : submitPatch_(l['填寫人'], caseRow_(l['案件ID'])));
  }
  updateRow_('工程日誌', '日誌ID', d.id, patch);
  savePhotos_(l['案件ID'], d.id, d.photos);
  return d.id;
}

/** 刪除照片：不真的刪檔，只標記刪除（可追溯）。已簽核內容裡的照片被刪 → 需重新簽核 */
function deletePhoto_(me, d) {
  const ph = rowObj_(findRow_('日誌照片', '照片ID', d.id));
  updateRow_('日誌照片', '照片ID', d.id, { '刪除時間': now_(), '刪除人': me.id });
  const l = getLog_(ph['日誌ID']), snap = parseSnap_(l);
  const patch = { '最後修改時間': now_(), '最後修改人': me.id, '修改次數': (+l['修改次數'] || 0) + 1 };
  if (snap && logStatus_(l) !== LS.DRAFT && (snap.photos || []).some(p => p.id === d.id)) Object.assign(patch, resignPatch_(l));
  updateRow_('工程日誌', '日誌ID', ph['日誌ID'], patch);
  return true;
}

/** 草稿送出 */
function submitLog_(me, d) {
  const l = getLog_(d.id);
  if (logStatus_(l) !== LS.DRAFT) throw new Error('這篇已經送出');
  if (l['填寫人'] !== me.id && !me.leader) throw new Error('只有填寫人可以送出');
  updateRow_('工程日誌', '日誌ID', d.id, parseSnap_(l) ? resignPatch_(l) : submitPatch_(l['填寫人'], caseRow_(l['案件ID'])));
  return true;
}

/** 負責設計師確認（別人填寫的日誌）→ 待簽核 */
function confirmLog_(me, d) {
  const l = getLog_(d.id), c = caseRow_(l['案件ID']);
  if (logStatus_(l) !== LS.DESIGNER) throw new Error('這篇不在待設計師確認');
  if ((c && c['負責設計師']) !== me.id && me.role !== 'Boss') throw new Error('只有案件負責設計師可以確認');
  updateRow_('工程日誌', '日誌ID', d.id, pendingPatch_(l['填寫人']));
  return true;
}

/** 主管簽核通過 = 正式發布：記錄簽核內容、產生 PDF 存檔 */
function signLog_(me, d) {
  const l = getLog_(d.id);
  if (logStatus_(l) !== LS.PENDING) throw new Error('這篇不在待簽核');
  if (!canSign_(me, l)) throw new Error('這篇不是由你簽核');
  const patch = {
    '日誌狀態': LS.SIGNED, '簽核者': me.id, '簽核時間': now_(),
    '簽核內容': JSON.stringify(snapshot_(l, activePhotos_(d.id))), '修改待簽': '', '小修待看': '', '退回原因': ''
  };
  if (l['簽核內容']) patch['修訂時間'] = now_();
  updateRow_('工程日誌', '日誌ID', d.id, patch);
  let warn = '';
  try { makePdf_(d.id); } catch (e) { warn = 'PDF 產生失敗：' + e.message; }
  return { warn: warn };
}

/** 退回修改（內容明顯有誤、不適合發布） */
function returnLog_(me, d) {
  const l = getLog_(d.id);
  if (logStatus_(l) !== LS.PENDING && logStatus_(l) !== LS.DESIGNER) throw new Error('這篇目前不能退回');
  const c = caseRow_(l['案件ID']);
  if (!canSign_(me, l) && !(logStatus_(l) === LS.DESIGNER && c && c['負責設計師'] === me.id)) throw new Error('你不能退回這篇');
  updateRow_('工程日誌', '日誌ID', d.id, { '日誌狀態': LS.DRAFT, '退回原因': d.text || '請修改後再送出', '簽核期限': '' });
  return true;
}

/** 主管把重大異常、費用爭議、重要決策轉給 Boss 確認 */
function escalateLog_(me, d) {
  const l = getLog_(d.id);
  if (logStatus_(l) !== LS.PENDING || signerOf_(l) !== me.id || me.role === 'Boss') throw new Error('目前不能轉給 Boss');
  updateRow_('工程日誌', '日誌ID', d.id, { '簽核人': bossId_(), '轉Boss確認': 'Y' });
  return true;
}

/** 主管看過小修（新增照片）後消除提示 */
function seenLog_(me, d) {
  const l = getLog_(d.id);
  if (l['小修待看'] === 'Y' && canSign_(me, l)) updateRow_('工程日誌', '日誌ID', d.id, { '小修待看': '' });
  return true;
}

/** 分享前取得 PDF：以當下狀態重新產生（覆蓋舊檔），回傳檔案內容 */
function pdfLog_(me, d) {
  const l = getLog_(d.id);
  if (logStatus_(l) !== LS.SIGNED) throw new Error('這篇尚未簽核，或修改後待主管確認，暫時不能分享');
  if (!canShare_(me, caseRow_(l['案件ID']))) throw new Error('只有案件負責設計師或主管可以分享');
  const file = makePdf_(d.id);
  return { name: file.getName(), data: Utilities.base64Encode(file.getBlob().getBytes()), url: file.getUrl() };
}

/**
 * 記錄 PDF 的分享或下載操作（兩者分開記錄；分享操作完成不代表客戶已收到）。
 * d.kind = 'share'（手機分享選單完成）或 'download'（下載檔案）。只累加，不重算、不清除歷史。
 */
function shareLog_(me, d) {
  const l = getLog_(d.id);
  if (!canShare_(me, caseRow_(l['案件ID']))) throw new Error('只有案件負責設計師或主管可以分享');
  if (d.kind === 'download') updateRow_('工程日誌', '日誌ID', d.id, { '下載次數': (+l['下載次數'] || 0) + 1, '最後下載人': me.id, '最後下載時間': now_() });
  else updateRow_('工程日誌', '日誌ID', d.id, { '分享次數': (+l['分享次數'] || 0) + 1, '最後分享人': me.id, '最後分享時間': now_() });
  return true;
}

/** 唯讀查看既有 PDF：只回傳已存檔的檔案，不重新產生；預覽模式也走這裡 */
function pdfView_(me, d) {
  const l = getLog_(d.id);
  if (!l['PDF檔ID']) throw new Error('這篇還沒有 PDF 檔（主管簽核後才會產生）');
  let f;
  try { f = DriveApp.getFileById(l['PDF檔ID']); } catch (e) { f = null; }
  if (!f || f.isTrashed()) throw new Error('找不到這篇的 PDF 檔，可能已被移除');
  return { name: f.getName(), url: f.getUrl(), at: l['PDF時間'] };
}

/* ========== PDF ========== */

function caseDir_(c) {
  const m = String(c['Drive資料夾'] || '').match(/folders\/([\w-]+)/);
  if (m) { try { return DriveApp.getFolderById(m[1]); } catch (e) { } }
  const parent = DriveApp.getFileById(SS_ID).getParents().next();
  const it = parent.getFoldersByName(CASE_ROOT), root = it.hasNext() ? it.next() : parent.createFolder(CASE_ROOT);
  const it2 = root.getFoldersByName(c['案件名稱']), dir = it2.hasNext() ? it2.next() : root.createFolder(c['案件名稱']);
  updateRow_('案件', '案件ID', c['案件ID'], { 'Drive資料夾': dir.getUrl() });
  return dir;
}
function logPdfDir_(c) {
  const d = caseDir_(c), it = d.getFoldersByName(LOG_PDF_DIR);
  return it.hasNext() ? it.next() : d.createFolder(LOG_PDF_DIR);
}
function logoData_() {
  const cache = CacheService.getScriptCache();
  let s = cache.get('logo');
  if (!s) {
    try { s = Utilities.base64Encode(UrlFetchApp.fetch(APP_URL + 'icons/logo.png').getContent()); cache.put('logo', s, 21600); }
    catch (e) { s = ''; }
  }
  return s ? 'data:image/png;base64,' + s : '';
}
function photoData_(path) {
  try {
    const it = dirFor_(path).getFilesByName(String(path).split('/').pop());
    if (it.hasNext()) { const b = it.next().getBlob(); return 'data:' + (b.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(b.getBytes()); }
  } catch (e) { }
  return '';
}

/** 產生日誌 PDF，存到「案件資料夾／工程日誌」，覆蓋舊檔 */
function makePdf_(logId) {
  const l = getLog_(logId), c = caseRow_(l['案件ID']);
  if (!c) throw new Error('找不到案件');
  const photos = activePhotos_(logId);
  const logs = readTable_('工程日誌').filter(x => x['案件ID'] === l['案件ID']);
  const dateOf = id => (logs.find(x => x['日誌ID'] === id) || {})['日期'] || '';
  const allIns = readTable_('主管指示').filter(i => i['案件ID'] === l['案件ID'] && i['指示內容']);
  allIns.forEach(i => i['狀態'] = insStatus_(i['狀態']));
  const ins = allIns.filter(i => i['日誌ID'] === logId);
  const track = allIns.filter(i => i['日誌ID'] && i['日誌ID'] !== logId && i['狀態'] !== IS.CLOSED && dateOf(i['日誌ID']) && dateOf(i['日誌ID']) < l['日期']);
  const html = pdfHtml_(l, c, photos, ins, track, dateOf);
  const name = '工程日誌_' + c['案件名稱'] + '_' + String(l['日期']).replace(/\//g, '-') + '_' + logId.slice(0, 4) + '.pdf';
  const blob = Utilities.newBlob(html, 'text/html', 'log.html').getAs('application/pdf').setName(name);
  const dir = logPdfDir_(c);
  if (l['PDF檔ID']) { try { DriveApp.getFileById(l['PDF檔ID']).setTrashed(true); } catch (e) { } }
  const file = dir.createFile(blob);
  updateRow_('工程日誌', '日誌ID', logId, { 'PDF檔ID': file.getId(), 'PDF時間': now_() });
  return file;
}

function pdfHtml_(l, c, photos, ins, track, dateOf) {
  const logo = logoData_();
  const row = (k, v) => v ? '<tr><td class="k">' + h_(k) + '</td><td>' + h_(v) + '</td></tr>' : '';
  const stCls = s => s === IS.CLOSED ? 'ok' : s === IS.REPLIED ? 'wait' : 'todo';
  const stTxt = s => s === IS.REPLIED ? '已回報，待主管確認' : s;
  const insBlock = i => '<div class="ins"><div class="it">' + h_(i['指示內容']) + '　<span class="st ' + stCls(i['狀態']) + '">' + h_(stTxt(i['狀態'])) + '</span></div>'
    + '<div class="im">下指示：' + h_(pname_(i['下指示人'])) + (i['負責人'] ? '　負責人：' + h_(pname_(i['負責人'])) : '') + (i['期限'] ? '　期限：' + h_(i['期限']) : '') + '</div>'
    + (i['回報內容'] ? '<div class="rp">處理回報：' + h_(i['回報內容']) + '</div>' : '') + '</div>';
  let ph = '';
  for (let k = 0; k < photos.length; k += 2) {
    ph += '<tr>' + [photos[k], photos[k + 1]].map(p => p ? '<td><img src="' + photoData_(p['照片']) + '" width="240"><div class="pn">' + h_(p['說明'] || [p['空間'], p['位置']].filter(String).join('・')) + '</div></td>' : '<td></td>').join('') + '</tr>';
  }
  const signed = l['簽核者'] ? pname_(l['簽核者']) + '（' + String(l['簽核時間']).slice(0, 16) + '）' : '';
  return '<html><head><meta charset="utf-8"><style>'
    + 'body{font-family:"Noto Sans TC","Noto Sans CJK TC","Microsoft JhengHei",sans-serif;color:#2b2724;font-size:10.5pt;line-height:1.6}'
    + '.hd{width:100%;border-bottom:1.5pt solid #AF9263;padding-bottom:6pt}.hd td{vertical-align:bottom}'
    + '.tt{font-size:18pt;letter-spacing:3pt;font-weight:bold;text-align:right}.ts{font-size:9pt;color:#8a7f75;text-align:right}'
    + 'table.info{width:100%;border-collapse:collapse;margin-top:12pt}table.info td{border:0.6pt solid #e2d9cc;padding:4pt 7pt;font-size:10pt}'
    + 'table.info td.k{background:#f7f4ef;width:72pt;color:#7a7067}'
    + 'h2{font-size:11.5pt;margin:16pt 0 6pt;padding-left:6pt;border-left:3pt solid #AF9263}'
    + '.txt{white-space:pre-wrap}.issue{background:#f9ece9;color:#8a2f25;padding:6pt 9pt;white-space:pre-wrap}'
    + 'table.ph{width:100%}table.ph td{width:50%;vertical-align:top;padding:4pt}.pn{font-size:9pt;color:#5a5048;margin-top:2pt}'
    + '.ins{border:0.6pt solid #e2d9cc;padding:6pt 9pt;margin-bottom:6pt}.it{font-weight:bold}.im{font-size:9pt;color:#7a7067}'
    + '.rp{font-size:9.5pt;margin-top:3pt;background:#f7f4ef;padding:3pt 6pt;white-space:pre-wrap}'
    + '.st{font-size:8.5pt;font-weight:normal;padding:1pt 5pt}.st.ok{color:#4f7a5c}.st.wait{color:#b9773a}.st.todo{color:#5b6f8c}'
    + '.foot{margin-top:22pt;border-top:0.6pt solid #e2d9cc;padding-top:5pt;font-size:8.5pt;color:#8a7f75}'
    + '</style></head><body>'
    + '<table class="hd"><tr><td>' + (logo ? '<img src="' + logo + '" height="62">' : '<b>浩森設計 HOUSEN</b>') + '</td>'
    + '<td><div class="tt">工程日誌</div><div class="ts">' + h_(c['案件名稱']) + '　' + h_(l['日期']) + '</div></td></tr></table>'
    + '<table class="info">' + row('案件名稱', c['案件名稱']) + row('施工地點', c['地址']) + row('施工日期', l['日期'])
    + row('工種', String(l['工種'] || '').split(/\s*,\s*/).join('、')) + row('填寫人', pname_(l['填寫人'])) + row('主管簽核', signed) + '</table>'
    + '<h2>施工內容</h2><div class="txt">' + (h_(l['今日狀況']) || '（無）') + '</div>'
    + (l['發現問題'] ? '<h2>現場問題</h2><div class="issue">' + h_(l['發現問題']) + '</div>' : '')
    + (ph ? '<h2>現場照片</h2><table class="ph">' + ph + '</table>' : '')
    + (ins.length ? '<h2>主管指示</h2>' + ins.map(insBlock).join('') : '')
    + (track.length ? '<h2>追蹤中事項</h2>' + track.map(i => '<div class="im">源自 ' + h_(dateOf(i['日誌ID'])) + ' 日誌</div>' + insBlock(i)).join('') : '')
    + '<div class="foot">狀態截至 ' + fmt_(new Date(), 'yyyy/MM/dd HH:mm') + (l['修訂時間'] ? '　・修訂於 ' + h_(String(l['修訂時間']).slice(0, 10)) : '')
    + '<br>浩森設計 HOUSEN INTERIOR DESIGN</div>'
    + '</body></html>';
}

/* ========== 寫入：指示、待辦、案件、工種 ========== */

function saveIns_(me, d) {
  if (!me.leader) throw new Error('只有主管可以下指示');
  if (!d.text) throw new Error('請填寫指示內容');
  const id = uid_();
  appendRow_('主管指示', {
    '指示ID': id, '案件ID': d.caseId, '日誌ID': d.logId || '', '指示內容': d.text, '負責人': d.to || '',
    '期限': ymd_(d.due), '狀態': IS.TODO, '退回次數': 0, '下指示人': me.id, '建立時間': now_()
  });
  return id;
}

/** 指示：待處理 →（負責人回報）已回報 →（下指示人確認）已結案；退回回到待處理 */
function actIns_(me, d) {
  const f = findRow_('主管指示', '指示ID', d.id), g = c => f.vals[f.head.indexOf(c)];
  if (d.act === 'reply') {
    if (g('負責人') !== me.id) throw new Error('只有負責人可以回報');
    updateRow_('主管指示', '指示ID', d.id, { '回報內容': d.text || '', '回報時間': now_(), '狀態': IS.REPLIED });
  } else if (d.act === 'close' || d.act === 'return') {
    if (g('下指示人') !== me.id && me.role !== 'Boss') throw new Error('只有下指示的人可以結案或退回');
    if (d.act === 'close') updateRow_('主管指示', '指示ID', d.id, { '狀態': IS.CLOSED, '結案時間': now_() });
    else updateRow_('主管指示', '指示ID', d.id, {
      '狀態': IS.TODO, '退回次數': (+g('退回次數') || 0) + 1,
      '回報內容': (d.text ? '【退回】' + d.text + '\n' : '') + (g('回報內容') || '')
    });
  }
  return true;
}

/** 待辦：自己建給自己；主管可以指派給別人 */
function saveTodo_(me, d) {
  if (!d.text) throw new Error('請填寫待辦內容');
  const to = d.to || me.id;
  if (to !== me.id && !me.leader) throw new Error('只能建立自己的待辦');
  const id = uid_();
  appendRow_('待辦', { '待辦ID': id, '案件ID': d.caseId || '', '內容': d.text, '負責人': to, '期限': ymd_(d.due), '狀態': '未完成', '建立人': me.id, '建立時間': now_() });
  return id;
}

function setTodo_(me, d) {
  const f = findRow_('待辦', '待辦ID', d.id), g = c => f.vals[f.head.indexOf(c)];
  if (g('負責人') !== me.id && g('建立人') !== me.id) throw new Error('只能更新自己的待辦');
  updateRow_('待辦', '待辦ID', d.id, d.done ? { '狀態': '已完成', '完成時間': now_() } : { '狀態': '未完成', '完成時間': '' });
  return true;
}

function saveCase_(me, d) {
  if (!d.name) throw new Error('請填寫案件名稱');
  const id = uid_();
  appendRow_('案件', {
    '案件ID': id, '案件名稱': d.name, '客戶姓名': d.client || '', '客戶電話': d.phone || '', '地址': d.address || '',
    '類型': d.type || '', '來源': d.source || '', '負責設計師': d.designer || '', '階段': '洽談', '狀態': '進行中', '建立日期': today_()
  });
  return id;
}

function setStage_(me, d) {
  if (!me.leader) throw new Error('只有主管可以改案件階段');
  const c = caseRow_(d.id), patch = { '階段': d.stage, '最後修改時間': now_(), '最後修改人': me.id };
  if (d.stage === '結案' && c) {   // 結案：補上結案日與保固到期日（保固年限在公司設定）
    const end = c['結案日'] || today_();
    patch['結案日'] = end;
    if (!c['保固到期日']) { const p = end.split('/'); patch['保固到期日'] = (+p[0] + (+setting_('保固年限', 1) || 1)) + '/' + p[1] + '/' + p[2]; }
  }
  updateRow_('案件', '案件ID', d.id, patch);
  return true;
}

/* ========== 結案後唯讀 ==========
 * 案件在「結案」階段時，日誌、指示、進度、客戶紀錄都不能再新增或修改；
 * 仍可：改階段（主管重新開啟）、修改案件資料、保固報修、產生報告。
 */
const CLOSED_OK = ['setStage', 'saveCaseInfo', 'saveRepair', 'saveTodo', 'setTodo', 'saveCase', 'saveTrade', 'shareLog',
  'saveSetting', 'saveTemplateRow', 'suggestTemplate', 'setSuggestion'];
function closedGuard_(action, d) {
  if (CLOSED_OK.indexOf(action) >= 0 || !d) return;
  let cid = d.caseId || '';
  const look = (t, k, id) => { try { return rowObj_(findRow_(t, k, id))['案件ID']; } catch (e) { return ''; } };
  if (!cid && d.id) {
    const map = {
      updateLog: ['工程日誌', '日誌ID'], submitLog: ['工程日誌', '日誌ID'], confirmLog: ['工程日誌', '日誌ID'], signLog: ['工程日誌', '日誌ID'],
      returnLog: ['工程日誌', '日誌ID'], escalateLog: ['工程日誌', '日誌ID'], seenLog: ['工程日誌', '日誌ID'],
      actIns: ['主管指示', '指示ID'], cancelPlanItem: ['進度計畫', '工序ID'], setActualStart: ['進度計畫', '工序ID'], setDone: ['進度計畫', '工序ID'],
      reviewMeeting: ['會議', '會議ID'], confirmClientIns: ['客戶指示', '指示ID'], setSop: ['案件SOP', 'ID'], setMilestone: ['里程碑', '任務ID']
    };
    if (map[action]) cid = look(map[action][0], map[action][1], d.id);
  }
  if (!cid && d.itemId) cid = look('進度計畫', '工序ID', d.itemId);
  if (!cid && action === 'deletePhoto' && d.id) cid = look('日誌照片', '照片ID', d.id);
  const c = cid ? caseRow_(cid) : null;
  if (c && c['階段'] === '結案') throw new Error('案件已結案，資料唯讀；如需修改請主管把階段改回');
}

/* ========== 保固報修 ========== */
const REPAIR_ST = ['待處理', '處理中', '已完成'];
function saveRepair_(me, d) {
  const c = caseRow_(d.caseId);
  if (!c) throw new Error('找不到案件');
  if (!d.id) {
    if (!String(d.text || '').trim()) throw new Error('請填寫報修內容');
    appendRow_('保固報修', { '報修ID': uid_(), '案件ID': d.caseId, '報修日期': ymd_(d.date) || today_(), '內容': String(d.text).trim(), '負責人': d.owner || c['負責設計師'] || '',
      '狀態': '待處理', '記錄人': me.id, '建立時間': now_() });
    return true;
  }
  const r = rowObj_(findRow_('保固報修', '報修ID', d.id));
  if (!(me.leader || r['負責人'] === me.id || c['負責設計師'] === me.id)) throw new Error('只有負責人、負責設計師或主管可以更新');
  const st = REPAIR_ST.indexOf(d.status) >= 0 ? d.status : r['狀態'];
  if (st === '已完成' && !String(d.result || r['處理結果'] || '').trim()) throw new Error('完成請寫處理結果');
  updateRow_('保固報修', '報修ID', d.id, { '狀態': st, '處理結果': d.result != null ? d.result : r['處理結果'], '負責人': d.owner || r['負責人'],
    '完成日': st === '已完成' ? (r['完成日'] || today_()) : '' });
  return true;
}

/* ========== 統計（可看績效者） ==========
 * 期間內每人的：日誌篇數、補登篇數、負責案件漏填天數、指示收到／逾期回報／被退回、簽核篇數與平均耗時、里程碑完成與逾期。
 */
function stats_(me, d) {
  if (!me.seePerf) throw new Error('沒有查看績效的權限');
  const from = ymd_(d.from), to = ymd_(d.to);
  if (!from || !to || to < from) throw new Error('請選擇正確的期間');
  const inR = v => v && String(v).slice(0, 10) >= from && String(v).slice(0, 10) <= to;
  const logs = readTable_('工程日誌'), ins = readTable_('主管指示').filter(i => i['指示內容']), ms = tryTable_('里程碑'), cases = readTable_('案件');
  const exempt = tryTable_('日誌豁免'), rule = logRule_();
  const hrs = (a, b) => (new Date(String(b).replace(/\//g, '-').replace(' ', 'T') + '+08:00') - new Date(String(a).replace(/\//g, '-').replace(' ', 'T') + '+08:00')) / 36e5;
  // 期間內漏填（依目前規則回推）
  const missBy = {};
  cases.filter(c => c['階段'] === '施工' || c['結案日']).forEach(c => {
    let t = new Date(from.replace(/\//g, '-') + 'T12:00:00+08:00');
    const end = to < today_() ? to : fmt_(new Date(Date.now() - 864e5), 'yyyy/MM/dd'), start = [c['預計開工日'], rule.since].filter(String).sort().pop() || '';
    while (fmt_(t, 'yyyy/MM/dd') <= end) {
      const ymd = fmt_(t, 'yyyy/MM/dd');
      if ((!start || ymd >= start) && (!c['結案日'] || ymd <= c['結案日']) && rule.days.indexOf(WEEK[+fmt_(t, 'u') % 7]) >= 0
        && !logs.some(l => l['案件ID'] === c['案件ID'] && l['日期'] === ymd && logStatus_(l) !== LS.DRAFT) && !exempt.some(x => x['案件ID'] === c['案件ID'] && x['日期'] === ymd))
        missBy[c['負責設計師']] = (missBy[c['負責設計師']] || 0) + 1;
      t = new Date(t.getTime() + 864e5);
    }
  });
  const rows = people_().filter(p => p.active).map(p => {
    const myLogs = logs.filter(l => l['填寫人'] === p.id && inR(l['日期']));
    const late = myLogs.filter(l => l['建立時間'] && String(l['建立時間']).slice(0, 10) > l['日期']);
    const got = ins.filter(i => i['負責人'] === p.id && inR(i['建立時間']));
    const lateReply = got.filter(i => i['期限'] && ((i['回報時間'] && String(i['回報時間']).slice(0, 10) > i['期限']) || (!i['回報時間'] && i['期限'] < today_())));
    const signed = logs.filter(l => l['簽核者'] === p.id && inR(l['簽核時間']));
    const signHrs = signed.map(l => l['送出時間'] ? hrs(l['送出時間'], l['簽核時間']) : null).filter(x => x !== null && x >= 0);
    const myMs = ms.filter(m => m['負責人'] === p.id && inR(m['目前期限']));
    return {
      id: p.id, name: p.name, role: p.role,
      logs: myLogs.length, lateLogs: late.length, missing: missBy[p.id] || 0,
      insGot: got.length, insLate: lateReply.length, insReturns: got.reduce((a, i) => a + (+i['退回次數'] || 0), 0),
      signed: signed.length, signHrs: signHrs.length ? Math.round(signHrs.reduce((a, b) => a + b, 0) / signHrs.length * 10) / 10 : null,
      signLate: signed.filter(l => l['簽核期限'] && String(l['簽核時間']).slice(0, 16) > l['簽核期限']).length,
      msDone: myMs.filter(m => m['狀態'] === '已完成').length, msTotal: myMs.length,
      msLate: myMs.filter(m => (m['完成日'] && m['完成日'] > m['目前期限']) || (!m['完成日'] && m['目前期限'] < today_())).length,
      msReturns: myMs.reduce((a, m) => a + (+m['退回次數'] || 0), 0)
    };
  });
  return { from, to, rows, rule: rule };
}

/* ========== 案件主檔：修改案件資料 ========== */
const CASE_TEXT = ['案件名稱', '客戶姓名', '客戶電話', '客戶LINE', '地址', '類型', '來源', '負責設計師', 'Drive資料夾', '備註'];
const CASE_DATES = ['提案日', '設計約簽約日', '工程約簽約日', '預計開工日', '預計完工日', '實際完工日', '結案日', '保固到期日'];
const CASE_MONEY = ['設計費', '工程金額'];
/** 可修改案件資料：主管、行政、該案負責設計師（金額另需「可看金額」） */
function canEditCase_(me, c) { return me.leader || me.role === '行政' || (!!c && c['負責設計師'] === me.id); }

/** 只寫入有變動的欄位，並記錄最後修改時間與修改人 */
function saveCaseInfo_(me, d) {
  const c = caseRow_(d.id);
  if (!c) throw new Error('找不到案件');
  if (!canEditCase_(me, c)) throw new Error('只有主管、行政或案件負責設計師可以修改案件資料');
  const f = d.fields || {}, patch = {};
  CASE_TEXT.forEach(k => { if (k in f) patch[k] = String(f[k] == null ? '' : f[k]).trim(); });
  CASE_DATES.forEach(k => { if (k in f) patch[k] = ymd_(String(f[k] || '').trim()); });
  if (me.seeMoney) CASE_MONEY.forEach(k => { if (k in f) patch[k] = String(f[k] == null ? '' : f[k]).replace(/[^0-9.]/g, ''); });
  if ('案件名稱' in patch && !patch['案件名稱']) throw new Error('案件名稱不能空白');
  if (patch['負責設計師'] && !people_().some(p => p.id === patch['負責設計師'] && p.active)) throw new Error('負責設計師不在人員名單');
  const v = k => k in patch ? patch[k] : (c[k] || '');
  if (v('預計開工日') && v('預計完工日') && v('預計完工日') < v('預計開工日')) throw new Error('預計完工日不能早於預計開工日');
  CASE_DATES.forEach(k => { if (patch[k] && !/^\d{4}\/\d{2}\/\d{2}$/.test(patch[k])) throw new Error(k + '格式不對'); });
  if (patch['Drive資料夾'] && patch['Drive資料夾'] !== c['Drive資料夾']) {
    const m = patch['Drive資料夾'].match(/folders\/([\w-]+)/);
    if (!m) throw new Error('請貼上 Google 雲端硬碟「資料夾」的網址（網址裡要有 /folders/）');
    try { patch['Drive資料夾'] = DriveApp.getFolderById(m[1]).getUrl(); }
    catch (e) { throw new Error('打不開這個資料夾：請確認網址正確，且 Boss 的帳號有權限'); }
  }
  const changed = Object.keys(patch).filter(k => String(c[k] == null ? '' : c[k]) !== patch[k]);
  if (!changed.length) return { changed: [] };
  const out = {};
  changed.forEach(k => out[k] = patch[k]);
  out['最後修改時間'] = now_(); out['最後修改人'] = me.id;
  updateRow_('案件', '案件ID', d.id, out);
  return { changed: changed };
}

/** 新增工種（主管） */
function saveTrade_(me, d) {
  if (!me.leader) throw new Error('只有主管可以管理工種');
  const name = String(d.name || '').trim();
  if (!name) throw new Error('請填寫工種名稱');
  const list = readTable_('工種清單');
  if (list.some(t => t['工種'] === name)) throw new Error('工種已存在');
  const max = list.reduce((m, t) => Math.max(m, +t['排序'] || 0), 0);
  appendRow_('工種清單', { '工種': name, '色碼': d.color || '#8A7F75', '排序': max + 1, '啟用': 'Y' });
  return true;
}

/* ========== 進度計畫（第 4 項：不受待決規則影響的部分） ==========
 * 暫定：負責設計師與主管可以編排進度、確認實際開始、標記施工完成；只有主管可以「定案」。
 * 定案前：日期直接改（只改「目前計畫」）。定案時：把目前計畫複製成「原計畫」（基準）。
 * 定案後：改期只改「目前計畫」且必須填原因；所有變動寫入「進度異動紀錄」。
 * 實際開始：系統以該工種第一篇日誌作為「參考」，由負責設計師確認；更正要填原因。
 * 施工完成、查驗通過、下一工序放行分開記錄；查驗與放行的規則待 Boss 決定，這裡尚未製作。
 */
function canPlan_(me, c) { return me.leader || (!!c && c['負責設計師'] === me.id); }
function planGuard_(me, caseId) {
  const c = caseRow_(caseId);
  if (!c) throw new Error('找不到案件');
  if (!canPlan_(me, c)) throw new Error('只有案件負責設計師或主管可以編排進度');
  return c;
}
function planItem_(id) { return rowObj_(findRow_('進度計畫', '工序ID', id)); }
function planLog_(me, caseId, itemId, what, from, to, why) {
  appendRow_('進度異動紀錄', { '紀錄ID': uid_(), '案件ID': caseId, '工序ID': itemId || '', '項目': what, '原值': from || '', '新值': to || '', '原因': why || '', '修改人': me.id, '時間': now_() });
}
function checkRange_(s, e) {
  if (s && !/^\d{4}\/\d{2}\/\d{2}$/.test(s) || e && !/^\d{4}\/\d{2}\/\d{2}$/.test(e)) throw new Error('日期格式不對');
  if (s && e && e < s) throw new Error('完成日不能早於開始日');
}
/** 加 n 個工作天（週六日不算；國定假日尚未處理） */
function addWorkdays_(ymd, n) {
  const p = String(ymd).split('/').map(Number);
  let d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  const wk = () => { const w = d.getUTCDay(); return w !== 0 && w !== 6; };
  while (!wk()) d = new Date(d.getTime() + 864e5);
  for (let i = 0; i < n; i++) { do { d = new Date(d.getTime() + 864e5); } while (!wk()); }
  const z = x => (x < 10 ? '0' : '') + x;
  return d.getUTCFullYear() + '/' + z(d.getUTCMonth() + 1) + '/' + z(d.getUTCDate());
}

/** 新增或修改工序 */
function savePlanItem_(me, d) {
  const c = planGuard_(me, d.caseId), locked = !!c['進度定案時間'];
  const start = ymd_(d.start), end = ymd_(d.end), why = String(d.reason || '').trim();
  checkRange_(start, end);
  if (!String(d.name || '').trim()) throw new Error('請填寫工序名稱');
  if (!d.id) {
    if (locked && !why) throw new Error('進度已定案，新增工序請填寫原因');
    const id = uid_(), maxOrder = readTable_('進度計畫').filter(r => r['案件ID'] === d.caseId).reduce((m, r) => Math.max(m, +r['順序'] || 0), 0);
    appendRow_('進度計畫', { '工序ID': id, '案件ID': d.caseId, '順序': d.order || maxOrder + 1, '工種': d.trade || '', '工序名稱': String(d.name).trim(),
      '目前計畫開始': start, '目前計畫完成': end, '狀態': '計畫', '最後修改人': me.id, '最後修改時間': now_() });
    if (locked) planLog_(me, d.caseId, id, '新增工序', '', String(d.name).trim() + ' ' + start + '～' + end, why);
    return id;
  }
  const r = planItem_(d.id);
  if (r['案件ID'] !== d.caseId) throw new Error('工序不屬於這個案件');
  const patch = { '工種': d.trade || '', '工序名稱': String(d.name).trim(), '目前計畫開始': start, '目前計畫完成': end };
  if (d.order) patch['順序'] = d.order;
  const dateChanged = start !== (r['目前計畫開始'] || '') || end !== (r['目前計畫完成'] || '');
  if (locked && dateChanged && !why) throw new Error('進度已定案，改期請填寫原因');
  if (locked && dateChanged) planLog_(me, d.caseId, d.id, '改期', (r['目前計畫開始'] || '') + '～' + (r['目前計畫完成'] || ''), start + '～' + end, why);
  if (locked && patch['工序名稱'] !== r['工序名稱']) planLog_(me, d.caseId, d.id, '改名稱', r['工序名稱'], patch['工序名稱'], why);
  patch['改期原因'] = locked && dateChanged ? why : (r['改期原因'] || '');
  patch['最後修改人'] = me.id; patch['最後修改時間'] = now_();
  updateRow_('進度計畫', '工序ID', d.id, patch);
  return d.id;
}

/** 取消工序（不刪除，保留紀錄）；定案後要填原因 */
function cancelPlanItem_(me, d) {
  const r = planItem_(d.id), c = planGuard_(me, r['案件ID']);
  const why = String(d.reason || '').trim();
  if (c['進度定案時間'] && !why) throw new Error('進度已定案，取消工序請填寫原因');
  if (r['實際開始']) throw new Error('這個工序已經開始，不能取消');
  updateRow_('進度計畫', '工序ID', d.id, { '狀態': '取消', '最後修改人': me.id, '最後修改時間': now_() });
  planLog_(me, r['案件ID'], d.id, '取消工序', r['工序名稱'], '', why);
  return true;
}

/** 套用工序範本（範本為示範內容，待 Boss 確認）。有預計開工日就依標準工期排出草稿日期 */
function applyTemplate_(me, d) {
  const c = planGuard_(me, d.caseId);
  if (readTable_('進度計畫').some(r => r['案件ID'] === d.caseId && r['狀態'] !== '取消')) throw new Error('這個案件已經有工序，不能再套用範本');
  const tpl = readTable_('範本_工序').filter(t => t['工序名稱']).sort((a, b) => (+a['順序'] || 0) - (+b['順序'] || 0));
  if (!tpl.length) throw new Error('工序範本是空的');
  let cursor = c['預計開工日'] || '', prevStart = '';
  tpl.forEach((t, i) => {
    const days = Math.max(1, +t['標準工期（工作天）'] || 1);
    let s = '', e = '';
    if (cursor) {
      const parallel = /同步/.test(t['備註'] || '') && prevStart;
      s = parallel ? prevStart : addWorkdays_(cursor, 0);
      e = addWorkdays_(s, days - 1);
      if (!parallel) { cursor = addWorkdays_(e, 1); prevStart = s; }
    }
    appendRow_('進度計畫', { '工序ID': uid_(), '案件ID': d.caseId, '順序': i + 1, '工種': t['工種'] || '', '工序名稱': t['工序名稱'],
      '目前計畫開始': s, '目前計畫完成': e, '查驗點': t['查驗點'] || '', '狀態': '計畫', '範本工序ID': t['工序ID'] || '', '最後修改人': me.id, '最後修改時間': now_() });
  });
  planLog_(me, d.caseId, '', '套用範本', '', tpl.length + ' 個工序（示範範本）', c['預計開工日'] ? '依預計開工日 ' + c['預計開工日'] + ' 排出草稿日期' : '案件沒有預計開工日，日期留空');
  return tpl.length;
}

/** 定案（主管）：把目前計畫複製成原計畫，之後改期都要填原因 */
function lockPlan_(me, d) {
  if (!me.leader) throw new Error('只有主管可以定案進度計畫');
  const c = caseRow_(d.caseId);
  if (!c) throw new Error('找不到案件');
  if (c['進度定案時間']) throw new Error('進度計畫已經定案');
  const items = readTable_('進度計畫').filter(r => r['案件ID'] === d.caseId && r['狀態'] !== '取消');
  if (!items.length) throw new Error('還沒有任何工序');
  const miss = items.filter(r => !r['目前計畫開始'] || !r['目前計畫完成']);
  if (miss.length) throw new Error('還有 ' + miss.length + ' 個工序沒有排日期（例如「' + miss[0]['工序名稱'] + '」）');
  items.forEach(r => updateRow_('進度計畫', '工序ID', r['工序ID'], { '原計畫開始': r['目前計畫開始'], '原計畫完成': r['目前計畫完成'] }));
  updateRow_('案件', '案件ID', d.caseId, { '進度定案時間': now_(), '進度定案人': me.id });
  planLog_(me, d.caseId, '', '進度定案', '', items.length + ' 個工序', '');
  return true;
}

/** 確認實際開始日（日誌只是參考）；已確認過再改視為更正，要填原因 */
function setActualStart_(me, d) {
  const r = planItem_(d.id); planGuard_(me, r['案件ID']);
  const date = ymd_(d.date), why = String(d.reason || '').trim();
  checkRange_(date, '');
  if (!date) throw new Error('請選擇日期');
  if (r['實際完成'] && date > r['實際完成']) throw new Error('實際開始不能晚於施工完成日');
  if (r['實際開始'] && r['實際開始'] !== date && !why) throw new Error('更正實際開始日請填寫原因');
  if (r['實際開始'] === date) return true;
  updateRow_('進度計畫', '工序ID', d.id, { '實際開始': date, '實際開始確認人': me.id, '最後修改人': me.id, '最後修改時間': now_() });
  planLog_(me, r['案件ID'], d.id, r['實際開始'] ? '更正實際開始' : '確認實際開始', r['實際開始'], date, why || (d.basis ? '參考：' + d.basis : ''));
  return true;
}

/** 施工完成（與查驗、放行分開）；撤回或更正要填原因 */
function setDone_(me, d) {
  const r = planItem_(d.id); planGuard_(me, r['案件ID']);
  const why = String(d.reason || '').trim();
  if (d.undo) {
    if (!r['實際完成']) return true;
    if (!why) throw new Error('撤回施工完成請填寫原因');
    updateRow_('進度計畫', '工序ID', d.id, { '實際完成': '', '實際完成確認人': '', '最後修改人': me.id, '最後修改時間': now_() });
    planLog_(me, r['案件ID'], d.id, '撤回施工完成', r['實際完成'], '', why);
    return true;
  }
  const date = ymd_(d.date);
  if (!date) throw new Error('請選擇日期');
  if (!r['實際開始']) throw new Error('請先確認實際開始日');
  checkRange_(r['實際開始'], date);
  if (r['實際完成'] && r['實際完成'] !== date && !why) throw new Error('更正施工完成日請填寫原因');
  if (r['實際完成'] === date) return true;
  updateRow_('進度計畫', '工序ID', d.id, { '實際完成': date, '實際完成確認人': me.id, '最後修改人': me.id, '最後修改時間': now_() });
  planLog_(me, r['案件ID'], d.id, r['實際完成'] ? '更正施工完成' : '施工完成', r['實際完成'], date, why);
  return true;
}

/* ========== 客戶頁：客戶指示、會議記錄、客戶確認、追加減 ==========
 * 暫定規則（可調）：任何同事都能記錄；確認前由記錄人、負責設計師、主管修改；
 * 客戶確認後「鎖定」不可再改，要更正就另記一筆。追加減金額目前案件成員都看得到（待 Boss 確認）。
 */
const CI_SOURCES = ['LINE', '口頭', '電話', '會議', '其他'];
const CI_STATUS = ['待確認', '已確認', '客戶不同意'];
function canCI_(me, c, rec) { return me.leader || (c && c['負責設計師'] === me.id) || (rec && rec['記錄人'] === me.id); }

function saveMeeting_(me, d) {
  const c = caseRow_(d.caseId);
  if (!c) throw new Error('找不到案件');
  if (!String(d.name || '').trim()) throw new Error('請填寫會議名稱');
  const row = { '日期': ymd_(d.date) || today_(), '會議名稱': String(d.name).trim(), '出席人': d.attendees || '', '錄音檔': d.audio || '', 'AI摘要': d.summary || '' };
  if (!d.id) {
    const id = uid_();
    appendRow_('會議', Object.assign({ '會議ID': id, '案件ID': d.caseId, '記錄人': me.id, '建立時間': now_() }, row));
    return id;
  }
  const m = rowObj_(findRow_('會議', '會議ID', d.id));
  if (!canCI_(me, c, m)) throw new Error('只有記錄人、負責設計師或主管可以修改');
  row['核對人'] = ''; row['核對時間'] = '';   // 內容改了要重新核對
  updateRow_('會議', '會議ID', d.id, row);
  return d.id;
}

/** 設計師核對會議摘要（AI 整理的內容要人確認過） */
function reviewMeeting_(me, d) {
  const m = rowObj_(findRow_('會議', '會議ID', d.id)), c = caseRow_(m['案件ID']);
  if (!canCI_(me, c, null)) throw new Error('只有負責設計師或主管可以核對');
  updateRow_('會議', '會議ID', d.id, { '核對人': me.id, '核對時間': now_() });
  return true;
}

function saveClientIns_(me, d) {
  const c = caseRow_(d.caseId);
  if (!c) throw new Error('找不到案件');
  const text = String(d.text || '').trim();
  if (!text) throw new Error('請填寫客戶指示內容');
  const impact = d.impact ? 'Y' : 'N';
  const row = {
    '會議ID': d.meetingId || '', '類型': d.meetingId ? '會議性' : '臨時性', '來源': d.meetingId ? '會議' : (CI_SOURCES.indexOf(d.source) >= 0 ? d.source : '其他'),
    '日期': ymd_(d.date) || today_(), '內容': text, '影響費用或工期': impact,
    '追加減金額': impact === 'Y' ? String(d.amount || '').replace(/[^0-9.\-]/g, '') : '', '影響工期天數': impact === 'Y' ? String(d.days || '').replace(/[^0-9\-]/g, '') : ''
  };
  if (!d.id) {
    const id = uid_();
    appendRow_('客戶指示', Object.assign({ '指示ID': id, '案件ID': d.caseId, '確認狀態': '待確認', '記錄人': me.id, '建立時間': now_() }, row));
    return id;
  }
  const x = rowObj_(findRow_('客戶指示', '指示ID', d.id));
  if (x['鎖定'] === 'Y') throw new Error('客戶已確認，不能修改；要更正請另記一筆');
  if (!canCI_(me, c, x)) throw new Error('只有記錄人、負責設計師或主管可以修改');
  updateRow_('客戶指示', '指示ID', d.id, Object.assign(row, { '最後修改人': me.id, '最後修改時間': now_() }));
  return d.id;
}

function saveImage_(b64, ext, prefix) {
  if (!b64) return '';
  const name = prefix + '.' + uid_() + '.' + fmt_(new Date(), 'HHmmss') + '.' + ext;
  subDir_(CONFIRM_DIR).createFile(Utilities.newBlob(Utilities.base64Decode(b64), ext === 'png' ? 'image/png' : 'image/jpeg', name));
  return CONFIRM_DIR + '/' + name;
}

/** 記錄客戶確認：現場簽名、LINE 回覆截圖或其他方式；確認後鎖定 */
function confirmClientIns_(me, d) {
  const x = rowObj_(findRow_('客戶指示', '指示ID', d.id)), c = caseRow_(x['案件ID']);
  if (x['鎖定'] === 'Y') throw new Error('這筆已經確認過');
  if (!canCI_(me, c, x)) throw new Error('只有記錄人、負責設計師或主管可以登記客戶確認');
  const status = CI_STATUS.indexOf(d.status) > 0 ? d.status : '已確認';
  if (!d.method) throw new Error('請選擇確認方式');
  if (d.method === '現場簽名' && !d.sign) throw new Error('請請客戶簽名');
  if (d.method === 'LINE回覆' && !d.shot) throw new Error('請附上客戶回覆的截圖');
  updateRow_('客戶指示', '指示ID', d.id, {
    '確認狀態': status, '確認方式': d.method, '客戶簽名': saveImage_(d.sign, 'png', '簽名'), '確認截圖': saveImage_(d.shot, 'jpg', '截圖'),
    '確認時間': now_(), '確認備註': d.note || '', '鎖定': 'Y', '最後修改人': me.id, '最後修改時間': now_()
  });
  return true;
}

/* ========== 公司設定（可調整的規則參數） ========== */
let _settings;
function settings_() {
  if (_settings) return _settings;
  const o = {};
  tryTable_('公司設定').forEach(r => { if (r['項目']) o[r['項目']] = r['值']; });
  return (_settings = o);
}
function setting_(k, dflt) { const v = settings_()[k]; return v === undefined || v === '' ? dflt : v; }

/* ========== 日誌填寫規則與漏填追蹤（暫定，參數在「公司設定」可調） ==========
 * 施工階段的案件，在「日誌填寫日」每天要有一篇已送出的日誌（草稿不算）；當天沒施工就登記「無施工」。
 * 截止：隔天「日誌截止時間」；過了還沒有就算漏填，提醒負責設計師，Boss 總覽看得到。只追蹤最近 14 天。
 */
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
function logRule_() {
  return {
    days: String(setting_('日誌填寫日', '一,二,三,四,五,六')).split(/[,，、\s]+/).filter(String),
    cut: String(setting_('日誌截止時間', '10:00')),
    since: String(setting_('日誌追蹤起始日', '')),
    stale: +setting_('指示未回報提醒天數', 3) || 3
  };
}
/** 回傳案件漏填的日期（新到舊） */
function missingDays_(c, logs, exempt, rule) {
  if (c['階段'] !== '施工' || c['狀態'] === '已結案') return [];
  const now = new Date(), nowHM = fmt_(now, 'HH:mm'), out = [];
  const start = [c['預計開工日'], rule.since].filter(String).sort().pop() || '';
  for (let k = 1; k <= 14; k++) {
    const day = new Date(now.getTime() - k * 864e5), ymd = fmt_(day, 'yyyy/MM/dd');
    if (start && ymd < start) break;
    if (k === 1 && nowHM < rule.cut) continue;   // 昨天的日誌還沒到截止時間
    if (rule.days.indexOf(WEEK[+fmt_(day, 'u') % 7]) < 0) continue;
    if (logs.some(l => l['案件ID'] === c['案件ID'] && l['日期'] === ymd && logStatus_(l) !== LS.DRAFT)) continue;
    if (exempt.some(x => x['案件ID'] === c['案件ID'] && x['日期'] === ymd)) continue;
    out.push(ymd);
  }
  return out;
}
/** 登記某天無施工（任何同事都可以登記，記錄是誰） */
function markNoWork_(me, d) {
  const c = caseRow_(d.caseId);
  if (!c) throw new Error('找不到案件');
  const day = ymd_(d.date), why = String(d.reason || '').trim();
  if (!day) throw new Error('請選擇日期');
  if (!why) throw new Error('請寫原因，例如：等系統櫃進場');
  if (tryTable_('日誌豁免').some(x => x['案件ID'] === d.caseId && x['日期'] === day)) return true;
  appendRow_('日誌豁免', { 'ID': uid_(), '案件ID': d.caseId, '日期': day, '原因': why, '記錄人': me.id, '時間': now_() });
  return true;
}

/* ========== 進度頁補完：查驗紀錄、開案前 SOP、設計階段里程碑 ==========
 * 依 Boss 11/19 方向：查驗是「記錄與提醒」，不擋施工、不需主管逐項放行；有問題就照常下指示處理。
 * 暫定：負責設計師與主管可以記錄查驗、勾 SOP、維護里程碑（canPlan_）。
 */
function saveCheck_(me, d) {
  const it = planItem_(d.itemId), c = planGuard_(me, it['案件ID']);
  const all = tryTable_('查驗紀錄'), cur = all.find(x => x['工序ID'] === d.itemId && x['檢查ID'] === d.checkId);
  const tpl = tryTable_('範本_查驗清單').find(t => t['檢查ID'] === d.checkId) || {};
  const status = d.status === '有問題' ? '有問題' : '正常';
  if (status === '有問題' && !String(d.note || '').trim()) throw new Error('有問題請寫明狀況');
  const row = { '完成': d.done ? 'Y' : '', '狀態': d.done ? status : '', '備註': d.note || '', '檢查人': me.id, '檢查時間': now_() };
  if (d.photo) row['照片'] = saveImage_(d.photo, 'jpg', '查驗');
  if (cur) updateRow_('查驗紀錄', '紀錄ID', cur['紀錄ID'], row);
  else appendRow_('查驗紀錄', Object.assign({ '紀錄ID': uid_(), '案件ID': c['案件ID'], '工序ID': d.itemId, '查驗點': it['查驗點'], '檢查ID': d.checkId, '檢查項目': tpl['檢查項目'] || d.label || '' }, row));
  return true;
}

function applySop_(me, d) {
  const c = planGuard_(me, d.caseId);
  if (tryTable_('案件SOP').some(x => x['案件ID'] === d.caseId)) throw new Error('這個案件已經有 SOP 清單');
  const tpl = tryTable_('範本_開案SOP').filter(t => t['啟用'] !== 'N' && t['項目']).sort((a, b) => (+a['順序'] || 0) - (+b['順序'] || 0));
  tpl.forEach(t => appendRow_('案件SOP', { 'ID': uid_(), '案件ID': c['案件ID'], '項目ID': t['項目ID'], '項目': t['項目'], '順序': t['順序'], '負責角色': t['負責角色'] || '', '說明': t['說明'] || '' }));
  return tpl.length;
}
function setSop_(me, d) {
  const x = rowObj_(findRow_('案件SOP', 'ID', d.id)); planGuard_(me, x['案件ID']);
  updateRow_('案件SOP', 'ID', d.id, d.done ? { '完成': 'Y', '完成日': ymd_(d.date) || today_(), '完成人': me.id, '備註': d.note || x['備註'] || '' } : { '完成': '', '完成日': '', '完成人': '', '備註': d.note || x['備註'] || '' });
  return true;
}

/** 帶入設計階段里程碑範本：提案階段以提案日為 0、設計階段以設計約簽約日為 0（日曆天） */
function applyMilestones_(me, d) {
  const c = planGuard_(me, d.caseId), stage = d.stage === '設計' ? '設計' : '提案';
  const base = stage === '提案' ? c['提案日'] : c['設計約簽約日'];
  if (!base) throw new Error('請先在案件資料填寫' + (stage === '提案' ? '提案日' : '設計約簽約日'));
  if (tryTable_('里程碑').some(x => x['案件ID'] === d.caseId && x['階段'] === stage)) throw new Error('這個案件已經有「' + stage + '」里程碑');
  const tpl = tryTable_('範本_里程碑').filter(t => t['階段'] === stage && t['名稱']).sort((a, b) => (+a['順序'] || 0) - (+b['順序'] || 0));
  const bossId = bossId_(), b = base.split('/').map(Number);
  tpl.forEach(t => {
    const dt = new Date(Date.UTC(b[0], b[1] - 1, b[2]) + (+t['相對天數'] || 0) * 864e5), z = x => (x < 10 ? '0' : '') + x;
    const due = dt.getUTCFullYear() + '/' + z(dt.getUTCMonth() + 1) + '/' + z(dt.getUTCDate());
    appendRow_('里程碑', { '任務ID': uid_(), '案件ID': d.caseId, '階段': stage, '名稱': t['名稱'], '順序': t['順序'],
      '負責人': t['負責角色'] === 'Boss' ? bossId : (c['負責設計師'] || ''), '原定日期': due, '目前期限': due, '狀態': '未完成', '退回次數': 0 });
  });
  return tpl.length;
}
function saveMilestone_(me, d) {
  const c = planGuard_(me, d.caseId), due = ymd_(d.due), why = String(d.reason || '').trim();
  if (!String(d.name || '').trim()) throw new Error('請填寫名稱');
  if (!d.id) {
    appendRow_('里程碑', { '任務ID': uid_(), '案件ID': d.caseId, '階段': d.stage || c['階段'] || '', '名稱': String(d.name).trim(), '負責人': d.owner || '',
      '原定日期': due, '目前期限': due, '狀態': '未完成', '退回次數': 0 });
    return true;
  }
  const x = rowObj_(findRow_('里程碑', '任務ID', d.id));
  if (x['目前期限'] && due !== x['目前期限'] && !why) throw new Error('改期請填寫原因');
  updateRow_('里程碑', '任務ID', d.id, { '名稱': String(d.name).trim(), '負責人': d.owner || '', '目前期限': due,
    '改期原因': due !== x['目前期限'] ? (x['改期原因'] ? x['改期原因'] + '\n' : '') + today_() + ' ' + x['目前期限'] + '→' + due + '：' + why : x['改期原因'] });
  return true;
}
/** 完成／取消完成／退回（退回只限主管，計入退回次數） */
function setMilestone_(me, d) {
  const x = rowObj_(findRow_('里程碑', '任務ID', d.id)), c = caseRow_(x['案件ID']);
  const mine = x['負責人'] === me.id;
  if (d.act === 'return') {
    if (!me.leader) throw new Error('只有主管可以退回');
    updateRow_('里程碑', '任務ID', d.id, { '狀態': '未完成', '完成日': '', '退回次數': (+x['退回次數'] || 0) + 1,
      '備註': (x['備註'] ? x['備註'] + '\n' : '') + today_() + ' 退回（' + pname_(me.id) + '）：' + (d.reason || '') });
    return true;
  }
  if (!mine && !canPlan_(me, c)) throw new Error('只有負責人、負責設計師或主管可以更新');
  updateRow_('里程碑', '任務ID', d.id, d.act === 'done' ? { '狀態': '已完成', '完成日': today_() } : { '狀態': '未完成', '完成日': '' });
  return true;
}

/* ========== 共用：產生文件 PDF 並登記到「文件紀錄」 ========== */
function docHtml_(title, sub, body) {
  const logo = logoData_();
  return '<html><head><meta charset="utf-8"><style>'
    + 'body{font-family:"Noto Sans TC","Noto Sans CJK TC","Microsoft JhengHei",sans-serif;color:#2b2724;font-size:10.5pt;line-height:1.6}'
    + '.hd{width:100%;border-bottom:1.5pt solid #AF9263;padding-bottom:6pt}.hd td{vertical-align:bottom}'
    + '.tt{font-size:18pt;letter-spacing:3pt;font-weight:bold;text-align:right}.ts{font-size:9pt;color:#8a7f75;text-align:right}'
    + 'table.info{width:100%;border-collapse:collapse;margin-top:12pt}table.info td{border:0.6pt solid #e2d9cc;padding:4pt 7pt;font-size:10pt}table.info td.k{background:#f7f4ef;width:80pt;color:#7a7067}'
    + 'h2{font-size:11.5pt;margin:16pt 0 6pt;padding-left:6pt;border-left:3pt solid #AF9263}h3{font-size:10.5pt;margin:12pt 0 4pt}'
    + '.txt{white-space:pre-wrap}.issue{background:#f9ece9;color:#8a2f25;padding:6pt 9pt;white-space:pre-wrap}'
    + '.item{border:0.6pt solid #e2d9cc;padding:6pt 9pt;margin-bottom:6pt}.im{font-size:9pt;color:#7a7067}.st{font-size:9pt;color:#5b6f8c}'
    + 'table.grid{width:100%;border-collapse:collapse}table.grid td,table.grid th{border:0.6pt solid #e2d9cc;padding:3pt 6pt;font-size:9.5pt;text-align:left}table.grid th{background:#f7f4ef;font-weight:normal;color:#7a7067}'
    + 'table.ph td{width:50%;vertical-align:top;padding:4pt}.pn{font-size:9pt;color:#5a5048}'
    + '.sign{border:0.6pt solid #e2d9cc;padding:6pt;margin-top:6pt}.foot{margin-top:22pt;border-top:0.6pt solid #e2d9cc;padding-top:5pt;font-size:8.5pt;color:#8a7f75}.pb{page-break-before:always}'
    + '</style></head><body>'
    + '<table class="hd"><tr><td>' + (logo ? '<img src="' + logo + '" height="62">' : '<b>浩森設計 HOUSEN</b>') + '</td>'
    + '<td><div class="tt">' + h_(title) + '</div><div class="ts">' + h_(sub) + '</div></td></tr></table>'
    + body
    + '<div class="foot">產生時間 ' + fmt_(new Date(), 'yyyy/MM/dd HH:mm') + '<br>浩森設計 HOUSEN INTERIOR DESIGN</div></body></html>';
}
/** 存到「案件資料夾／子資料夾」，同一來源重新產生時覆蓋舊檔，並更新文件紀錄 */
function saveDoc_(me, c, sub, name, html, type, srcId) {
  const blob = Utilities.newBlob(html, 'text/html', 'doc.html').getAs('application/pdf').setName(name);
  const d = caseDir_(c), it = d.getFoldersByName(sub), dir = it.hasNext() ? it.next() : d.createFolder(sub);
  const docs = tryTable_('文件紀錄'), old = srcId ? docs.find(x => x['來源ID'] === srcId && x['文件類型'] === type) : null;
  if (old && old['檔案ID']) { try { DriveApp.getFileById(old['檔案ID']).setTrashed(true); } catch (e) { } }
  const file = dir.createFile(blob);
  const row = { '日期': today_(), '文件名稱': name, '檔案連結': file.getUrl(), '檔案ID': file.getId(), '產生人': me.id, '產生時間': now_() };
  if (old) updateRow_('文件紀錄', '文件ID', old['文件ID'], row);
  else appendRow_('文件紀錄', Object.assign({ '文件ID': uid_(), '案件ID': c['案件ID'], '文件類型': type, '對內對外': '對外', '來源ID': srcId || '' }, row));
  return file;
}
function pdfOut_(file) { return { name: file.getName(), data: Utilities.base64Encode(file.getBlob().getBytes()), url: file.getUrl() }; }

function ciBlock_(x) {
  const imp = x['影響費用或工期'] === 'Y'
    ? '<div class="im">影響費用或工期：' + (x['追加減金額'] ? '追加減 ' + h_(x['追加減金額']) + ' 元' : '') + (x['影響工期天數'] ? '　工期 ' + h_(x['影響工期天數']) + ' 天' : '') + '</div>' : '';
  const conf = x['鎖定'] === 'Y'
    ? '<div class="st">' + h_(x['確認狀態']) + '（' + h_(x['確認方式']) + '，' + h_(String(x['確認時間']).slice(0, 16)) + '）' + (x['確認備註'] ? '：' + h_(x['確認備註']) : '') + '</div>'
      + (x['客戶簽名'] ? '<div class="sign">客戶簽名<br><img src="' + photoData_(x['客戶簽名']) + '" height="70"></div>' : '')
    : '<div class="st">待客戶確認</div>';
  return '<div class="item"><div class="im">' + h_(x['日期']) + '・' + h_(x['來源']) + '・記錄人 ' + h_(pname_(x['記錄人'])) + '</div><div class="txt">' + h_(x['內容']) + '</div>' + imp + conf + '</div>';
}

/** 客戶確認單／會議記錄 PDF（d.meetingId 或 d.insId） */
function clientPdf_(me, d) {
  const all = tryTable_('客戶指示');
  let c, html, name, src, type;
  if (d.meetingId) {
    const m = rowObj_(findRow_('會議', '會議ID', d.meetingId)); c = caseRow_(m['案件ID']);
    const items = all.filter(x => x['會議ID'] === d.meetingId);
    html = docHtml_('會議記錄', c['案件名稱'] + '　' + m['日期'],
      '<table class="info"><tr><td class="k">案件</td><td>' + h_(c['案件名稱']) + '</td></tr><tr><td class="k">日期</td><td>' + h_(m['日期']) + '</td></tr><tr><td class="k">會議</td><td>' + h_(m['會議名稱']) + '</td></tr>'
      + (m['出席人'] ? '<tr><td class="k">出席</td><td>' + h_(m['出席人']) + '</td></tr>' : '') + '</table>'
      + (m['AI摘要'] ? '<h2>重點摘要</h2><div class="txt">' + h_(m['AI摘要']) + '</div>' + (m['核對人'] ? '<div class="im">已由 ' + h_(pname_(m['核對人'])) + ' 核對</div>' : '<div class="im">摘要尚未核對</div>') : '')
      + '<h2>決議與客戶指示（' + items.length + ' 項）</h2>' + (items.map(ciBlock_).join('') || '<div class="im">無</div>')
      + '<h2>客戶確認</h2><div class="txt">以上內容如無誤，請回覆「確認」；如有不同意見，請直接說明。</div>');
    name = '會議記錄_' + c['案件名稱'] + '_' + String(m['日期']).replace(/\//g, '-') + '.pdf'; src = d.meetingId; type = '會議記錄';
    updateRow_('會議', '會議ID', d.meetingId, { 'PDF時間': now_() });
  } else {
    const x = rowObj_(findRow_('客戶指示', '指示ID', d.insId)); c = caseRow_(x['案件ID']);
    html = docHtml_('客戶指示確認單', c['案件名稱'] + '　' + x['日期'],
      '<table class="info"><tr><td class="k">案件</td><td>' + h_(c['案件名稱']) + '</td></tr><tr><td class="k">施工地點</td><td>' + h_(c['地址']) + '</td></tr></table>'
      + '<h2>客戶指示內容</h2>' + ciBlock_(x) + '<h2>客戶確認</h2><div class="txt">以上內容如無誤，請回覆「確認」；如有不同意見，請直接說明。</div>');
    name = '客戶確認單_' + c['案件名稱'] + '_' + String(x['日期']).replace(/\//g, '-') + '_' + d.insId.slice(0, 4) + '.pdf'; src = d.insId; type = '客戶確認單';
  }
  if (!canCI_(me, c, null) && !me.leader) throw new Error('只有負責設計師或主管可以產生');
  return pdfOut_(saveDoc_(me, c, '客戶確認', name, html, type, src));
}

/* ========== 文件頁：週報、工程履歷 ==========
 * 只收「已簽核」的日誌（對外內容一致）；照片數量設上限避免檔案過大，完整照片在雲端資料夾。
 */
function logSection_(l, photos, insAll, maxPh) {
  const ph = activePhotos_(l['日誌ID'], photos).slice(0, maxPh);
  let t = '';
  for (let k = 0; k < ph.length; k += 2) t += '<tr>' + [ph[k], ph[k + 1]].map(p => p ? '<td><img src="' + photoData_(p['照片']) + '" width="230"><div class="pn">' + h_(p['說明'] || '') + '</div></td>' : '<td></td>').join('') + '</tr>';
  const ins = insAll.filter(i => i['日誌ID'] === l['日誌ID']);
  return '<h3>' + h_(l['日期']) + '　' + h_(String(l['工種'] || '').split(/\s*,\s*/).join('、')) + '　<span class="im">' + h_(pname_(l['填寫人'])) + '</span></h3>'
    + '<div class="txt">' + (h_(l['今日狀況']) || '（無）') + '</div>'
    + (l['發現問題'] ? '<div class="issue">' + h_(l['發現問題']) + '</div>' : '')
    + (t ? '<table class="ph">' + t + '</table>' : '')
    + ins.map(i => '<div class="item"><div class="txt">主管指示：' + h_(i['指示內容']) + '</div><div class="im">' + h_(insStatus_(i['狀態'])) + (i['負責人'] ? '・負責 ' + h_(pname_(i['負責人'])) : '') + (i['回報內容'] ? '・回報：' + h_(i['回報內容']) : '') + '</div></div>').join('');
}
function planTable_(items) {
  if (!items.length) return '<div class="im">尚未排定進度計畫</div>';
  return '<table class="grid"><tr><th>工序</th><th>計畫</th><th>實際</th><th>狀態</th></tr>' + items.map(r =>
    '<tr><td>' + h_(r['工序名稱']) + '</td><td>' + h_(String(r['目前計畫開始']).slice(5)) + '–' + h_(String(r['目前計畫完成']).slice(5)) + '</td><td>'
    + h_(String(r['實際開始'] || '').slice(5)) + (r['實際完成'] ? '–' + h_(String(r['實際完成']).slice(5)) : '') + '</td><td>' + (r['實際完成'] ? '完成' : r['實際開始'] ? '進行中' : '未開始') + '</td></tr>').join('') + '</table>';
}

/** 週報（d.from～d.to）或工程履歷（d.kind = 'resume'） */
function reportPdf_(me, d) {
  const c = planGuard_(me, d.caseId), cid = d.caseId;
  const photos = readTable_('日誌照片'), insAll = readTable_('主管指示').filter(i => i['案件ID'] === cid && i['指示內容']);
  const logs = readTable_('工程日誌').filter(l => l['案件ID'] === cid && logStatus_(l) === LS.SIGNED).sort((a, b) => (a['日期'] + a['建立時間']).localeCompare(b['日期'] + b['建立時間']));
  const plan = tryTable_('進度計畫').filter(r => r['案件ID'] === cid && r['狀態'] !== '取消').sort((a, b) => (+a['順序'] || 0) - (+b['順序'] || 0));
  const cis = tryTable_('客戶指示').filter(x => x['案件ID'] === cid);
  const info = '<table class="info"><tr><td class="k">案件</td><td>' + h_(c['案件名稱']) + '</td></tr><tr><td class="k">施工地點</td><td>' + h_(c['地址']) + '</td></tr><tr><td class="k">負責設計師</td><td>' + h_(pname_(c['負責設計師'])) + '</td></tr>';
  let html, name, type, src;
  if (d.kind === 'resume') {
    const meetings = tryTable_('會議').filter(m => m['案件ID'] === cid).sort((a, b) => String(a['日期']).localeCompare(String(b['日期'])));
    const checks = tryTable_('查驗紀錄').filter(x => x['案件ID'] === cid && x['完成'] === 'Y');
    const imp = cis.filter(x => x['影響費用或工期'] === 'Y' && x['確認狀態'] === '已確認'), sum = k => imp.reduce((a, x) => a + (+x[k] || 0), 0);
    let budget = 60, body = '';
    logs.forEach(l => { const n = Math.min(4, budget); budget -= Math.min(n, activePhotos_(l['日誌ID'], photos).length); body += logSection_(l, photos, insAll, n); });
    html = docHtml_('工程履歷', c['案件名稱'],
      info + (c['預計開工日'] ? '<tr><td class="k">預計工期</td><td>' + h_(c['預計開工日']) + '～' + h_(c['預計完工日']) + '</td></tr>' : '') + (c['實際完工日'] ? '<tr><td class="k">實際完工</td><td>' + h_(c['實際完工日']) + '</td></tr>' : '') + '</table>'
      + '<h2>工程進度</h2>' + planTable_(plan)
      + '<h2>追加減（客戶已確認）</h2>' + (imp.length ? imp.map(ciBlock_).join('') + '<div class="im">合計：' + sum('追加減金額') + ' 元，工期 ' + sum('影響工期天數') + ' 天</div>' : '<div class="im">無</div>')
      + '<h2>會議記錄</h2>' + (meetings.length ? meetings.map(m => '<h3>' + h_(m['日期']) + '　' + h_(m['會議名稱']) + '</h3>' + (m['AI摘要'] ? '<div class="txt">' + h_(m['AI摘要']) + '</div>' : '') + cis.filter(x => x['會議ID'] === m['會議ID']).map(ciBlock_).join('')).join('') : '<div class="im">無</div>')
      + '<h2>其他客戶指示</h2>' + (cis.filter(x => !x['會議ID']).map(ciBlock_).join('') || '<div class="im">無</div>')
      + '<h2>查驗紀錄</h2>' + (checks.length ? '<table class="grid"><tr><th>查驗點</th><th>項目</th><th>結果</th><th>說明</th></tr>' + checks.map(x => '<tr><td>' + h_(x['查驗點']) + '</td><td>' + h_(x['檢查項目']) + '</td><td>' + h_(x['狀態']) + '</td><td>' + h_(x['備註']) + '</td></tr>').join('') + '</table>' : '<div class="im">無</div>')
      + '<h2 class="pb">工程日誌（' + logs.length + ' 篇）</h2>' + (body || '<div class="im">無已簽核日誌</div>')
      + '<div class="im">照片最多收錄 60 張，完整照片請見案件雲端資料夾。</div>');
    name = '工程履歷_' + c['案件名稱'] + '_' + today_().replace(/\//g, '-') + '.pdf'; type = '工程履歷'; src = cid;
  } else {
    const from = ymd_(d.from), to = ymd_(d.to);
    if (!from || !to || to < from) throw new Error('請選擇正確的日期區間');
    const inRange = logs.filter(l => l['日期'] >= from && l['日期'] <= to);
    const openIns = insAll.filter(i => insStatus_(i['狀態']) !== IS.CLOSED);
    const ciR = cis.filter(x => x['日期'] >= from && x['日期'] <= to);
    const next = plan.filter(r => !r['實際完成'] && r['目前計畫開始'] && r['目前計畫開始'] <= fmt_(new Date(Date.now() + 14 * 864e5), 'yyyy/MM/dd'));
    html = docHtml_('工程週報', c['案件名稱'] + '　' + from + '～' + to,
      info + '<tr><td class="k">期間</td><td>' + h_(from) + '～' + h_(to) + '</td></tr></table>'
      + '<h2>本期施工（' + inRange.length + ' 篇已簽核日誌）</h2>' + (inRange.map(l => logSection_(l, photos, insAll, 2)).join('') || '<div class="im">本期沒有已簽核的日誌</div>')
      + '<h2>追蹤中事項</h2>' + (openIns.length ? openIns.map(i => '<div class="item"><div class="txt">' + h_(i['指示內容']) + '</div><div class="im">' + h_(insStatus_(i['狀態'])) + (i['期限'] ? '・期限 ' + h_(i['期限']) : '') + '</div></div>').join('') : '<div class="im">無</div>')
      + '<h2>本期客戶指示</h2>' + (ciR.map(ciBlock_).join('') || '<div class="im">無</div>')
      + '<h2>接下來兩週預計</h2>' + planTable_(next));
    name = '工程週報_' + c['案件名稱'] + '_' + from.replace(/\//g, '-') + '_' + to.replace(/\//g, '-') + '.pdf'; type = '週報'; src = cid + ':' + from + ':' + to;
  }
  return pdfOut_(saveDoc_(me, c, d.kind === 'resume' ? '工程履歷' : '週報', name, html, type, src));
}

/** 第一次安裝或新增權限時，在編輯器選這個函式按「執行」完成授權 */
function authorize() {
  secret_();
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=x', { muteHttpExceptions: true });
  CacheService.getScriptCache().get('x');
  Logger.log('授權完成');
}

/** 測試 PDF：在編輯器執行，會用最新一篇已簽核日誌產生 PDF，並在記錄中顯示檔案網址 */
function testPdf() {
  const l = readTable_('工程日誌').filter(x => x['日誌狀態'] === LS.SIGNED).pop();
  if (!l) { Logger.log('還沒有已簽核的日誌'); return; }
  Logger.log(makePdf_(l['日誌ID']).getUrl());
}
