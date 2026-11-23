import asyncio
from playwright.async_api import async_playwright
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pw import W, A, DEMO, SITE, SHOTS, ROOT
R=[]
def ok(n,c,i=''): R.append(bool(c)); print(('PASS' if c else 'FAIL'),n,i)
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch(); c=await b.new_context(viewport={'width':390,'height':844},accept_downloads=True)
        p=await c.new_page(); errs=[]; p.on('pageerror',lambda e:errs.append(str(e)))
        await p.goto('http://localhost:'+SITE+'/housen-test/'); await p.wait_for_timeout(500); ok('入口頁打開', 'housen' in (await p.title()).lower() or '浩森' in await p.title(), await p.title())
        await p.click('text=開始試玩'); await p.wait_for_timeout(1500)
        await p.click('[data-e="boss@demo"]'); await p.wait_for_timeout(1500)
        await p.click('[data-golog]:has-text("南屯王公館"):has-text("11/20")'); await p.wait_for_timeout(1200)
        lid=await p.evaluate("S.data.logs.find(l=>l.date==='2026/11/20').id")
        card=await p.inner_text(f'[data-lid="{lid}"]'); ok('卡片含指示與回報', '封板前請拍主臥插座' in card and '已拍照：插座中心' in card)
        await p.click(f'[data-lact="signLog|{lid}"]'); await p.wait_for_timeout(2500)
        ok('簽核後 PDF 已完成', 'PDF 已完成' in await p.inner_text(f'[data-lid="{lid}"]'))
        await p.click(f'[data-lid="{lid}"] >> text=分享 PDF'); await p.wait_for_timeout(5000)
        async with p.expect_download() as d: await p.click('#shdl')
        dl=await d.value; await dl.save_as(SHOTS+'/site_demo.pdf'); ok('下載得到 PDF', dl.suggested_filename.endswith('.pdf'), dl.suggested_filename)
        keys=await p.evaluate("Object.keys(localStorage)"); ok('試玩版本機儲存不和正式版共用名稱', keys and all(k.startswith('housendemo_') for k in keys), keys)
        await p.goto('http://localhost:'+SITE+'/housen-test/google/'); await p.wait_for_timeout(1200)
        ok('Google 測試版頁面打開並標示測試環境', 'Google 測試環境' in await p.inner_text('body'))
        ok('沒有頁面錯誤', not errs, errs); await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
    sys.exit(0 if all(R) else 1)
asyncio.run(main())
