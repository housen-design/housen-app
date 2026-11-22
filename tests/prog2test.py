import asyncio, sys, json, urllib.request, urllib.parse
sys.path.insert(0,'/tmp/qa')
from pw import *
W,A='9002','9102'
R=[]
def ok(n,c,i=''): R.append(bool(c)); print(('PASS' if c else 'FAIL'),n,i)
def rows(n):
    t=json.loads(api(A,'/table?n='+urllib.parse.quote(n))); return [dict(zip(t[0],r)) for r in t[1:]]
def post(email,action,payload):
    return json.loads(urllib.request.urlopen(urllib.request.Request(f'http://localhost:{A}',data=json.dumps({'action':action,'token':email,'payload':payload}).encode())).read())
async def main():
    post('pf@test.local','saveCaseInfo',{'id':'C1','fields':{'預計開工日':'2026-11-02','提案日':'2026-11-20'}})
    post('pf@test.local','applyTemplate',{'caseId':'C1'})
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        p=await open_app(b,W,A,'pf@test.local',tip=False)
        await p.click('[data-case] >> text=QA樣本甲'); await p.wait_for_timeout(500); await p.click('[data-tab=prog]'); await p.wait_for_timeout(300)
        txt=await p.inner_text('#main'); ok('工序延誤提示（只顯示，不擋）', '超過計畫完成日' in txt)
        it=[r for r in rows('進度計畫') if r['工序名稱']=='水電配管'][0]['工序ID']
        await p.click(f'[data-pid="{it}"] .phead'); await p.wait_for_timeout(200)
        ok('有查驗點的工序列出檢查項目', await p.is_visible(f'[data-chk="{it}|Q01"]'))
        await p.click(f'[data-chk="{it}|Q03"]'); await p.click('#kst button[data-v="有問題"]'); await p.click('#kgo'); await p.wait_for_timeout(300)
        ok('有問題必須寫明', '寫明' in await p.inner_text('#toast'))
        await p.fill('#knote','保壓 30 分鐘後壓力下降'); await p.click('#kgo'); await p.wait_for_timeout(300); ok('需拍照的項目要附照片', '拍照' in await p.inner_text('#toast'))
        await p.set_input_files('#kph', files=[{'name':'a.png','mimeType':'image/png','buffer':open('/home/claude/housen-app/icons/icon-192.png','rb').read()}]); await p.wait_for_timeout(800)
        await p.click('#kgo'); await p.wait_for_timeout(800)
        r=[x for x in rows('查驗紀錄') if x['工序ID']==it and x['檢查ID']=='Q03']; ok('查驗紀錄存檔', r and r[0]['狀態']=='有問題' and r[0]['照片'].startswith('客戶確認_Images/查驗.') and r[0]['檢查人']=='P03')
        x=post('pf@test.local','setActualStart',{'id':it,'date':'2026-11-10'}); ok('查驗有問題不會擋下一步', x['ok'])
        await p.screenshot(path='shots/prog_check.png',full_page=True)
        # SOP
        await p.click('[data-pt=sop]'); await p.click('#sopApply'); await p.wait_for_timeout(700)
        sop=[x for x in rows('案件SOP') if x['案件ID']=='C1']; ok('帶入 SOP 清單', len(sop)==3)
        await p.click(f'[data-sop="{sop[0]["ID"]}"]'); await p.wait_for_timeout(700)
        ok('勾選 SOP 完成並記錄完成人', [x for x in rows('案件SOP') if x['ID']==sop[0]['ID']][0]['完成人']=='P03')
        ok('SOP 分頁顯示未完成數', '（2）' in await p.inner_text('.ptabs'))
        await p.screenshot(path='shots/prog_sop.png')
        # 里程碑
        await p.click('[data-pt=ms]'); await p.click('#msP'); await p.wait_for_timeout(700)
        ms=[x for x in rows('里程碑') if x['案件ID']=='C1']
        ok('帶入提案里程碑並依提案日排日期', len(ms)==4 and ms[0]['目前期限']=='2026/11/12' and ms[3]['目前期限']=='2026/11/20', str([m['目前期限'] for m in ms]))
        ok('Boss 角色指派給 Boss、設計師指派給負責設計師', ms[0]['負責人']=='P01' and ms[1]['負責人']=='P03')
        x=post('pf@test.local','saveMilestone',{'caseId':'C1','id':ms[1]['任務ID'],'name':ms[1]['名稱'],'owner':'P03','due':'2026-11-25'}); ok('改期不填原因被擋', not x['ok'])
        x=post('pf@test.local','saveMilestone',{'caseId':'C1','id':ms[1]['任務ID'],'name':ms[1]['名稱'],'owner':'P03','due':'2026-11-25','reason':'客戶延後丈量'}); ok('填原因可改期，原定日期保留', x['ok'] and [m for m in rows('里程碑') if m['任務ID']==ms[1]['任務ID']][0]['原定日期']=='2026/11/14')
        x=post('pf@test.local','setMilestone',{'id':ms[1]['任務ID'],'act':'done'}); x=post('kx@test.local','setMilestone',{'id':ms[1]['任務ID'],'act':'return'}); ok('非主管不能退回', not x['ok'])
        x=post('boss@test.local','setMilestone',{'id':ms[1]['任務ID'],'act':'return','reason':'丈量資料缺廚房'}); m=[m for m in rows('里程碑') if m['任務ID']==ms[1]['任務ID']][0]
        ok('主管退回計次並記原因', x['ok'] and str(m['退回次數'])=='1' and '丈量資料缺廚房' in m['備註'])
        await p.click('[data-pt=plan]'); await p.click('[data-pt=ms]'); await p.wait_for_timeout(200)
        p=await open_app(b,W,A,'pf@test.local',tip=False); txt=await p.inner_text('.tl')
        ok('首頁出現我的里程碑與進度落後提醒', '設計里程碑' in txt and '進度落後' in txt)
        await p.screenshot(path='shots/home_ms.png',full_page=True)
        p2=await open_app(b,W,A,'boss@test.local',tip=False); ok('Boss 的里程碑也進工作總表', '接洽、記錄需求' in await p2.inner_text('.tl'))
        await p2.click('[data-goprog]'); await p2.wait_for_timeout(700); ok('點提醒進到里程碑分頁', await p2.is_visible('[data-pt=ms].on'))
        await p2.screenshot(path='shots/prog_ms.png',full_page=True)
        print('errors', p.errs+p2.errs)
        await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
asyncio.run(main())
