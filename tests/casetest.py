import asyncio, sys, json, urllib.request, urllib.parse
sys.path.insert(0,'/tmp/qa')
from pw import *
R=[]
def ok(n,c,i=''): R.append(c); print(('PASS' if c else 'FAIL'),n,i)
def table(port,n): return json.loads(api(port,'/table?n='+urllib.parse.quote(n)))
def row(port,cid):
    t=table(port,'案件'); return dict(zip(t[0],[r for r in t if r[0]==cid][0]))
def post(port,email,action,payload):
    return json.loads(urllib.request.urlopen(urllib.request.Request(f'http://localhost:{port}',data=json.dumps({'action':action,'token':email,'payload':payload}).encode())).read())
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        # 修改前畫面（待發布版本）
        p=await open_app(b,'9001','9101','kx@test.local',tip=False); await p.click('[data-case] >> text=QA樣本乙'); await p.wait_for_timeout(600)
        await p.screenshot(path='shots/case_before.png',full_page=True)
        W,A='9002','9102'
        # 設計師編輯自己負責的案件
        p=await open_app(b,W,A,'kx@test.local',tip=False); await p.click('[data-case] >> text=QA樣本乙'); await p.wait_for_timeout(600)
        await p.screenshot(path='shots/case_after_view.png',full_page=True)
        ok('負責設計師看得到「編輯」', await p.is_visible('#editCase'))
        await p.click('#editCase'); await p.wait_for_timeout(300)
        ok('非可看金額者沒有金額欄', not await p.query_selector('#f_fee'))
        await p.fill('#f_d3','2026-12-01'); await p.fill('#f_d4','2026-11-20'); await p.click('#f_go'); await p.wait_for_timeout(500)
        ok('完工早於開工被擋下', '不能早於' in await p.inner_text('#toast') and row(A,'C2')['預計開工日']=='')
        await p.fill('#f_d4','2027-02-15'); await p.fill('#f_drive','https://example.com/not-a-folder'); await p.click('#f_go'); await p.wait_for_timeout(700)
        ok('非資料夾網址被擋下', '/folders/' in await p.inner_text('#toast'), await p.inner_text('#toast'))
        await p.fill('#f_drive','https://drive.google.com/drive/folders/ABC123'); await p.fill('#f_line','line-li'); 
        await p.screenshot(path='shots/case_after_form.png',full_page=True)
        await p.click('#f_go'); await p.wait_for_timeout(900)
        r=row(A,'C2'); ok('只寫入有改動的欄位', r['預計開工日']=='2026/12/01' and r['預計完工日']=='2027/02/15' and r['客戶LINE']=='line-li' and r['Drive資料夾'].endswith('ABC123') and r['最後修改人']=='P04', await p.inner_text('#toast'))
        await p.screenshot(path='shots/case_after_saved.png',full_page=True)
        # 不是自己的案件
        await p.click('#backbtn'); await p.wait_for_timeout(400); await p.click('[data-case] >> text=QA樣本甲'); await p.wait_for_timeout(600)
        ok('非負責設計師沒有「編輯」', not await p.is_visible('#editCase'))
        x=post(A,'kx@test.local','saveCaseInfo',{'id':'C1','fields':{'備註':'x'}}); ok('後端擋下非負責人修改', not x['ok'], x.get('error',''))
        x=post(A,'kx@test.local','saveCaseInfo',{'id':'C2','fields':{'工程金額':'999'}}); ok('後端擋下無權限者改金額', not x['ok'] and row(A,'C2')['工程金額']=='', x.get('error',''))
        x=post(A,'kx@test.local','setStage',{'id':'C2','stage':'結案'}); ok('後端擋下非主管改階段', not x['ok'] and row(A,'C2')['階段']=='施工', x.get('error',''))
        x=post(A,'kx@test.local','saveCaseInfo',{'id':'C2','fields':{'Drive資料夾':'https://drive.google.com/drive/folders/BAD'}}); ok('打不開的資料夾被擋下', not x['ok'], x.get('error',''))
        # 行政改金額
        p=await open_app(b,W,A,'rita@test.local',tip=False); await p.click('[data-case] >> text=QA樣本甲'); await p.wait_for_timeout(600)
        await p.click('#editCase'); await p.fill('#f_amt','2,800,000'); await p.click('#f_go'); await p.wait_for_timeout(800)
        ok('行政可改金額', row(A,'C1')['工程金額']=='2800000', await p.inner_text('#toast'))
        # 預覽
        snap=json.dumps(table(A,'案件'))
        p=await open_app(b,W,A,'boss@test.local',tip=False); await p.click('[data-as="P04"]'); await p.wait_for_timeout(700); await p.click('[data-case] >> text=QA樣本乙'); await p.wait_for_timeout(600)
        ok('預覽沒有「編輯」', not await p.is_visible('#editCase'))
        x=post(A,'boss@test.local','saveCaseInfo',{'id':'C2','as':'P04','fields':{'備註':'x'}}); ok('預覽寫入被後端擋下且資料未變', not x['ok'] and json.dumps(table(A,'案件'))==snap)
        print('page errors:', p.errs)
        await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
asyncio.run(main())
