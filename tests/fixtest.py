import asyncio, sys, json, urllib.request, urllib.parse
sys.path.insert(0,'/tmp/qa')
from pw import *
W,A='9002','9102'
R=[]
def ok(n,c,i=''): R.append(bool(c)); print(('PASS' if c else 'FAIL'),n,i)
def rows(n):
    t=json.loads(api(A,'/table?n='+urllib.parse.quote(n))); return [dict(zip(t[0],r)) for r in t[1:]]
def post(email,action,payload):
    return json.loads(urllib.request.urlopen(urllib.request.Request(f'http://localhost:{A}',data=json.dumps({'action':action,'token':email,'payload':payload}).encode())).read())
async def main():
    lid=post('kx@test.local','saveLog',{'caseId':'C1','date':'2026/11/19','trades':['木工'],'text':'照片測試','photos':[{'data':'/9j/4AAQ','note':'原說明'},{'data':'/9j/4AAQ','note':'要刪的'}],'submit':True})['data']
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        p=await open_app(b,W,A,'kx@test.local',tip=False)
        await p.click('[data-case] >> text=QA樣本甲'); await p.wait_for_timeout(900); await p.click('[data-tab=log]'); await p.wait_for_timeout(600)
        await p.evaluate(f"logForm(S.data.logs.find(l=>l.id==='{lid}'))"); await p.wait_for_timeout(500)
        await p.fill('#lph input[data-oi]', '改過的說明')
        await p.click('#lph [data-delold] >> nth=1'); await p.wait_for_timeout(200)
        ok('10a 按刪除只標記，還沒寫入', '按「儲存修改」後刪除' in await p.inner_text('#lph') and not [x for x in rows('日誌照片') if x['日誌ID']==lid and x['刪除時間']])
        await p.evaluate('closeSheet()'); await p.wait_for_timeout(300)
        ok('10b 關掉表單不存＝照片沒被刪、說明沒變', not [x for x in rows('日誌照片') if x['日誌ID']==lid and x['刪除時間']] and [x for x in rows('日誌照片') if x['日誌ID']==lid][0]['說明']=='原說明')
        await p.evaluate(f"logForm(S.data.logs.find(l=>l.id==='{lid}'))"); await p.wait_for_timeout(500)
        await p.fill('#lph input[data-oi]', '改過的說明'); await p.click('#lph [data-delold] >> nth=1'); await p.click('#lgo'); await p.wait_for_timeout(1200)
        ph=[x for x in rows('日誌照片') if x['日誌ID']==lid]
        ok('9/10c 儲存後：說明更新並記錄修改人、照片刪除', ph[0]['說明']=='改過的說明' and ph[0]['說明修改人']=='P04' and ph[1]['刪除時間'])
        # 案件資料只送改過的欄位
        pf=await open_app(b,W,A,'pf@test.local',tip=False)
        await pf.click('[data-case] >> text=QA樣本甲'); await pf.wait_for_timeout(900)
        rita=await open_app(b,W,A,'rita@test.local',tip=False)
        await rita.click('[data-case] >> text=QA樣本甲'); await rita.wait_for_timeout(900)
        await pf.click('#editCase'); await pf.wait_for_timeout(300); await pf.fill('#f_phone','0911222333'); await pf.click('#f_go'); await pf.wait_for_timeout(900)
        await rita.click('#editCase'); await rita.wait_for_timeout(300); await rita.fill('#f_addr','台中南屯新址'); await rita.click('#f_go'); await rita.wait_for_timeout(900)
        c=[x for x in rows('案件') if x['案件ID']=='C1'][0]
        ok('5 兩人同時開表單改不同欄位：都保留', c['客戶電話']=='0911222333' and c['地址']=='台中南屯新址', c['客戶電話']+' '+c['地址'])
        ok('金額：主管可看但不能改（欄位鎖住）', await pf.is_disabled('#f_fee') if await pf.query_selector('#f_fee') else True)
        await pf.evaluate('closeSheet()')
        # 簽名：先簽 → 切 LINE → 切回現場簽名 → 不可送出
        ci=post('pf@test.local','saveClientIns',{'caseId':'C1','text':'衣櫃到頂','date':'2026/11/19','owner':'P04','due':'2026/11/25'})['data']
        await pf.evaluate('refreshCase()'); await pf.click('[data-tab=client]'); await pf.wait_for_timeout(900)
        await pf.evaluate(f"ciConfirm(S.data.cins.find(x=>x.id==='{ci}'))"); await pf.wait_for_timeout(300)
        box=await pf.locator('#spad').bounding_box()
        await pf.mouse.move(box['x']+20,box['y']+30); await pf.mouse.down(); await pf.mouse.move(box['x']+120,box['y']+60,steps=5); await pf.mouse.up()
        await pf.click('#cmt button[data-v="LINE回覆"]'); await pf.click('#cmt button[data-v="現場簽名"]'); await pf.wait_for_timeout(200)
        await pf.click('#cgo'); await pf.wait_for_timeout(600)
        ok('6 切換方式後空白簽名不能送出', [x for x in rows('客戶指示') if x['指示ID']==ci][0]['鎖定']!='Y' and '請客戶在框內簽名' in await pf.inner_text('body'))
        await pf.mouse.move(box['x']+20,box['y']+30); await pf.mouse.down(); await pf.mouse.move(box['x']+120,box['y']+60,steps=5); await pf.mouse.up()
        await pf.click('#cgo'); await pf.wait_for_timeout(1200)
        x=[x for x in rows('客戶指示') if x['指示ID']==ci][0]
        ok('6b 重新簽名後可送出；客戶確認後仍是待執行', x['鎖定']=='Y' and x['執行狀態']=='待執行')
        # 執行追蹤
        await p.click('#backbtn') if await p.query_selector('#backbtn') else None
        await p.evaluate('renderHome()'); await p.evaluate('reloadHome().then(renderHome)'); await p.wait_for_timeout(1200)
        ok('8 執行人工作總表看到客戶指示', '衣櫃到頂' in await p.inner_text('#main'))
        await p.click('[data-gocins]'); await p.wait_for_timeout(1000)
        await p.evaluate(f"S.copen={{'{ci}':true}};render()"); await p.wait_for_timeout(300)
        await p.click(f'[data-crep="{ci}"]'); await p.fill('#cxt','木作已改 260cm'); await p.click('#cxgo'); await p.wait_for_timeout(1000)
        ok('8 執行人回報', [x for x in rows('客戶指示') if x['指示ID']==ci][0]['執行狀態']=='已回報')
        await pf.evaluate('refreshCase().then(render)'); await pf.wait_for_timeout(900)
        await pf.evaluate(f"S.copen={{'{ci}':true}};render()"); await pf.wait_for_timeout(300)
        await pf.click(f'[data-cdone="{ci}"]'); await pf.click('#cxgo'); await pf.wait_for_timeout(1000)
        ok('8 負責設計師確認完成', [x for x in rows('客戶指示') if x['指示ID']==ci][0]['執行狀態']=='已完成')
        await pf.screenshot(path='shots/fix_cins.png',full_page=True)
        # 過期畫面
        await p.evaluate(f"S.tab='log';render()"); await p.wait_for_timeout(300)
        post('pf@test.local','updateLog',{'id':lid,'date':'2026/11/19','trades':['木工'],'text':'蘋芳剛改的'})
        await p.evaluate(f"logForm(S.data.logs.find(l=>l.id==='{lid}'))"); await p.wait_for_timeout(400)
        await p.fill('#ltxt','凱翔用舊畫面'); await p.click('#lgo'); await p.wait_for_timeout(900)
        ok('5 日誌：舊畫面存檔被擋並提示重新打開', [x for x in rows('工程日誌') if x['日誌ID']==lid][0]['今日狀況']=='蘋芳剛改的' and '重新打開' in await p.inner_text('body'))
        print('errors', p.errs+pf.errs+rita.errs)
        await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
asyncio.run(main())
