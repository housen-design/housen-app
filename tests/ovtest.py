import asyncio, sys, json, urllib.request
sys.path.insert(0,'/tmp/qa')
from pw import *
W,A='9002','9102'
R=[]
def ok(n,c,i=''): R.append(bool(c)); print(('PASS' if c else 'FAIL'),n,i)
def post(email,action,payload):
    r=json.loads(urllib.request.urlopen(urllib.request.Request(f'http://localhost:{A}',data=json.dumps({'action':action,'token':email,'payload':payload}).encode())).read()); return r
async def main():
    # 測試資料
    post('pf@test.local','saveCaseInfo',{'id':'C1','fields':{'預計開工日':'2026-11-02'}})
    post('pf@test.local','applyTemplate',{'caseId':'C1'})
    lid=post('kx@test.local','saveLog',{'caseId':'C1','date':'2026-11-19','trades':['水電'],'text':'主臥插座配管完成，浴室排水管移位中','issue':'浴室排水管與圖面偏移約 15 公分，待確認','submit':True,'photos':[{'data':'AAAA','note':'浴室排水'},{'data':'AAAA','note':'主臥插座'}]})['data']
    post('boss@test.local','saveIns',{'caseId':'C1','logId':lid,'text':'排水管移位前先拍照確認坡度','to':'P04','due':'2026-11-18'})
    post('boss@test.local','saveIns',{'caseId':'C2','text':'下週提供系統櫃報價','to':'P04'})
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        p=await open_app(b,W,A,'boss@test.local',tip=False)
        txt=await p.inner_text('#main')
        ok('Boss 看得到現場總覽', '現場總覽' in txt)
        ok('顯示最新日誌內容與問題', '浴室排水管移位中' in txt and '偏移約 15 公分' in txt)
        ok('顯示指示待處理與逾期', '逾期 1' in txt)
        ok('顯示與計畫的差異', '與計畫差異' in txt)
        ok('我交辦還沒回報的清單', '我交辦、還沒回報' in txt and '下週提供系統櫃報價' in txt)
        ok('沒有日誌的案件也看得到', '沒有日誌' in txt or '日誌 ' in txt)
        await p.screenshot(path='shots/ov_boss.png',full_page=True)
        await p.click('[data-ovcase^="C1"]'); await p.wait_for_timeout(700)
        ok('點案件直接打開最新日誌', await p.is_visible('.lrow.open'))
        p2=await open_app(b,W,A,'kx@test.local',tip=False)
        ok('一般員工不顯示現場總覽', '現場總覽' not in await p2.inner_text('#main'))
        p3=await open_app(b,W,A,'boss@test.local',tip=False); await p3.click('[data-as="P04"]'); await p3.wait_for_timeout(700)
        ok('預覽員工畫面不顯示總覽', '現場總覽' not in await p3.inner_text('#main'))
        print('errors', p.errs+p2.errs+p3.errs)
        await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
asyncio.run(main())
