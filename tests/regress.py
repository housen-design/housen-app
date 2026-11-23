import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from pw import *
R=[]
def ok(n,c,i=''): R.append(bool(c)); print(('PASS' if c else 'FAIL'),n,i)
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        kx=await open_app(b,W,A,'kx@test.local',tip=False)
        await kx.click('[data-case] >> text=QA樣本甲'); await kx.wait_for_timeout(500); await kx.click('[data-tab=log]'); await kx.click('#fab'); await kx.wait_for_timeout(300)
        await kx.click('#ltr button[data-t="木工"]'); await kx.fill('#ltxt','回歸測試：封板前檢查'); await kx.click('#lgo'); await kx.wait_for_timeout(800)
        pf=await open_app(b,W,A,'pf@test.local',tip=False)
        items=await pf.inner_text('.tl'); ok('蘋芳待辦含確認日誌', '確認日誌' in items)
        await pf.click('[data-golog]:has-text("確認日誌")'); await pf.wait_for_timeout(600); await pf.click('text=確認送簽核'); await pf.wait_for_timeout(700)
        await pf.click('button:has-text("簽核通過")'); await pf.wait_for_timeout(700)
        st=await pf.inner_text('.lrow.open .lst'); ok('簽核後狀態顯示已簽核', 'PDF' in st or '分享' in st or '簽核' in st, st.replace('\n',' '))
        await kx.click('#backbtn'); await kx.wait_for_timeout(400); await kx.click('[data-case] >> text=QA樣本甲'); await kx.wait_for_timeout(400); await kx.click('[data-tab=log]')
        await kx.click('.lhead >> nth=0'); await kx.click('.lrow.open [data-edit]'); await kx.fill('#ltxt','回歸測試：封板前檢查，高度改 270'); await kx.click('#lgo'); await kx.wait_for_timeout(700)
        await pf.click('#backbtn'); await pf.wait_for_timeout(500); ok('蘋芳待辦含確認修改', '確認修改' in await pf.inner_text('.tl'))
        await pf.click('[data-golog]'); await pf.wait_for_timeout(600); ok('有修改差異框', await pf.is_visible('.lrow.open .diff'))
        ok('修改待確認時沒有分享鈕', not await pf.query_selector('.lrow.open [data-share]'))
        await pf.click('button:has-text("確認修改")'); await pf.wait_for_timeout(700); ok('確認後可分享', await pf.is_visible('.lrow.open [data-share]'))
        ok('沒有頁面錯誤', not (kx.errs+pf.errs), kx.errs+pf.errs)
        await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
    sys.exit(0 if all(R) else 1)
asyncio.run(main())
