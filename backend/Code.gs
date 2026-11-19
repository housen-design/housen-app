/**
 * 浩森設計工作管理系統｜後端 v3.1（日誌簽核與 PDF；分享／下載分開記錄、唯讀查看 PDF）
 * 資料庫：Google Sheet「浩森設計工作管理系統_資料庫」（與 AppSheet 共用）
 * 所有前端呼叫都走 api(action, payload)，之後改成 PWA 時只需換「身分驗證」這一層。
 * 欄位一律用「表頭名稱」對應，不依賴欄位順序。
 */

const SS_ID = '1Trazrz1jfOxTaPFA43hb9YFubU5uSaGUZAnD4sWXrCw';
const PHOTO_DIR = '日誌照片_Images';
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
  const READ = { home: getHome_, case: getCase_, thumbs: getThumbs_, pdfView: pdfView_ };   // 只讀，預覽模式也可用
  const SLOW = { pdfLog: pdfLog_ };   // 產生 PDF 較久，不鎖住其他人
  const WRITE = {
    saveLog: saveLog_, updateLog: updateLog_, deletePhoto: deletePhoto_,
    submitLog: submitLog_, confirmLog: confirmLog_, signLog: signLog_, returnLog: returnLog_,
    escalateLog: escalateLog_, seenLog: seenLog_, shareLog: shareLog_,
    saveIns: saveIns_, actIns: actIns_, saveTodo: saveTodo_, setTodo: setTodo_,
    saveCase: saveCase_, setStage: setStage_, saveTrade: saveTrade_
  };
  if (READ[action]) return READ[action](me, payload);
  if (SLOW[action]) { if (me.preview) throw new Error('預覽模式只能看'); return SLOW[action](me, payload); }
  if (WRITE[action]) {
    if (me.preview) throw new Error('預覽模式只能看，不能存檔');
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
  return { me, people, trades, cases, items, today: today_(), now: fmt_(new Date(), 'yyyy/MM/dd HH:mm'), testMode: TEST_MODE };
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
  return { info: c, logs, ins, todos };
}

function getThumbs_(me, p) {
  const dir = photoDir_(), out = {};
  (p.paths || []).forEach(path => {
    try {
      const it = dir.getFilesByName(String(path).split('/').pop());
      if (!it.hasNext()) return;
      const f = it.next(), blob = f.getThumbnail() || f.getBlob();
      out[path] = { src: 'data:image/jpeg;base64,' + Utilities.base64Encode(blob.getBytes()), url: f.getUrl() };
    } catch (e) { }
  });
  return out;
}

let _photoDir;
function photoDir_() {
  if (_photoDir) return _photoDir;
  const parent = DriveApp.getFileById(SS_ID).getParents().next();
  const it = parent.getFoldersByName(PHOTO_DIR);
  return (_photoDir = it.hasNext() ? it.next() : parent.createFolder(PHOTO_DIR));
}

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
    const it = photoDir_().getFilesByName(String(path).split('/').pop());
    if (it.hasNext()) return 'data:image/jpeg;base64,' + Utilities.base64Encode(it.next().getBlob().getBytes());
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
  updateRow_('案件', '案件ID', d.id, { '階段': d.stage });
  return true;
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
