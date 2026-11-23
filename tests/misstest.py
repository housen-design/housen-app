import asyncio, sys, json, urllib.request, urllib.parse
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from pw import *
R=[]
def ok(n,c,i=''): R.append(bool(c)); print(('PASS' if c else 'FAIL'),n,i)
def rows(n):
    t=json.loads(api(A,'/table?n='+urllib.parse.quote(n))); return [dict(zip(t[0],r)) for r in t[1:]]
def post(email,action,payload):
    return json.loads(urllib.request.urlopen(urllib.request.Request(f'http://localhost:{A}',data=json.dumps({'action':action,'token':email,'payload':payload}).encode())).read())
async def main():
    post('pf@test.local','saveCaseInfo',{'id':'C1','fields':{'預計開工日':'2026-11-16'}})   # 從 11/16（一）開始追蹤
    h=post('pf@test.local','home',{})['data']; miss=[i for i in h['items'] if i['kind']=='miss']
    dates=[i['date'] for i in miss]; print('漏填日期', dates)
    ok('只追蹤預計開工日之後、排除已有日誌的日子', '2026/11/18' not in dates and all(d>='2026/11/16' for d in dates) and '2026/11/16' in dates)
    ok('一般員工不會收到別人案件的漏填', not [i for i in post('kx@test.local','home',{})['data']['items'] if i['kind']=='miss' and i['caseId']=='C1'])
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        p=await open_app(b,W,A,'pf@test.local',tip=False)
        ok('負責設計師工作總表出現漏填', '日誌未填' in await p.inner_text('.tl'))
        await p.screenshot(path=SHOTS+'/miss_home.png',full_page=True)
        await p.click('[data-miss$="2026/11/16"]'); await p.wait_for_timeout(300)
        await p.click('#mnone'); await p.wait_for_timeout(300); ok('無施工要寫原因', '原因' in await p.inner_text('#toast'))
        await p.fill('#mwhy','等系統櫃進場'); await p.click('#mnone'); await p.wait_for_timeout(900)
        ok('登記無施工後不再算漏填', not await p.query_selector('[data-miss$="2026/11/16"]') and rows('日誌豁免')[-1]['記錄人']=='P03')
        await p.click('[data-miss$="2026/11/17"]'); await p.wait_for_timeout(300); await p.click('#mwrite'); await p.wait_for_timeout(900)
        ok('補寫日誌時帶入當天日期', await p.input_value('#ldate')=='2026-11-17')
        await p.click('#ltr button[data-t="木工"]'); await p.fill('#ltxt','補寫：天花角材'); await p.click('#lgo'); await p.wait_for_timeout(800)
        h=post('pf@test.local','home',{})['data']; ok('補寫後不再算漏填', '2026/11/17' not in [i['date'] for i in h['items'] if i['kind']=='miss'])
        boss=await open_app(b,W,A,'boss@test.local',tip=False); t=await boss.inner_text('#main')
        ok('Boss 總覽顯示漏填天數', '漏填' in t)
        await boss.screenshot(path=SHOTS+'/miss_boss.png',full_page=True)
        print('errors', p.errs+boss.errs)
        await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
asyncio.run(main())
