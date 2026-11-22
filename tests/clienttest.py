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
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        p=await open_app(b,W,A,'pf@test.local',tip=False)
        await p.click('[data-case] >> text=QA樣本甲'); await p.wait_for_timeout(500); await p.click('[data-tab=client]'); await p.wait_for_timeout(300)
        await p.screenshot(path='shots/client_empty.png')
        # 臨時客戶指示（影響費用）
        await p.click('#fab'); await p.wait_for_timeout(200)
        await p.click('#csrc button[data-v="LINE"]'); await p.fill('#ct','主臥衣櫃改成到頂，門片改灰色'); await p.click('#cimp button[data-v="Y"]'); await p.fill('#ca','18000'); await p.fill('#cdy','2')
        await p.click('#cgo'); await p.wait_for_timeout(700)
        x=[r for r in rows('客戶指示')][-1]
        ok('記錄臨時客戶指示', x['類型']=='臨時性' and x['來源']=='LINE' and x['影響費用或工期']=='Y' and x['追加減金額']=='18000' and x['確認狀態']=='待確認')
        # 現場簽名確認
        await p.click(f'[data-cid="{x["指示ID"]}"] .phead'); await p.click(f'[data-cconf="{x["指示ID"]}"]'); await p.wait_for_timeout(300)
        await p.click('#cgo'); await p.wait_for_timeout(300); ok('沒簽名不能登記', '簽名' in await p.inner_text('#toast'))
        box=await p.locator('#spad').bounding_box()
        await p.mouse.move(box['x']+30,box['y']+60); await p.mouse.down(); await p.mouse.move(box['x']+150,box['y']+100,steps=8); await p.mouse.move(box['x']+260,box['y']+50,steps=8); await p.mouse.up()
        await p.screenshot(path='shots/client_sign.png')
        await p.click('#cgo'); await p.wait_for_timeout(800)
        x=[r for r in rows('客戶指示') if r['指示ID']==x['指示ID']][0]
        ok('簽名存檔並鎖定', x['鎖定']=='Y' and x['確認方式']=='現場簽名' and x['客戶簽名'].startswith('客戶確認_Images/簽名.'), x['客戶簽名'])
        r=post('pf@test.local','saveClientIns',{'caseId':'C1','id':x['指示ID'],'text':'改'}); ok('確認後內容不能修改（只能改執行人／期限）', [y for y in rows('客戶指示') if y['指示ID']==x['指示ID']][0]['內容']!='改', r.get('error',''))
        # 會議＋決議
        await p.click('#addMeet'); await p.fill('#mn','泥作完成階段驗收'); await p.fill('#ma','王先生、蘋芳、泥作師傅'); await p.fill('#ms','1. 浴室磁磚縫改深灰\n2. 陽台排水加一個落水頭'); await p.click('#mgo'); await p.wait_for_timeout(700)
        m=rows('會議')[-1]; ok('新增會議', m['會議名稱']=='泥作完成階段驗收' and not m['核對人'])
        await p.click(f'[data-cid="{m["會議ID"]}"] .phead'); await p.click(f'[data-mitem="{m["會議ID"]}"]'); await p.fill('#ct','陽台加一個落水頭'); await p.click('#cimp button[data-v="Y"]'); await p.fill('#ca','3500'); await p.click('#cgo'); await p.wait_for_timeout(700)
        it=rows('客戶指示')[-1]; ok('會議決議記為會議性', it['類型']=='會議性' and it['會議ID']==m['會議ID'] and it['來源']=='會議')
        if not await p.is_visible(f'[data-mrev="{m["會議ID"]}"]'): await p.click(f'[data-cid="{m["會議ID"]}"] .phead')
        await p.click(f'[data-mrev="{m["會議ID"]}"]'); await p.wait_for_timeout(700)
        ok('設計師核對摘要', rows('會議')[-1]['核對人']=='P03')
        r=post('pf@test.local','saveMeeting',{'caseId':'C1','id':m['會議ID'],'name':'泥作完成階段驗收','summary':'改過'}); ok('摘要修改後需重新核對', r['ok'] and rows('會議')[-1]['核對人']=='')
        await p.screenshot(path='shots/client_list.png',full_page=True)
        # PDF
        r=post('pf@test.local','clientPdf',{'meetingId':m['會議ID']}); ok('會議記錄 PDF', r['ok'] and r['data']['name'].startswith('會議記錄_'), r.get('error',''))
        r=post('pf@test.local','clientPdf',{'meetingId':m['會議ID']}); docs=[d for d in rows('文件紀錄') if d['來源ID']==m['會議ID']]
        ok('重新產生覆蓋同一筆文件紀錄', len(docs)==1)
        r=post('kx@test.local','clientPdf',{'insId':x['指示ID']}); ok('非負責人不能產生確認單', not r['ok'])
        r=post('pf@test.local','clientPdf',{'insId':x['指示ID']}); ok('客戶確認單 PDF', r['ok'])
        # 追加減一覽
        txt=await p.inner_text('#main'); ok('追加減一覽合計', 'NT$ 18,000' in txt and 'NT$ 3,500' in txt)
        # 其他同事可記錄、但不能改別人的
        r=post('kx@test.local','saveClientIns',{'caseId':'C1','text':'客戶問能否加裝感應燈','source':'口頭'}); ok('同事可以記錄客戶指示', r['ok'])
        r=post('candy@test.local','saveClientIns',{'caseId':'C1','id':r['data'],'text':'改'}); ok('不能改別人記錄的', not r['ok'])
        # 預覽
        p3=await open_app(b,W,A,'boss@test.local',tip=False); await p3.click('[data-as="P04"]'); await p3.wait_for_timeout(700); await p3.click('[data-case] >> text=QA樣本甲'); await p3.wait_for_timeout(500); await p3.click('[data-tab=client]'); await p3.wait_for_timeout(300)
        ok('預覽沒有新增與確認按鈕', not await p3.is_visible('#fab') and not await p3.query_selector('#addMeet'))
        print('errors', p.errs+p3.errs)
        await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
asyncio.run(main())
