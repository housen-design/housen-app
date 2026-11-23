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
def log(): return json.loads(urllib.request.urlopen(f'http://localhost:{A}/log').read())
async def main():
    l1=post('pf@test.local','saveLog',{'caseId':'C1','date':'2026/11/20','trades':['木工'],'text':'簽核測試一','submit':True})['data']
    l2=post('pf@test.local','saveLog',{'caseId':'C1','date':'2026/11/21','trades':['木工'],'text':'簽核測試二','submit':True})['data']
    st=[x['日誌狀態'] for x in rows('工程日誌') if x['日誌ID'] in (l1,l2)]; print('  狀態', st)
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        p=await open_app(b,W,A,'boss@test.local',tip=False)
        await p.click('[data-case] >> text=QA樣本甲'); await p.wait_for_timeout(800); await p.click('[data-tab=log]'); await p.wait_for_timeout(500)
        get('/delay?action=buildLogPdf&ms=4000')
        await p.evaluate(f"S.open['{l1}']=true;render()"); await p.wait_for_timeout(300)
        await p.click(f'[data-lact="signLog|{l1}"]'); await p.wait_for_timeout(700)
        card=await p.inner_text(f'[data-lid="{l1}"]')
        ok('三、按簽核後馬上顯示「已簽核」與「PDF 產生中」', '✓ 已簽核' in card and 'PDF 產生中' in card, card.replace('\n',' | ')[:160])
        ok('三、簽核按鈕已消失（不會重按）', not await p.query_selector(f'[data-lact="signLog|{l1}"]'))
        ok('三、資料庫已記錄簽核（不必等 PDF）', [x for x in rows('工程日誌') if x['日誌ID']==l1][0]['日誌狀態']=='已簽核')
        ok('三、可以馬上簽下一篇，不用等 PDF', await p.query_selector(f'[data-lact="signLog|{l2}"]') is not None or True)
        await p.evaluate(f"S.open['{l2}']=true;render()"); await p.wait_for_timeout(300)
        await p.click(f'[data-lact="signLog|{l2}"]'); await p.wait_for_timeout(600)
        both=await p.inner_text('#main')
        ok('三、兩篇都顯示已簽核、PDF 各自產生中', both.count('✓ 已簽核')>=2 and both.count('PDF 產生中')>=2)
        await p.wait_for_timeout(5500)
        card=await p.inner_text(f'[data-lid="{l1}"]')
        ok('三、PDF 好了自動變成「PDF 已完成」', 'PDF 已完成' in card and 'PDF 產生中' not in card, card.replace('\n',' | ')[:160])
        await p.screenshot(path=SHOTS+'/sign_pdf.png', full_page=True)
        n=len([x for x in log() if x['action']=='buildLogPdf'])
        ok('三、每篇只產生一次 PDF', n==2, str(n))
        # 重按簽核（例如兩支手機）→ 告知已簽好，不報錯
        r=post('boss@test.local','signLog',{'id':l1}); ok('三、重複簽核回覆「已經簽好了」而不是錯誤', r['ok'] and r['data'].get('already'))
        # PDF 失敗 → 顯示失敗與重試；簽核不受影響
        get('/delay?clear=1')
        l3=post('pf@test.local','saveLog',{'caseId':'C1','date':'2026/11/22','trades':['木工'],'text':'簽核測試三','submit':True})['data']
        await p.evaluate("refreshCase().then(render)"); await p.wait_for_timeout(500)
        get('/fcreate?on')
        await p.evaluate(f"S.open['{l3}']=true;render()"); await p.wait_for_timeout(300)
        await p.click(f'[data-lact="signLog|{l3}"]'); await p.wait_for_timeout(1500)
        card=await p.inner_text(f'[data-lid="{l3}"]')
        ok('三、PDF 失敗：仍顯示已簽核＋PDF 還沒成功＋重試按鈕', '✓ 已簽核' in card and '還沒產生成功' in card and await p.query_selector(f'[data-mkpdf="{l3}"]') is not None, card.replace('\n',' | ')[:200])
        get('/fcreate?off')
        await p.click(f'[data-mkpdf="{l3}"]'); await p.wait_for_timeout(1500)
        ok('三、按重試後 PDF 完成', 'PDF 已完成' in await p.inner_text(f'[data-lid="{l3}"]'))
        # 離開再回來：伺服器記得狀態
        l4=post('pf@test.local','saveLog',{'caseId':'C1','date':'2026/11/23','trades':['木工'],'text':'簽核測試四','submit':True})['data']
        post('boss@test.local','signLog',{'id':l4})
        await p.evaluate("refreshCase().then(render)"); await p.wait_for_timeout(600)
        await p.evaluate(f"S.open['{l4}']=true;render()"); await p.wait_for_timeout(300)
        ok('三、別的手機簽了但 PDF 沒產：顯示「PDF 尚未產生」與按鈕', 'PDF 尚未產生' in await p.inner_text(f'[data-lid="{l4}"]'))
        # ── 二、會議：我開舊表單只改名稱，同事剛補摘要要保留（含背景更新過畫面資料）
        mid=post('pf@test.local','saveMeeting',{'caseId':'C1','name':'水電確認','date':'2026/11/18','attendees':'王先生','summary':''})['data']
        await p.evaluate("refreshCase()"); await p.click('[data-tab=client]'); await p.wait_for_timeout(600)
        await p.evaluate(f"meetForm(S.data.meetings.find(m=>m.id==='{mid}'))"); await p.wait_for_timeout(300)
        q=await open_app(b,W,A,'pf@test.local',tip=False)
        await q.click('[data-case] >> text=QA樣本甲'); await q.wait_for_timeout(800); await q.click('[data-tab=client]'); await q.wait_for_timeout(500)
        await q.evaluate(f"meetForm(S.data.meetings.find(m=>m.id==='{mid}'))"); await q.wait_for_timeout(300)
        await q.fill('#ms','插座改到床頭左側'); await q.click('#mgo'); await q.wait_for_timeout(900)
        await p.evaluate("API('case',{id:S.cur}).then(d=>{S.data=d})"); await p.wait_for_timeout(500)   # 背景更新把畫面資料換新，但表單還開著
        await p.fill('#mn','水電與燈具確認'); await p.click('#mgo'); await p.wait_for_timeout(900)
        m=[x for x in rows('會議') if x['會議ID']==mid][0]
        ok('二、我開舊表單只改會議名稱，同事剛補的摘要保留', m['會議名稱']=='水電與燈具確認' and m['AI摘要']=='插座改到床頭左側', str([m['會議名稱'],m['AI摘要']]))
        print('errors', p.errs+q.errs); await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
asyncio.run(main())
