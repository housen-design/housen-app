import asyncio, sys, json, urllib.request
sys.path.insert(0,'/tmp/qa')
from pw import *
W,A='9002','9102'
def log(): return json.loads(urllib.request.urlopen(f'http://localhost:{A}/log').read())
def clear(): urllib.request.urlopen(f'http://localhost:{A}/clearlog').read()
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        p=await open_app(b,W,A,'pf@test.local',tip=False)
        clear(); await p.click('[data-case] >> text=QA樣本甲'); await p.wait_for_timeout(1200)
        print('第一次開案件', [x.get('action') for x in log()])
        await p.click('#backbtn'); await p.wait_for_timeout(1200)
        clear(); await p.click('[data-case] >> text=QA樣本甲'); 
        await p.wait_for_timeout(80); vis = await p.is_visible('#loading'); txt=await p.inner_text('#top')
        print('第二次開案件：80ms 內已顯示內容', 'QA樣本甲' in txt, '有轉圈', vis)
        await p.wait_for_timeout(1200); print('  背景更新', [x.get('action') for x in log()])
        await p.click('[data-tab=client]'); await p.wait_for_timeout(500)
        clear(); await p.evaluate("planAct('saveClientIns',{caseId:S.cur,text:'速度測試',date:'2026/11/20'},'ok')"); await p.wait_for_timeout(1500)
        acts=[x.get('action') for x in log()]; print('存一筆客戶指示的請求', acts)
        print('畫面已更新', '速度測試' in await p.inner_text('#main'))
        clear(); await p.click('#backbtn'); await p.wait_for_timeout(80); print('返回工作總表 80ms 內顯示', '工作總表' in await p.inner_text('#top'))
        await p.reload(); await p.wait_for_timeout(150); print('重新整理 150ms 內顯示快取', '工作總表' in await p.inner_text('#top'))
        print('errors', p.errs); await b.close()
asyncio.run(main())
