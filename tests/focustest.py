# 依 Boss 的實際順序：Boss 看「已結案」→ 下新指示 → 切成凱翔 → 從工作總表點新指示，要直接看到那一筆
import asyncio
from playwright.async_api import async_playwright
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pw import W, A, DEMO, SITE, SHOTS, ROOT
R=[]
def ok(n,c,i=''): R.append(bool(c)); print(('PASS' if c else 'FAIL'),n,i)
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        c=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2)
        p=await c.new_page(); errs=[]; p.on('pageerror',lambda e:errs.append(str(e)))
        await p.goto('http://localhost:'+DEMO+'/index.html'); await p.wait_for_timeout(1200)
        await p.click('[data-e="boss@demo"]'); await p.wait_for_timeout(1500)
        await p.click('[data-case] >> text=南屯王公館'); await p.wait_for_timeout(900)
        await p.click('[data-tab=instr]'); await p.wait_for_timeout(400)
        await p.click('[data-if="done"]'); await p.wait_for_timeout(300)
        ok('Boss 停在「已結案」', await p.evaluate("S.insFilter")=='done')
        # Boss 對一篇日誌下新指示給凱翔
        await p.click('[data-tab=log]'); await p.wait_for_timeout(400)
        lid=await p.evaluate("S.data.logs[0].id")
        await p.evaluate(f"S.open['{lid}']=true;render()"); await p.wait_for_timeout(300)
        await p.click(f'[data-newins="{lid}"]'); await p.wait_for_timeout(300)
        await p.fill('#itxt','封板前請拍主臥插座新位置給我看')
        await p.click('#sheet [data-to="P04"]') if await p.query_selector('#sheet [data-to="P04"]') else await p.click('#sheet >> text=凱翔')
        await p.click('#sheet button:has-text("送出指示")'); await p.wait_for_timeout(900)
        await p.click('[data-tab=instr]'); await p.wait_for_timeout(300)
        print('  Boss 指示頁目前篩選：', await p.evaluate("S.insFilter"))
        # 切成凱翔
        await p.click('#demoSwitch'); await p.wait_for_timeout(400); await p.click('[data-e="kx@demo"]'); await p.wait_for_timeout(1500)
        item=p.locator('[data-goins] >> text=封板前請拍主臥插座新位置給我看')
        ok('凱翔工作總表出現新指示', await item.count()>0)
        await item.first.click(); await p.wait_for_timeout(1200)
        ok('點進去在「指示」分頁、篩選是「未結」', await p.evaluate("S.tab")=='instr' and await p.evaluate("S.insFilter")=='open')
        vis=await p.locator('.instr >> text=封板前請拍主臥插座新位置給我看').first.is_visible()
        ok('直接看得到那一筆（不用再按「未結」）', vis)
        await p.wait_for_timeout(300); await p.screenshot(path=SHOTS+'/focus_kx.png')
        # 凱翔回報 → 切回 Boss 從待辦點「已回報」→ 確認結案 → 再點已結案的那筆也能看到
        fid=await p.evaluate("S.data.ins.find(i=>i.text.includes('封板前請拍主臥')).id")
        await p.click(f'[data-rep="{fid}"]') if await p.query_selector(f'[data-rep="{fid}"]') else None
        btn=await p.query_selector(f'.instr[data-fid="{fid}"] button')
        await btn.click(); await p.wait_for_timeout(300)
        await p.fill('#sheet textarea','已拍照：主臥插座移到床頭左側 20cm'); await p.click('#sheet .btn.pri'); await p.wait_for_timeout(900)
        await p.click('#demoSwitch'); await p.wait_for_timeout(400); await p.click('[data-e="boss@demo"]'); await p.wait_for_timeout(1500)
        await p.locator('[data-goins] >> text=封板前請拍主臥插座新位置給我看').first.click(); await p.wait_for_timeout(1200)
        ok('Boss 從待辦點「已回報」直接看到回報內容', await p.locator('.instr >> text=已拍照：主臥插座移到床頭左側 20cm').first.is_visible())
        print('errors',errs); await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
asyncio.run(main())
