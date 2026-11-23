import asyncio, sys, json, urllib.request, urllib.parse
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from pw import *
R=[]
def ok(n,c,i=''): R.append(bool(c)); print(('PASS' if c else 'FAIL'),n,i)
def rows(n):
    t=json.loads(api(A,'/table?n='+urllib.parse.quote(n))); return [dict(zip(t[0],r)) for r in t[1:]]
def post(email,action,payload):
    return json.loads(urllib.request.urlopen(urllib.request.Request(f'http://localhost:{A}',data=json.dumps({'action':action,'token':email,'payload':payload}).encode())).read())
async def main():
    ok('一般員工不能看設定', not post('kx@test.local','admin',{})['ok'])
    a=post('pf@test.local','admin',{}); ok('主管可看但不能改', a['ok'] and not a['data']['canEdit'] and not post('pf@test.local','saveSetting',{'key':'保固年限','value':'2'})['ok'])
    ok('設定格式檢查', not post('boss@test.local','saveSetting',{'key':'日誌截止時間','value':'十點'})['ok'])
    ok('範本工種要在工種清單', not post('boss@test.local','saveTemplateRow',{'tpl':'範本_工序','fields':{'工序名稱':'x','工種':'不存在'}})['ok'])
    ok('任何人可提出建議', post('kx@test.local','suggestTemplate',{'source':'手動','text':'冷氣排水要做洩水測試','tpl':'範本_查驗清單'})['ok'])
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        p=await open_app(b,W,A,'boss@test.local',tip=False)
        await p.click('#admin'); await p.wait_for_timeout(900)
        ok('設定頁顯示暫定規則', '日誌截止時間' in await p.inner_text('#main') and '範本狀態' in await p.inner_text('#main'))
        await p.click('[data-set="保固年限"]'); await p.fill('#sv','2'); await p.click('#svgo'); await p.wait_for_timeout(900)
        ok('改公司設定', [x for x in rows('公司設定') if x['項目']=='保固年限'][0]['值']=='2')
        await p.click('[data-at="tpl"]'); await p.wait_for_timeout(900)
        await p.click('[data-tr="W02"]'); await p.wait_for_timeout(300); await p.click('#tfon'); await p.wait_for_timeout(900)
        ok('停用範本工序（不刪）', [x for x in rows('範本_工序') if x['工序ID']=='W02'][0]['啟用']=='N')
        await p.click('#tadd'); await p.wait_for_timeout(300)
        await p.fill('#tf_順序','9'); await p.select_option('#tf_工種','木工'); await p.fill('#tf_工序名稱','系統櫃安裝'); await p.fill('#tf_標準工期工作天','2'); await p.click('#tfgo'); await p.wait_for_timeout(900)
        w=rows('範本_工序')[-1]; ok('新增範本工序', w['工序名稱']=='系統櫃安裝' and w['標準工期（工作天）']=='2' and w['啟用']=='Y', str(w))
        await p.click('[data-at="sugg"]'); await p.wait_for_timeout(900)
        await p.click('[data-sg]'); await p.fill('#sgn','加到冷氣查驗'); await p.click('#sgyes'); await p.wait_for_timeout(900)
        ok('採納建議', rows('範本建議')[-1]['狀態']=='已採納' and rows('範本建議')[-1]['處理人']=='P01')
        await p.screenshot(path=SHOTS+'/m5b_sugg.png',full_page=True)
        await p.click('[data-at="tpl"]'); await p.wait_for_timeout(800); await p.screenshot(path=SHOTS+'/m5b_tpl.png',full_page=True)
        # 套用範本時不帶入停用的工序
        post('pf@test.local','applyTemplate',{'caseId':'C1'})
        names=[x['工序名稱'] for x in rows('進度計畫') if x['案件ID']=='C1']
        ok('停用的工序不會帶入新案件', '拆除與清運' not in names and '系統櫃安裝' in names, str(names))
        # 範本狀態改正式 → 示範字樣消失
        h=post('pf@test.local','home',{})['data']; ok('預設顯示示範', h['tplDemo'])
        post('boss@test.local','saveSetting',{'key':'範本狀態','value':'正式'}); ok('改正式後不顯示示範', not post('pf@test.local','home',{})['data']['tplDemo'])
        # 從已結案指示提出建議
        post('boss@test.local','saveIns',{'caseId':'C1','text':'插座高度確認','to':'P03'}); iid=rows('主管指示')[-1]['指示ID']
        post('pf@test.local','actIns',{'id':iid,'act':'reply','text':'已改 110cm'}); post('boss@test.local','actIns',{'id':iid,'act':'close'})
        q=await open_app(b,W,A,'pf@test.local',tip=False)
        await q.click('[data-case] >> text=QA樣本甲'); await q.wait_for_timeout(900)
        await q.evaluate("S.tab='instr';S.insFilter='done';render()"); await q.wait_for_timeout(500)
        await q.click(f'[data-sugg="{iid}"]'); await q.wait_for_timeout(300); await q.select_option('#sgt','範本_查驗清單'); await q.click('#sggo'); await q.wait_for_timeout(900)
        s=rows('範本建議')[-1]; ok('指示可提出建議並帶來源', s['來源ID']==iid and '110cm' in s['內容'] and s['提出人']=='P03')
        await q.click('#backbtn') if await q.query_selector('#backbtn') else None
        print('errors', p.errs+q.errs)
        await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
asyncio.run(main())
