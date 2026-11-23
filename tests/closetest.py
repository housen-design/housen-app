# 正式版流程（假資料後端）：簽核後立刻關頁，再打開
import asyncio, sys, json, urllib.request, urllib.parse
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from pw import *
R=[]
def ok(n,c,i=''): R.append(bool(c)); print(('PASS' if c else 'FAIL'),n,i)
def rows(n):
    t=json.loads(api(A,'/table?n='+urllib.parse.quote(n))); return [dict(zip(t[0],r)) for r in t[1:]]
def post(email,action,payload):
    return json.loads(urllib.request.urlopen(urllib.request.Request(f'http://localhost:{A}',data=json.dumps({'action':action,'token':email,'payload':payload}).encode())).read())
def get(u): urllib.request.urlopen(f'http://localhost:{A}'+u).read()
async def open_log(b, lid):
    p=await open_app(b,W,A,'boss@test.local',tip=False)
    await p.click('[data-case] >> text=QA樣本甲'); await p.wait_for_timeout(800); await p.click('[data-tab=log]'); await p.wait_for_timeout(400)
    await p.evaluate(f"S.open['{lid}']=true;render()"); await p.wait_for_timeout(300); return p
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        # 情境一：PDF 請求已送到伺服器，畫面就被關掉（伺服器會繼續做完）
        l1=post('pf@test.local','saveLog',{'caseId':'C1','date':'2026/11/20','trades':['木工'],'text':'關頁測試一','submit':True})['data']
        get('/delay?action=buildLogPdf&ms=4000')
        p=await open_log(b,l1)
        await p.click(f'[data-lact="signLog|{l1}"]'); await p.wait_for_timeout(500)
        await p.close()
        await asyncio.sleep(5)
        x=[r for r in rows('工程日誌') if r['日誌ID']==l1][0]
        ok('一、簽核已存', x['日誌狀態']=='已簽核')
        p=await open_log(b,l1); card=await p.inner_text(f'[data-lid="{l1}"]')
        ok('一、再打開：顯示已簽核、PDF 已完成（伺服器在背景做完）', '✓ 已簽核' in card and 'PDF 已完成' in card, card.replace('\n',' | ')[:140])
        await p.close(); get('/delay?clear=1')
        # 情境二：簽核送出後、PDF 請求還沒送出就關掉
        l2=post('pf@test.local','saveLog',{'caseId':'C1','date':'2026/11/21','trades':['木工'],'text':'關頁測試二','submit':True})['data']
        p=await open_log(b,l2)
        await p.route('**/*', lambda route: route.abort() if route.request.method=='POST' and 'buildLogPdf' in (route.request.post_data or '') else route.continue_())
        await p.click(f'[data-lact="signLog|{l2}"]'); await p.wait_for_timeout(600); await p.close()
        p=await open_log(b,l2); card=await p.inner_text(f'[data-lid="{l2}"]')
        ok('二、再打開：簽核保留', '✓ 已簽核' in card)
        ok('二、PDF 沒做到：顯示「PDF 尚未產生」和補產按鈕', 'PDF 尚未產生' in card and await p.query_selector(f'[data-mkpdf="{l2}"]') is not None)
        await p.click(f'[data-mkpdf="{l2}"]'); await p.wait_for_timeout(1500)
        ok('二、按補產後 PDF 完成', 'PDF 已完成' in await p.inner_text(f'[data-lid="{l2}"]'))
        # 情境三：簽核後才有新的指示與回報 → PDF 顯示待更新，可更新
        post('boss@test.local','saveIns',{'caseId':'C1','logId':l2,'text':'請補拍收邊','to':'P03'})
        await p.evaluate("refreshCase().then(render)"); await p.wait_for_timeout(600)
        await p.evaluate(f"S.open['{l2}']=true;render()"); await p.wait_for_timeout(300)
        card=await p.inner_text(f'[data-lid="{l2}"]')
        ok('三、簽核後新增指示：PDF 顯示待更新', '待更新' in card)
        await p.click(f'[data-mkpdf="{l2}"]'); await p.wait_for_timeout(1500)
        ok('三、按更新後 PDF 完成', 'PDF 已完成' in await p.inner_text(f'[data-lid="{l2}"]'))
        await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
asyncio.run(main())
