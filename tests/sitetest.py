import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch(); c=await b.new_context(viewport={'width':390,'height':844},accept_downloads=True)
        p=await c.new_page(); errs=[]; p.on('pageerror',lambda e:errs.append(str(e)))
        await p.goto('http://localhost:9400/housen-test/'); await p.wait_for_timeout(500); print('入口', await p.title())
        await p.click('text=開始試玩'); await p.wait_for_timeout(1500)
        await p.click('[data-e="boss@demo"]'); await p.wait_for_timeout(1500)
        await p.click('[data-golog]:has-text("南屯王公館"):has-text("11/20")'); await p.wait_for_timeout(1200)
        lid=await p.evaluate("S.data.logs.find(l=>l.date==='2026/11/20').id")
        card=await p.inner_text(f'[data-lid="{lid}"]'); print('卡片含指示與回報', '封板前請拍主臥插座' in card, '已拍照：插座中心' in card)
        await p.click(f'[data-lact="signLog|{lid}"]'); await p.wait_for_timeout(2500)
        print('PDF 已完成', 'PDF 已完成' in await p.inner_text(f'[data-lid="{lid}"]'))
        await p.click(f'[data-lid="{lid}"] >> text=分享 PDF'); await p.wait_for_timeout(5000)
        async with p.expect_download() as d: await p.click('#shdl')
        dl=await d.value; await dl.save_as('/tmp/qa/shots/site_demo.pdf'); print('下載檔名', dl.suggested_filename)
        keys=await p.evaluate("Object.keys(localStorage)"); print('本機儲存的名稱', keys)
        await p.goto('http://localhost:9400/housen-test/google/'); await p.wait_for_timeout(1200)
        print('google 版：', (await p.inner_text('body'))[:60].replace('\n',' '))
        print('errors', errs); await b.close()
asyncio.run(main())
