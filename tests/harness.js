// 獨立測試資料＋模擬 Google 服務，用來跑真正的後端程式（不連正式試算表）
const fs=require('fs');
module.exports=function(backendPath){
const T={
 '人員':[['人員ID','姓名','Email','職稱','系統角色','可看金額','可看績效','在職'],['P01','林柏元','boss@test.local','','Boss','Y','Y','Y'],['P02','林妙娟','rita@test.local','','行政','Y','Y','Y'],['P03','施蘋芳','pf@test.local','','主管','N','N','Y'],['P04','許凱翔','kx@test.local','','設計師','N','N','Y'],['P05','施明媛','candy@test.local','','行政','Y','Y','Y']],
 '工種清單':[['工種','色碼','排序','啟用'],['木工','#8A6A4B','1','Y'],['水電','#5B6F8C','2','Y']],
 '案件':[['案件ID','案件名稱','客戶姓名','客戶電話','客戶LINE','地址','類型','來源','負責設計師','階段','狀態','建立日期','提案日','設計約簽約日','工程約簽約日','預計開工日','預計完工日','實際完工日','結案日','保固到期日','Drive資料夾','設計費','工程金額','備註','最後修改時間','最後修改人','進度定案時間','進度定案人'],
   ['C1','QA樣本甲・南屯住宅','王','0900000001','','台中南屯','住宅','轉介','P03','施工','進行中','2026/11/10','','','','','','','','','','300000','2500000',''],
   ['C2','QA樣本乙・超長案件名稱用來測試換行是否正常顯示ExtremelyLongEnglishProjectNameWithoutSpaces','李','','','https://example.com/a/very/long/address/path/that/should/wrap/properly','住宅','','P04','施工','進行中','2026/11/12','','','','','','','','','','','','']],
 '工程日誌':[['日誌ID','案件ID','日期','工種','今日狀況','進度百分比','發現問題','填寫人','建立時間','最後修改時間','修改次數','最後修改人','日誌狀態','送出時間','簽核人','簽核期限','轉Boss確認','簽核者','簽核時間','簽核內容','修改待簽','小修待看','退回原因','PDF檔ID','PDF時間','修訂時間','分享次數','最後分享人','最後分享時間','下載次數','最後下載人','最後下載時間','PDF錯誤'],
   ['L1','C1','2026/11/18','木工','天花板角材進場','','','P04','2026/11/18 10:00:00','2026/11/18 11:00:00','1','P04','已簽核','2026/11/18 10:00:00','P03','2026/11/19 12:00','','P03','2026/11/18 12:00:00','{"date":"2026/11/18","trades":"木工","text":"天花板角材進場","issue":"","photos":[]}','','Y','','FILE_L1','2026/11/18 12:00:00','2026/11/18 11:00:00','2','P03','2026/11/18 13:00:00','0','',''],
   ['L2','C2','2026/11/18','水電','參考網址 https://www.example.com/some/really/long/url/with/no/breaks/abcdefghijklmnopqrstuvwxyz 確認','','','P04','2026/11/18 10:00:00','','0','','已簽核','','P03','','','P03','2026/11/18 12:00:00','{}','','','','','','','0','','','0','','']],
 '進度計畫':[['工序ID','案件ID','順序','工種','工序名稱','原計畫開始','原計畫完成','目前計畫開始','目前計畫完成','實際開始','實際完成','查驗點','改期原因','關聯客戶指示ID','狀態','實際開始確認人','實際完成確認人','範本工序ID','最後修改人','最後修改時間']],
 '進度異動紀錄':[['紀錄ID','案件ID','工序ID','項目','原值','新值','原因','修改人','時間']],
 '範本_工序':[['工序ID','順序','工種','工序名稱','標準工期（工作天）','查驗點','備註','啟用'],['W01','1','保護工程','保護工程','1'],['W02','2','拆除','拆除與清運','3'],['W03','3','水電','水電配管','5','水電封板前'],['W04','4','冷氣','冷氣管路','2','','可與水電同步'],['W05','5','泥作','砌牆、粉光','6'],['W06','6','防水','浴室防水與試水','3','防水試水'],['W07','7','木工','木作','12','木作封板前']],
 '會議':[['會議ID','案件ID','日期','會議名稱','出席人','錄音檔','AI摘要','核對人','核對時間','記錄人','建立時間','PDF時間']],
 '客戶指示':[['指示ID','案件ID','會議ID','類型','來源','日期','內容','影響費用或工期','追加減金額','影響工期天數','確認狀態','確認方式','客戶簽名','確認截圖','確認時間','記錄人','鎖定','確認備註','建立時間','最後修改人','最後修改時間','執行人','執行期限','執行狀態','處理回報','回報時間','回報人','完成確認人','完成時間']],
 '文件紀錄':[['文件ID','案件ID','日期','文件名稱','文件類型','對內對外','檔案連結','產生人','檔案ID','來源ID','產生時間']],
 '查驗紀錄':[['紀錄ID','案件ID','查驗點','檢查ID','檢查項目','照片','完成','狀態','放行人','放行時間','備註','工序ID','檢查人','檢查時間']],
 '範本_查驗清單':[['檢查ID','查驗點','順序','檢查項目','需拍照','啟用'],['Q01','水電封板前','1','全室管線照片（含標示）','Y'],['Q02','水電封板前','2','插座、開關位置對照圖面','Y'],['Q03','水電封板前','3','冷熱水管保壓測試','Y']],
 '案件SOP':[['ID','案件ID','項目ID','項目','完成','完成日','完成人','備註','順序','負責角色','說明']],
 '範本_開案SOP':[['項目ID','順序','項目','說明','負責角色','啟用'],['SOP01','1','全套圖面完成','','設計師','Y'],['SOP02','2','圖面完整性檢查','','Boss','Y'],['SOP03','3','大樓／管委會裝修申請','','設計師','Y']],
 '里程碑':[['任務ID','案件ID','階段','名稱','負責人','原定日期','目前期限','完成日','狀態','退回次數','改期原因','備註','順序']],
 '範本_里程碑':[['里程碑ID','階段','順序','名稱','負責角色','相對天數','說明','啟用'],['M01','提案','1','接洽、記錄需求','Boss','-8'],['M02','提案','2','現場丈量','設計師','-6'],['M03','提案','3','平面配置','設計師','-3'],['M08','提案','8','客戶現場提案','Boss','0'],['D01','設計','1','設計約簽回','Boss','0'],['D02','設計','2','平面配置定稿','設計師','7']],
 '公司設定':[['項目','值','說明'],['延誤警告門檻（天）','1',''],['保固年限','1','']],
 '保固報修':[['報修ID','案件ID','報修日期','內容','負責人','狀態','處理結果','完成日','記錄人','建立時間']],
 '範本建議':[['建議ID','來源','來源ID','案件ID','範本','內容','提出人','提出時間','狀態','處理人','處理時間','處理備註']],
 '日誌豁免':[['ID','案件ID','日期','原因','記錄人','時間']],
 '日誌照片':[['照片ID','日誌ID','案件ID','照片','空間','位置','說明','拍攝時間','刪除時間','刪除人','說明修改人','說明修改時間']],
 '主管指示':[['指示ID','案件ID','日誌ID','指示內容','負責人','期限','狀態','回報內容','回報時間','結案時間','退回次數','下指示人','建立時間']],
 '待辦':[['待辦ID','案件ID','內容','負責人','期限','狀態','建立人','建立時間','完成時間'],['D1','C1','確認燈具型號','P01','2026/11/20','未完成','P01','2026/11/18 09:00:00',''],['D2','','整理報價單','P04','','未完成','P04','2026/11/18 09:00:00','']],
};
function sheet(n){const v=T[n];return{
 getDataRange:()=>({getDisplayValues:()=>v.map(r=>v[0].map((_,i)=>r[i]==null?'':String(r[i]))),getValues:()=>v.map(r=>v[0].map((_,i)=>r[i]==null?'':r[i]))}),
 getRange:(r,c,nr,nc)=>({getValues:()=>[v[r-1].slice(c-1,c-1+nc)],setValue:x=>{v[r-1][c-1]=x}}),
 getLastColumn:()=>v[0].length, appendRow:row=>v.push(row.slice()), deleteRow:r=>v.splice(r-1,1)}}
let uid=0;const G={};
G.SpreadsheetApp={openById:()=>({getSheetByName:sheet})};
G.Utilities={getUuid:()=>'id'+(++uid)+'xxxxxxxxxxxx',formatDate:(d,tz,p)=>{const z=new Date(d.getTime()+8*3600e3);const P=n=>String(n).padStart(2,'0');return p.replace('yyyy',z.getUTCFullYear()).replace('MM',P(z.getUTCMonth()+1)).replace('dd',P(z.getUTCDate())).replace('HH',P(z.getUTCHours())).replace('mm',P(z.getUTCMinutes())).replace('ss',P(z.getUTCSeconds())).replace(/^u$/,String(z.getUTCDay()||7))},
 base64Encode:b=>Buffer.from(b).toString('base64'),base64Decode:s=>Buffer.from(s,'base64'),
 newBlob:()=>({getAs:()=>({setName:n=>({name:n})})})};
const files={FILE_L1:{name:'工程日誌_QA樣本甲_2026-11-18_L1.pdf'}};let fid=0;
const mkFile=(id)=>({getId:()=>id,getName:()=>files[id].name,getUrl:()=>'https://drive.google.com/file/d/'+id+'/view',getBlob:()=>({getBytes:()=>Buffer.from('%PDF-1.4 '+id)}),setTrashed:()=>{files[id].trashed=true},isTrashed:()=>!!files[id].trashed});
const folder={getFoldersByName:()=>({hasNext:()=>true,next:()=>folder}),createFolder:()=>folder,getUrl:()=>'https://drive.google.com/drive/folders/QA',getFilesByName:()=>({hasNext:()=>false}),createFile:(b)=>{if(globalThis.FAIL_CREATE)throw new Error("模擬建檔失敗");const id='GEN'+(++fid);files[id]={name:b.name};return mkFile(id)}};
G.DriveApp={getFileById:id=>files[id]?mkFile(id):{getParents:()=>({next:()=>folder})},getFolderById:id=>{if(id==='BAD')throw new Error('no');return Object.assign({},folder,{getUrl:()=>'https://drive.google.com/drive/folders/'+id})}};
G.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
G.CacheService={getScriptCache:()=>({get:()=>'AAAA',put(){}})};
G.UrlFetchApp={fetch:()=>({getContent:()=>[0]})};
G.PropertiesService={getScriptProperties:()=>({getProperty:()=>'s',setProperty(){}})};
G.Logger={log(){}};
const src=fs.readFileSync(backendPath,'utf8');
const m={};
new Function(...Object.keys(G),'exp',src+';exp.run_=run_;exp.reset=()=>{_people=null;}')(...Object.values(G),m);
return {run:(...a)=>{m.reset();return m.run_(...a)},T,files};
};
