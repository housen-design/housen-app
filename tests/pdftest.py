# 試玩版：日誌簽核 → PDF → 下載，核對內容；簽核後立刻關頁再開
import asyncio, base64
from playwright.async_api import async_playwright
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pw import W, A, DEMO, SITE, SHOTS, ROOT
R=[]
def ok(n,c,i=''): R.append(bool(c)); print(('PASS' if c else 'FAIL'),n,i)
STUB="""window.__saved=[];Object.defineProperty(window,'claude',{value:{use:async n=>n==='downloads'?{save:async ({filename,data})=>{const b=new Uint8Array(await data.arrayBuffer());let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode.apply(null,b.subarray(i,i+32768));window.__saved.push({filename,b64:btoa(s)});}}:null}});"""
async def as_user(p, who):
    await p.evaluate(f"localStorage.setItem('housen_demo_user','{who}')"); await p.reload(); await p.wait_for_timeout(1500)
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch(); c=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2)
        await c.add_init_script("localStorage.setItem('housen_tip','1');"+STUB)
        p=await c.new_page(); errs=[]; p.on('pageerror',lambda e:errs.append(str(e))); p.on('popup',lambda x:errs.append('多開了頁面 '+x.url))
        await p.goto('http://localhost:'+DEMO+'/index.html'); await p.wait_for_timeout(800); await p.click('[data-e="boss@demo"]'); await p.wait_for_timeout(1500)
        await p.click('[data-case] >> text=南屯王公館'); await p.wait_for_timeout(900); await p.click('[data-tab=log]'); await p.wait_for_timeout(500)
        lid=await p.evaluate("S.data.logs.find(l=>l.date==='2026/11/20').id")
        # Boss 下指示 → 蘋芳回報
        await p.evaluate(f"S.open['{lid}']=true;render()"); await p.wait_for_timeout(300)
        await p.click(f'[data-newins="{lid}"]'); await p.wait_for_timeout(300)
        await p.fill('#itxt','封板前請拍主臥插座新位置給我看'); await p.click('#sheet >> text=蘋芳'); await p.click('#sheet button:has-text("送出指示")'); await p.wait_for_timeout(900)
        await as_user(p,'pf@demo')
        await p.click('[data-case] >> text=南屯王公館'); await p.wait_for_timeout(900); await p.click('[data-tab=instr]'); await p.wait_for_timeout(500)
        fid=await p.evaluate("S.data.ins.find(i=>i.text.includes('封板前請拍主臥')).id")
        await (await p.query_selector(f'.instr[data-fid="{fid}"] button')).click(); await p.wait_for_timeout(300)
        await p.fill('#sheet textarea','已拍照：主臥插座移到床頭左側 20cm'); await p.click('#sheet .btn.pri'); await p.wait_for_timeout(900)
        # Boss 簽核 → 立刻關掉頁面
        await as_user(p,'boss@demo')
        await p.click('[data-case] >> text=南屯王公館'); await p.wait_for_timeout(900); await p.click('[data-tab=log]'); await p.wait_for_timeout(500)
        await p.evaluate(f"S.open['{lid}']=true;render()"); await p.wait_for_timeout(300)
        await p.click(f'[data-lact="signLog|{lid}"]'); await p.wait_for_timeout(60)
        await p.close()
        p=await c.new_page(); p.on('pageerror',lambda e:errs.append(str(e))); p.on('popup',lambda x:errs.append('多開了頁面 '+x.url))
        await p.goto('http://localhost:'+DEMO+'/index.html'); await p.wait_for_timeout(1500)
        await p.click('[data-case] >> text=南屯王公館'); await p.wait_for_timeout(1200); await p.click('[data-tab=log]'); await p.wait_for_timeout(600)
        await p.evaluate(f"S.open['{lid}']=true;render()"); await p.wait_for_timeout(300)
        card=await p.inner_text(f'[data-lid="{lid}"]')
        ok('簽核後立刻關頁，再打開：簽核有保留', '✓ 已簽核' in card, card.replace('\n',' | ')[:120])
        st='已完成' if 'PDF 已完成' in card else ('未產生' if 'PDF 尚未產生' in card else ('待更新' if '待更新' in card else '其他'))
        print('   再打開時 PDF 狀態：', st)
        if st!='已完成':
            ok('沒完成時畫面有補產按鈕', await p.query_selector(f'[data-mkpdf="{lid}"]') is not None)
            await p.click(f'[data-mkpdf="{lid}"]'); await p.wait_for_timeout(2500)
        ok('PDF 完成', 'PDF 已完成' in await p.inner_text(f'[data-lid="{lid}"]'))
        # 查看 PDF → 開啟 PDF：不能多開頁面
        await p.click(f'[data-pdfview="{lid}"]'); await p.wait_for_timeout(600)
        await p.click('#sheet >> text=開啟 PDF'); await p.wait_for_timeout(800)
        ok('按「開啟 PDF」在畫面內預覽，沒有多開頁面', await p.is_visible('#demoView') and not [e for e in errs if '多開' in e])
        await p.click('#dvdl'); await p.wait_for_timeout(6000)
        saved=await p.evaluate("window.__saved.map(x=>({n:x.filename,b:x.b64}))")
        ok('從預覽下載到 PDF 檔', len(saved)==1 and base64.b64decode(saved[0]['b'])[:5]==b'%PDF-', saved[0]['n'] if saved else '')
        if saved: open(SHOTS+'/demo_log.pdf','wb').write(base64.b64decode(saved[0]['b']))
        await p.click('#dvx'); await p.evaluate('closeSheet()'); await p.wait_for_timeout(300)
        # 分享 PDF → 下載
        await p.click(f'[data-share="{lid}"]') if await p.query_selector(f'[data-share="{lid}"]') else await p.click(f'[data-lid="{lid}"] >> text=分享 PDF')
        await p.wait_for_timeout(6000)
        await p.click('#shdl'); await p.wait_for_timeout(1000)
        saved=await p.evaluate("window.__saved.length")
        ok('分享頁的「下載 PDF」也拿得到檔案', saved==2)
        print('errors', errs); await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
asyncio.run(main())
