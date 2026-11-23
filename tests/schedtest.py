# 追加減連動：客戶確認影響工期 → 提醒設計師 → 調整工序時連結那筆指示（或記錄不需調整）
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
    pid=post('pf@test.local','savePlanItem',{'caseId':'C1','name':'木作','trade':'木工','start':'2026/11/24','end':'2026/12/05'})['data']
    post('pf@test.local','lockPlan',{'caseId':'C1'})
    ci=post('pf@test.local','saveClientIns',{'caseId':'C1','text':'主臥衣櫃改到頂','date':'2026/11/20','impact':True,'amount':'18000','days':'2','owner':'P04'})['data']
    ci2=post('pf@test.local','saveClientIns',{'caseId':'C1','text':'廚房層板加一層','date':'2026/11/20','impact':True,'amount':'3000','days':'1','owner':'P04'})['data']
    h=post('pf@test.local','home',{})['data']
    ok('客戶還沒確認：不提醒調整進度', not any(i['kind']=='cins' and i.get('status')=='待調整進度' for i in h['items']))
    post('pf@test.local','confirmClientIns',{'id':ci,'status':'已確認','method':'其他','note':'電話'})
    post('pf@test.local','confirmClientIns',{'id':ci2,'status':'已確認','method':'其他','note':'電話'})
    h=post('pf@test.local','home',{})['data']
    ok('客戶確認後：負責設計師工作總表出現「請調整進度」', sum(1 for i in h['items'] if i['kind']=='cins' and i.get('status')=='待調整進度')==2)
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        p=await open_app(b,W,A,'pf@test.local',tip=False)
        await p.locator(f'[data-gocins="C1|{ci}"] >> text=請調整進度').first.click(); await p.wait_for_timeout(1200)
        ok('點提醒直接到客戶頁那一筆，看到「進度：待調整」', 'S.tab' and await p.evaluate('S.tab')=='client' and '進度：待調整' in await p.inner_text(f'[data-fid="{ci}"]'))
        await p.click(f'[data-cplan="{ci}"]'); await p.wait_for_timeout(600)
        ok('切到進度頁並提示正在依這筆指示調整', await p.is_visible('#lcbar'))
        await p.evaluate(f"planForm(S.data.plan.find(x=>x.id==='{pid}'))"); await p.wait_for_timeout(300)
        ok('工序表單已帶入這筆客戶指示與原因', await p.input_value('#pci')==ci and '主臥衣櫃改到頂' in await p.input_value('#pwhy'))
        await p.fill('#pe','2026-12-09'); await p.click('#pgo'); await p.wait_for_timeout(1200)
        x=[r for r in rows('客戶指示') if r['指示ID']==ci][0]; lg=rows('進度異動紀錄')[-1]
        ok('存檔後：客戶指示記為已調整、異動紀錄連結這筆指示', x['進度調整']=='已調整' and '木作' in x['進度調整說明'] and lg['關聯客戶指示']==ci, x['進度調整說明'])
        await p.click('[data-tab=client]'); await p.wait_for_timeout(500)
        await p.evaluate(f"S.copen={{'{ci}':true,'{ci2}':true}};render()"); await p.wait_for_timeout(300)
        ok('客戶頁顯示「進度：已調整」', '進度：已調整' in await p.inner_text(f'[data-fid="{ci}"]'))
        await p.click(f'[data-cnosch="{ci2}"]'); await p.fill('#cxt','用原本緩衝天數吸收'); await p.click('#cxgo'); await p.wait_for_timeout(900)
        ok('另一筆記錄「不需調整」並保留原因', [r for r in rows('客戶指示') if r['指示ID']==ci2][0]['進度調整']=='不需調整')
        h=post('pf@test.local','home',{})['data']
        ok('處理完後提醒消失', not any(i['kind']=='cins' and i.get('status')=='待調整進度' for i in h['items']))
        await p.screenshot(path=SHOTS+'/sched_client.png', full_page=True)
        print('errors', p.errs); await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
asyncio.run(main())
