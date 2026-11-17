/**
 * 浩森設計工作管理系統｜後端 v2
 * 資料庫：Google Sheet「浩森設計工作管理系統_資料庫」（與 AppSheet 共用）
 * 所有前端呼叫都走 api(action, payload)，之後改成 PWA 時只需換「身分驗證」這一層。
 * 欄位一律用「表頭名稱」對應，不依賴欄位順序。
 */

const SS_ID = '1Trazrz1jfOxTaPFA43hb9YFubU5uSaGUZAnD4sWXrCw';
const PHOTO_DIR = '日誌照片_Images';
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
  const READ = { home: getHome_, case: getCase_, thumbs: getThumbs_ };
  const WRITE = {
    saveLog: saveLog_, updateLog: updateLog_, deletePhoto: deletePhoto_,
    saveIns: saveIns_, actIns: actIns_, saveTodo: saveTodo_, setTodo: setTodo_,
    saveCase: saveCase_, setStage: setStage_, saveTrade: saveTrade_
  };
  if (READ[action]) return READ[action](me, payload);
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
  const v = sh.getDataRange().getValues();
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

function uid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 8); }
function fmt_(d, p) { return Utilities.formatDate(d, 'Asia/Taipei', p); }
function today_() { return fmt_(new Date(), 'yyyy/MM/dd'); }
function now_() { return fmt_(new Date(), 'yyyy/MM/dd HH:mm:ss'); }
function ymd_(s) { return s ? String(s).replace(/-/g, '/') : ''; }

function person_(p) {
  return {
    id: p['人員ID'], name: p['姓名'], email: (p['Email'] || '').toLowerCase(), title: p['職稱'], role: p['系統角色'],
    leader: LEADER_ROLES.indexOf(p['系統角色']) >= 0, seeMoney: p['可看金額'] === 'Y', seePerf: p['可看績效'] === 'Y'
  };
}
function user_(email) {
  email = String(email || '').toLowerCase();
  const p = readTable_('人員').find(x => (x['Email'] || '').toLowerCase() === email && x['在職'] !== 'N');
  if (!p) throw new Error('你的帳號（' + (email || '未登入') + '）不在「人員」名單中，請聯絡管理者。');
  return person_(p);
}
function userById_(id) {
  const p = readTable_('人員').find(x => x['人員ID'] === id);
  if (!p) throw new Error('找不到人員');
  return person_(p);
}

/* ========== 讀取 ========== */

function getHome_(me) {
  const people = readTable_('人員').filter(p => p['在職'] !== 'N').map(p => {
    const x = person_(p); return { id: x.id, name: x.name, role: x.role, leader: x.leader };
  });
  const trades = readTable_('工種清單').filter(t => t['啟用'] !== 'N')
    .sort((a, b) => (+a['排序'] || 0) - (+b['排序'] || 0))
    .map(t => ({ name: t['工種'], color: t['色碼'] }));
  const logs = readTable_('工程日誌');
  const ins = readTable_('主管指示').filter(i => i['指示內容']);
  const todos = readTable_('待辦');
  const cases = readTable_('案件').map(c => {
    const cl = logs.filter(l => l['案件ID'] === c['案件ID']).map(l => l['日期']).sort();
    return {
      id: c['案件ID'], name: c['案件名稱'], client: c['客戶姓名'], address: c['地址'],
      stage: c['階段'], status: c['狀態'], designer: c['負責設計師'],
      lastLog: cl.length ? cl[cl.length - 1] : '',
      openIns: ins.filter(i => i['案件ID'] === c['案件ID'] && i['狀態'] !== '已結案').length
    };
  });
  const cname = id => (cases.find(c => c.id === id) || {}).name || '';
  // 我的待辦 = 自己的待辦事項 + 交給我的指示 + 等我確認的指示
  const items = [];
  todos.filter(t => t['負責人'] === me.id).forEach(t => items.push({
    kind: 'todo', id: t['待辦ID'], caseId: t['案件ID'], caseName: cname(t['案件ID']), text: t['內容'],
    due: t['期限'], done: t['狀態'] === '已完成', doneAt: t['完成時間'], from: t['建立人'], created: t['建立時間']
  }));
  ins.filter(i => (i['負責人'] === me.id && i['狀態'] !== '已結案') || (i['下指示人'] === me.id && i['狀態'] === '待確認'))
    .forEach(i => items.push({
      kind: 'ins', id: i['指示ID'], caseId: i['案件ID'], caseName: cname(i['案件ID']), text: i['指示內容'],
      due: i['期限'], status: i['狀態'], to: i['負責人'], from: i['下指示人'], created: i['建立時間'],
      mine: i['負責人'] === me.id
    }));
  return { me, people, trades, cases, items, today: today_(), testMode: TEST_MODE };
}

function getCase_(me, p) {
  const c = readTable_('案件').find(x => x['案件ID'] === p.id);
  if (!c) throw new Error('找不到案件');
  if (!me.seeMoney) { delete c['設計費']; delete c['工程金額']; }
  const photos = readTable_('日誌照片').filter(x => x['案件ID'] === p.id);
  const logs = readTable_('工程日誌').filter(l => l['案件ID'] === p.id).map(l => ({
    id: l['日誌ID'], date: l['日期'], trades: (l['工種'] || '').split(/\s*,\s*/).filter(String),
    text: l['今日狀況'], issue: l['發現問題'], by: l['填寫人'], created: l['建立時間'],
    edited: l['最後修改時間'], edits: +l['修改次數'] || 0, editor: l['最後修改人'],
    photos: photos.filter(x => x['日誌ID'] === l['日誌ID']).map(x => ({ id: x['照片ID'], path: x['照片'], note: x['說明'] || [x['空間'], x['位置']].filter(String).join('・') }))
  })).sort((a, b) => (b.date + b.created).localeCompare(a.date + a.created));
  const ins = readTable_('主管指示').filter(i => i['案件ID'] === p.id && i['指示內容']).map(i => ({
    id: i['指示ID'], logId: i['日誌ID'], text: i['指示內容'], to: i['負責人'], due: i['期限'],
    status: i['狀態'], reply: i['回報內容'], returns: +i['退回次數'] || 0, from: i['下指示人'], created: i['建立時間']
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

function photoDir_() {
  const parent = DriveApp.getFileById(SS_ID).getParents().next();
  const it = parent.getFoldersByName(PHOTO_DIR);
  return it.hasNext() ? it.next() : parent.createFolder(PHOTO_DIR);
}

/* ========== 寫入 ========== */

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

/** 新增日誌。建立時間由系統寫入、之後不能改，用來判斷是否補登。 */
function saveLog_(me, d) {
  if (!d.caseId) throw new Error('缺少案件');
  const id = uid_();
  appendRow_('工程日誌', {
    '日誌ID': id, '案件ID': d.caseId, '日期': ymd_(d.date) || today_(), '工種': (d.trades || []).join(' , '),
    '今日狀況': d.text || '', '發現問題': d.issue || '', '填寫人': me.id, '建立時間': now_(), '修改次數': 0
  });
  savePhotos_(d.caseId, id, d.photos);
  return id;
}

/** 修改日誌：每個人都能改；建立時間與填寫人不變，記錄最後修改人、時間與次數 */
function updateLog_(me, d) {
  const f = findRow_('工程日誌', '日誌ID', d.id);
  const caseId = f.vals[f.head.indexOf('案件ID')];
  const n = +f.vals[f.head.indexOf('修改次數')] || 0;
  updateRow_('工程日誌', '日誌ID', d.id, {
    '日期': ymd_(d.date), '工種': (d.trades || []).join(' , '), '今日狀況': d.text || '', '發現問題': d.issue || '',
    '最後修改時間': now_(), '修改次數': n + 1, '最後修改人': me.id
  });
  savePhotos_(caseId, d.id, d.photos);
  return d.id;
}

function deletePhoto_(me, d) {
  const f = findRow_('日誌照片', '照片ID', d.id);
  const logId = f.vals[f.head.indexOf('日誌ID')], path = f.vals[f.head.indexOf('照片')];
  f.sh.deleteRow(f.row);
  updateRow_('工程日誌', '日誌ID', logId, { '最後修改時間': now_(), '最後修改人': me.id });
  try { const it = photoDir_().getFilesByName(String(path).split('/').pop()); if (it.hasNext()) it.next().setTrashed(true); } catch (e) { }
  return true;
}

function saveIns_(me, d) {
  if (!me.leader) throw new Error('只有主管可以下指示');
  if (!d.text) throw new Error('請填寫指示內容');
  const id = uid_();
  appendRow_('主管指示', {
    '指示ID': id, '案件ID': d.caseId, '日誌ID': d.logId || '', '指示內容': d.text, '負責人': d.to || '',
    '期限': ymd_(d.due), '狀態': '處理中', '退回次數': 0, '下指示人': me.id, '建立時間': now_()
  });
  return id;
}

function actIns_(me, d) {
  const f = findRow_('主管指示', '指示ID', d.id), g = c => f.vals[f.head.indexOf(c)];
  if (d.act === 'reply') {
    if (g('負責人') !== me.id) throw new Error('只有負責人可以回報');
    updateRow_('主管指示', '指示ID', d.id, { '回報內容': d.text || '', '回報時間': now_(), '狀態': '待確認' });
  } else if (d.act === 'close' || d.act === 'return') {
    if (g('下指示人') !== me.id && me.role !== 'Boss') throw new Error('只有下指示的人可以結案或退回');
    if (d.act === 'close') updateRow_('主管指示', '指示ID', d.id, { '狀態': '已結案', '結案時間': now_() });
    else updateRow_('主管指示', '指示ID', d.id, {
      '狀態': '處理中', '退回次數': (+g('退回次數') || 0) + 1,
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
