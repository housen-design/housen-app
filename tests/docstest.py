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
    post('pf@test.local','applyTemplate',{'caseId':'C1'})
    post('pf@test.local','saveClientIns',{'caseId':'C1','text':'加裝感應燈','source':'LINE','impact':True,'amount':'2400'})
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        p=await open_app(b,W,A,'pf@test.local',tip=False)
        await p.click('[data-case] >> text=QA樣本甲'); await p.wait_for_timeout(500); await p.click('[data-tab=docs]'); await p.wait_for_timeout(300)
        ok('文件頁列出已簽核日誌的 PDF', '工程日誌 11/18' in await p.inner_text('#main'))
        await p.click('#mkWeek'); await p.fill('#wf','2026-11-16'); await p.fill('#wt','2026-11-22'); await p.click('#wgo'); await p.wait_for_timeout(1500)
        ok('產生週報', 'PDF 已產生' in await p.inner_text('#sheet'), (await p.inner_text('#sheet'))[:60])
        await p.click('#sheet .x') if await p.query_selector('#sheet .x') else None
        r=post('pf@test.local','reportPdf',{'caseId':'C1','kind':'resume'}); ok('產生工程履歷', r['ok'] and r['data']['name'].startswith('工程履歷_'), r.get('error',''))
        r=post('kx@test.local','reportPdf',{'caseId':'C1','kind':'resume'}); ok('非負責人不能產生', not r['ok'])
        r=post('pf@test.local','reportPdf',{'caseId':'C1','kind':'week','from':'2026-11-22','to':'2026-11-16'}); ok('日期顛倒被擋', not r['ok'])
        docs=[x for x in rows('文件紀錄') if x['案件ID']=='C1']; ok('文件紀錄登記週報與履歷', {'週報','工程履歷'} <= set(x['文件類型'] for x in docs))
        p=await open_app(b,W,A,'pf@test.local',tip=False); await p.click('[data-case] >> text=QA樣本甲'); await p.wait_for_timeout(500); await p.click('[data-tab=docs]'); await p.wait_for_timeout(300)
        t=await p.inner_text('#main'); ok('文件頁列出週報與履歷並可分類', '週報' in t and '工程履歷' in t and await p.query_selector('[data-dt="週報"]'))
        await p.screenshot(path=SHOTS+'/docs.png',full_page=True)
        print('errors', p.errs)
        await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
asyncio.run(main())
