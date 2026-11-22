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
    ok('非主管不能結案', not post('kx@test.local','setStage',{'id':'C1','stage':'結案'})['ok'])
    r=post('boss@test.local','setStage',{'id':'C1','stage':'結案'}); c=[x for x in rows('案件') if x['案件ID']=='C1'][0]
    ok('結案寫入結案日與保固到期日', r['ok'] and c['結案日'] and c['保固到期日'], c['保固到期日'])
    ok('結案後不能新增日誌', '結案' in str(post('pf@test.local','saveLog',{'caseId':'C1','date':'2026-11-19','text':'x','trades':['木工']}).get('error')))
    ok('結案後不能下指示', not post('boss@test.local','saveIns',{'caseId':'C1','text':'x','owner':'P03'})['ok'])
    ok('結案後仍可報修', post('rita@test.local','saveRepair',{'caseId':'C1','text':'衣櫃門片下垂','owner':'P04'})['ok'])
    rid=rows('保固報修')[-1]['報修ID']
    ok('非負責人不能更新報修', not post('candy@test.local','saveRepair',{'caseId':'C1','id':rid,'status':'處理中'})['ok'])
    ok('完成要寫處理結果', not post('kx@test.local','saveRepair',{'caseId':'C1','id':rid,'status':'已完成'})['ok'])
    h=post('kx@test.local','home',{})['data']; ok('負責人工作總表出現報修', any(i['kind']=='wr' for i in h['items']))
    ok('沒有績效權限不能看統計', not post('pf@test.local','stats',{'from':'2026/11/01','to':'2026/11/19'})['ok'])
    st=post('boss@test.local','stats',{'from':'2026/11/01','to':'2026/11/19'}); ok('Boss 可看統計', st['ok'] and len(st['data']['rows'])>=4)
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        p=await open_app(b,W,A,'kx@test.local',tip=False)
        ok('首頁報修項目', '保固報修' in await p.inner_text('.tl'))
        await p.click('[data-gowr]'); await p.wait_for_timeout(900)
        t=await p.inner_text('body'); ok('已結案唯讀橫條與保固到期', '已結案' in t and '保固到' in t)
        ok('結案案件沒有新增按鈕', not await p.is_visible('#fab'))
        await p.click('[data-rep]'); await p.wait_for_timeout(300)
        await p.click('#rs button[data-v="已完成"]'); await p.fill('#rr','調整鉸鍊'); await p.click('#rgo'); await p.wait_for_timeout(900)
        ok('報修處理完成', rows('保固報修')[-1]['狀態']=='已完成' and rows('保固報修')[-1]['完成日'])
        await p.screenshot(path='shots/m5a_case.png',full_page=True)
        boss=await open_app(b,W,A,'boss@test.local',tip=False)
        await boss.click('#stats'); await boss.wait_for_timeout(900)
        t=await boss.inner_text('#main'); ok('統計頁顯示人員與暫定說明', '許凱翔' in t and '暫定' in t)
        await boss.click('[data-sr="prev"]'); await boss.wait_for_timeout(900); ok('切換上個月', '2026/10/01' in await boss.inner_text('#top'))
        await boss.screenshot(path='shots/m5a_stats.png',full_page=True)
        await boss.click('#backbtn'); await boss.wait_for_timeout(600)
        await boss.click('[data-case] >> text=QA樣本甲'); await boss.wait_for_timeout(900)
        await boss.click('[data-st="施工"]'); await boss.wait_for_timeout(1200)
        ok('主管可把結案改回施工並恢復可寫', [x for x in rows('案件') if x['案件ID']=='C1'][0]['階段']=='施工' and await boss.is_visible('#qaLog'))
        pf=await open_app(b,W,A,'pf@test.local',tip=False); ok('無績效權限看不到統計入口', not await pf.query_selector('#stats'))
        print('errors', p.errs+boss.errs+pf.errs)
        await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
asyncio.run(main())
