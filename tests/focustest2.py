# 各種待辦：先把篩選／分頁弄成「不對」的狀態，再從工作總表點進去，要直接看到那一筆
import asyncio
from playwright.async_api import async_playwright
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pw import W, A, DEMO, SITE, SHOTS, ROOT
R=[]
def ok(n,c,i=''): R.append(bool(c)); print(('PASS' if c else 'FAIL'),n,i)
async def go(p, who):
    await p.evaluate(f"localStorage.setItem('housen_demo_user','{who}')"); await p.reload(); await p.wait_for_timeout(1500)
async def stale(p): await p.evaluate("S.insFilter='done';S.ptab='sop';S.copen={};S.popen={};S.tab='docs'")
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch(); c=await b.new_context(viewport={'width':390,'height':844})
        await c.add_init_script("localStorage.setItem('housen_tip','1')")
        p=await c.new_page(); errs=[]; p.on('pageerror',lambda e:errs.append(str(e)))
        await p.goto('http://localhost:'+DEMO+'/index.html'); await p.wait_for_timeout(800); await p.click('[data-e="pf@demo"]'); await p.wait_for_timeout(1500)
        kinds=await p.evaluate("S.home.items.map(i=>i.kind+':'+i.id)"); print('  蘋芳待辦', kinds)
        for kind, sel in [('cins','[data-gocins]'),('wr','[data-gowr]'),('ins','[data-goins]'),('plan','[data-goprog*="|plan|"]'),('ms','[data-goprog*="|ms|"]')]:
            el=p.locator(sel).first
            if not await el.count(): print('  （蘋芳沒有這類待辦）', kind); continue
            attr=await el.get_attribute(sel[1:sel.index(']')].split('*')[0].split('=')[0])
            fid=attr.split('|')[-1]
            await stale(p); await el.click(); await p.wait_for_timeout(1200)
            target=p.locator(f'[data-fid="{fid}"]').first
            vis=await target.count()>0 and await target.is_visible()
            ok(f'{kind}：點待辦直接看到那一筆', vis, await p.evaluate("S.tab+' '+(S.ptab||'')"))
            await p.click('#backbtn'); await p.wait_for_timeout(700)
        await go(p,'boss@demo')
        for kind, sel in [('ms','[data-goprog*="|ms|"]'),('ins','[data-goins]')]:
            el=p.locator(sel).first
            if not await el.count(): print('  （Boss 沒有這類待辦）', kind); continue
            attr=await el.get_attribute(sel[1:sel.index(']')].split('*')[0].split('=')[0]); fid=attr.split('|')[-1]
            await stale(p); await el.click(); await p.wait_for_timeout(1200)
            t=p.locator(f'[data-fid="{fid}"]').first
            ok(f'Boss {kind}：點待辦直接看到那一筆', await t.count()>0 and await t.is_visible())
            await p.click('#backbtn'); await p.wait_for_timeout(700)
        print('errors',errs); await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
asyncio.run(main())
