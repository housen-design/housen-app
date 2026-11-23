import asyncio, sys, json, urllib.request
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from pw import *
R=[]
def ok(n,c,i=''): R.append(bool(c)); print(('PASS' if c else 'FAIL'),n,i)
def delay(action,id,ms): urllib.request.urlopen(f'http://localhost:{A}/delay?action={action}&id={id}&ms={ms}').read()
def nodelay(): urllib.request.urlopen(f'http://localhost:{A}/delay?clear=1').read()
CHK="""() => { const c = JSON.parse(localStorage.getItem('housen_cache_v1')||'{}'); const m = {}; for (const k in (c.cases||{})) m[k] = c.cases[k].data.info['案件ID']; return { cur: S.cur, data: S.data && S.data.info['案件ID'], top: document.querySelector('#top h1') && document.querySelector('#top h1').textContent, cache: m }; }"""
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        p=await open_app(b,W,A,'boss@test.local',tip=False)
        names=await p.evaluate("S.home.cases.map(c=>[c.id,c.name])"); N=dict(names); print('假案件', names[:2])
        # 情境一：手機還沒記住兩案。A 案晚 2.5 秒回來，先點 A 再立刻點 B
        delay('case','C1',2500)
        await p.evaluate("void openCase('C1')"); await p.wait_for_timeout(150); await p.evaluate("openCase('C2')"); await p.wait_for_timeout(3500)
        r=await p.evaluate(CHK); print('  ', r)
        ok('一、沒有快取：A 晚回來，畫面仍是 B', r['cur']=='C2' and r['data']=='C2' and r['top']==N['C2'])
        ok('一、手機記住的內容：A 存在 A、B 存在 B，沒有混', r['cache'].get('C1') in (None,'C1') and r['cache'].get('C2')=='C2')
        nodelay()
        # 情境二：兩案都已記住；A 的更新晚回來
        await p.evaluate("openCase('C1')"); await p.wait_for_timeout(800); await p.evaluate("renderHome()")
        delay('case','C1',2500)
        await p.evaluate("void openCase('C1')"); await p.wait_for_timeout(200)
        mid=await p.evaluate(CHK); ok('二、A 先秒開（顯示記住的內容）', mid['top']==N['C1'])
        await p.evaluate("renderHome()"); await p.click('[data-case] >> nth=1') if False else await p.evaluate("openCase('C2')")
        await p.wait_for_timeout(3500); r=await p.evaluate(CHK); print('  ', r)
        ok('二、A 的更新晚回來，畫面仍是 B', r['cur']=='C2' and r['data']=='C2' and r['top']==N['C2'])
        ok('二、手機記住的內容各自正確', r['cache'].get('C1')=='C1' and r['cache'].get('C2')=='C2')
        nodelay()
        # 情境三：在 A 案按重新整理（refreshCase）時切去 B
        await p.evaluate("openCase('C1')"); await p.wait_for_timeout(800)
        delay('case','C1',2500)
        await p.evaluate("void refreshCase().then(()=>{ if (S.cur) render(); })"); await p.wait_for_timeout(150); await p.evaluate("openCase('C2')")
        await p.wait_for_timeout(3500); r=await p.evaluate(CHK); print('  ', r)
        ok('三、A 案重新整理晚回來，畫面仍是 B', r['cur']=='C2' and r['data']=='C2' and r['top']==N['C2'])
        nodelay()
        # 情境四：背景自動更新（silentRefresh）跑到一半切案件
        await p.evaluate("openCase('C1')"); await p.wait_for_timeout(800)
        delay('case','C1',2500)
        await p.evaluate("void silentRefresh()"); await p.wait_for_timeout(300); await p.evaluate("openCase('C2')")
        await p.wait_for_timeout(3500); r=await p.evaluate(CHK); print('  ', r)
        ok('四、背景更新晚回來，畫面仍是 B', r['cur']=='C2' and r['data']=='C2' and r['top']==N['C2'] and r['cache'].get('C1')=='C1')
        nodelay()
        print('errors', p.errs); await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
asyncio.run(main())
