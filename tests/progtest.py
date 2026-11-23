import asyncio, sys, json, urllib.request, urllib.parse
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from pw import *
R=[]
def ok(n,c,i=''): R.append(bool(c)); print(('PASS' if c else 'FAIL'),n,i)
def table(n): return json.loads(api(A,'/table?n='+urllib.parse.quote(n)))
def rows(n):
    t=table(n); return [dict(zip(t[0],r)) for r in t[1:]]
def post(email,action,payload):
    return json.loads(urllib.request.urlopen(urllib.request.Request(f'http://localhost:{A}',data=json.dumps({'action':action,'token':email,'payload':payload}).encode())).read())
async def main():
    # 準備：C1 設預計開工日、加一篇水電日誌（測試資料）
    post('pf@test.local','saveCaseInfo',{'id':'C1','fields':{'預計開工日':'2026-11-23'}})
    post('kx@test.local','saveLog',{'caseId':'C1','date':'2026-11-25','trades':['水電'],'text':'水電材料進場','submit':True})
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        p=await open_app(b,W,A,'pf@test.local',tip=False); await p.click('[data-case] >> text=QA樣本甲'); await p.wait_for_timeout(500); await p.click('[data-tab=prog]'); await p.wait_for_timeout(300)
        await p.screenshot(path=SHOTS+'/prog_empty.png')
        await p.click('#ptpl'); await p.wait_for_timeout(800)
        pl=[r for r in rows('進度計畫') if r['案件ID']=='C1']
        ok('套用範本：7 個工序、依預計開工日排草稿', len(pl)==7 and pl[0]['目前計畫開始']=='2026/11/23', f"{pl[0]['目前計畫開始']}～{pl[0]['目前計畫完成']}")
        w=lambda name:[r for r in pl if r['工序名稱']==name][0]
        ok('跳過週末（拆除 3 天跨週末）', w('拆除與清運')['目前計畫開始']=='2026/11/24' and w('拆除與清運')['目前計畫完成']=='2026/11/26', f"{w('拆除與清運')['目前計畫開始']}～{w('拆除與清運')['目前計畫完成']}")
        ok('「可與水電同步」同時開始', w('冷氣管路')['目前計畫開始']==w('水電配管')['目前計畫開始'])
        ok('定案前沒有原計畫', all(not r['原計畫開始'] for r in pl))
        await p.screenshot(path=SHOTS+'/prog_list.png',full_page=True)
        # 非主管不能定案（凱翔是 C2 負責人）
        post('kx@test.local','applyTemplate',{'caseId':'C2'})
        x=post('kx@test.local','lockPlan',{'caseId':'C2'}); ok('設計師不能定案', not x['ok'], x.get('error',''))
        x=post('kx@test.local','savePlanItem',{'caseId':'C1','name':'x'}); ok('非負責設計師不能編排別人的案件', not x['ok'], x.get('error',''))
        await p.click('#plock'); await p.wait_for_timeout(800)
        pl=[r for r in rows('進度計畫') if r['案件ID']=='C1']
        ok('定案後原計畫 = 目前計畫', all(r['原計畫開始']==r['目前計畫開始'] and r['原計畫完成'] for r in pl))
        it=w('水電配管')['工序ID']
        x=post('pf@test.local','savePlanItem',{'caseId':'C1','id':it,'name':'水電配管','trade':'水電','start':'2026-11-30','end':'2026-12-04'}); ok('定案後改期不填原因被擋', not x['ok'], x.get('error',''))
        await p.click(f'[data-pid="{it}"] .phead'); await p.click(f'[data-pedit="{it}"]'); await p.fill('#ps','2026-11-30'); await p.fill('#pe','2026-12-04'); await p.fill('#pwhy','拆除發現舊管線需加做，水電延後'); await p.click('#pgo'); await p.wait_for_timeout(800)
        r=[x for x in rows('進度計畫') if x['工序ID']==it][0]
        ok('改期只改目前計畫、原計畫保留', r['目前計畫開始']=='2026/11/30' and r['原計畫開始']=='2026/11/27', f"原 {r['原計畫開始']} → 目前 {r['目前計畫開始']}")
        # 實際開始：日誌只當參考
        await p.wait_for_timeout(300)
        hint = await p.inner_text(f'[data-pid="{it}"] .phint') if await p.query_selector(f'[data-pid="{it}"] .phint') else ''
        ok('顯示日誌參考但未自動認定', '11/25' in hint and not r['實際開始'], hint)
        if not await p.is_visible(f'[data-pstart="{it}"]'): await p.click(f'[data-pid="{it}"] .phead')
        await p.click(f'[data-pstart="{it}"]'); await p.wait_for_timeout(300)
        ok('確認表單預帶參考日期', await p.input_value('#pd')=='2026-11-25')
        await p.fill('#pd','2026-11-26'); await p.click('#pgo'); await p.wait_for_timeout(800)
        r=[x for x in rows('進度計畫') if x['工序ID']==it][0]; ok('設計師確認實際開始', r['實際開始']=='2026/11/26' and r['實際開始確認人']=='P03')
        x=post('pf@test.local','setActualStart',{'id':it,'date':'2026-11-27'}); ok('更正不填原因被擋', not x['ok'], x.get('error',''))
        x=post('pf@test.local','setActualStart',{'id':it,'date':'2026-11-27','reason':'11/26 只有放樣，11/27 才開始配管'}); ok('填原因可更正', x['ok'])
        x=post('pf@test.local','setDone',{'id':w('冷氣管路')['工序ID'],'date':'2026-11-28'}); ok('沒有實際開始不能標完成', not x['ok'], x.get('error',''))
        x=post('pf@test.local','setDone',{'id':it,'date':'2026-11-20'}); ok('完成日早於開始被擋', not x['ok'], x.get('error',''))
        x=post('pf@test.local','setDone',{'id':it,'date':'2026-12-03'}); ok('標記施工完成', x['ok'])
        x=post('pf@test.local','setDone',{'id':it,'undo':True}); ok('撤回不填原因被擋', not x['ok'])
        x=post('pf@test.local','cancelPlanItem',{'id':it,'reason':'x'}); ok('已開始的工序不能取消', not x['ok'], x.get('error',''))
        log=[x for x in rows('進度異動紀錄') if x['工序ID']==it]; ok('異動紀錄完整（改期、確認、更正、完成）', [x['項目'] for x in log]==['改期','確認實際開始','更正實際開始','施工完成'], str([x['項目'] for x in log]))
        p=await open_app(b,W,A,'pf@test.local',tip=False); await p.click('[data-case] >> text=QA樣本甲'); await p.wait_for_timeout(500); await p.click('[data-tab=prog]'); await p.wait_for_timeout(300); await p.click(f'[data-pid="{it}"] .phead'); await p.wait_for_timeout(200)
        await p.screenshot(path=SHOTS+'/prog_item.png',full_page=True)
        await p.click(f'[data-pid="{w("冷氣管路")["工序ID"]}"] .phead'); await p.click(f'[data-pstart="{w("冷氣管路")["工序ID"]}"]'); await p.wait_for_timeout(300); await p.screenshot(path=SHOTS+'/prog_startform.png')
        # 預覽與其他人
        snap=json.dumps(table('進度計畫'))
        p=await open_app(b,W,A,'boss@test.local',tip=False); await p.click('[data-as="P04"]'); await p.wait_for_timeout(700); await p.click('[data-case] >> text=QA樣本甲'); await p.wait_for_timeout(500); await p.click('[data-tab=prog]'); await p.wait_for_timeout(300)
        ok('預覽與非負責人看不到編排按鈕', not await p.query_selector('#padd') and not await p.query_selector('[data-pstart]'))
        x=post('boss@test.local','setDone',{'id':it,'date':'2026-12-04','as':'P03','reason':'x'}); ok('預覽寫入被擋且資料未變', not x['ok'] and json.dumps(table('進度計畫'))==snap)
        print('page errors:', p.errs)
        await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
asyncio.run(main())
