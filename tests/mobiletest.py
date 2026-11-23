# 手機尺寸檢查：320×568、390×844、844×390（橫向）
# 登入頁、工作總表、案件六個分頁（含超長案件名與長網址）、統計、系統設定、日誌的 PDF 分享入口
# 每一頁都檢查：沒有橫向溢出、底部分頁與主要按鈕沒有被遮住
import asyncio, sys, os, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pw import *
R = []
def ok(n, c, i=''): R.append(bool(c)); print(('PASS' if c else 'FAIL'), n, i)
OVER = "(() => { const w = document.documentElement.clientWidth; const bad = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && cs.position !== 'fixed' && (r.right > w + 1 || r.left < -1) && !e.closest('.pvwrap,.pv,[style*=\"overflow\"]'); }).slice(0, 3).map(e => (e.id || e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().right)); return { sw: document.documentElement.scrollWidth, w, bad }; })()"
HIT = "(sel => [...document.querySelectorAll(sel)].filter(b => b.offsetParent).map(b => { b.scrollIntoView({block:'center'}); const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const e = document.elementFromPoint(x, y); return { t: (b.innerText || '').trim().slice(0, 8), ok: !!e && (e === b || b.contains(e)), inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth }; }))"
async def check(p, name):
    o = await p.evaluate(OVER)
    ok(f'{name}：沒有橫向溢出', o['sw'] <= o['w'] + 1 and not o['bad'], json.dumps(o, ensure_ascii=False))
async def hits(p, sel, name):
    hs = await p.evaluate(HIT + f"('{sel}')")
    ok(f'{name}：按鈕都點得到、沒被遮住（{len(hs)} 個）', hs and all(h['ok'] and h['inView'] for h in hs), [h for h in hs if not (h['ok'] and h['inView'])])

async def main():
    m = json.load(open(os.path.join(ROOT, 'manifest.webmanifest'), encoding='utf-8'))
    ok('安裝後可以橫放（manifest 沒有鎖直向）', m.get('orientation') in (None, 'any', 'natural'), m.get('orientation'))
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    ok('有處理瀏海安全區（viewport-fit=cover＋上下左右 safe-area）', 'viewport-fit=cover' in html and all(f'safe-area-inset-{k}' in html for k in ['top', 'bottom', 'left', 'right']))
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        for (vw, vh) in [(320, 568), (390, 844), (844, 390)]:
            tag = f'{vw}×{vh}'
            p = await open_app(b, W, A, None, vw=vw, vh=vh, tip=False)
            await p.wait_for_timeout(600)
            ok(f'{tag} 登入頁：Google 登入按鈕看得到', await p.is_visible('#gbtn'))
            await check(p, f'{tag} 登入頁')
            await p.screenshot(path=f'{SHOTS}/m_{vw}_login.png')
            await p.context.close()
            p = await open_app(b, W, A, 'boss@test.local', vw=vw, vh=vh, tip=False)
            await p.wait_for_timeout(900)
            ok(f'{tag} 工作總表：沒有切換身分列（正式版）', not await p.query_selector('#pvwrap'))
            await check(p, f'{tag} 工作總表')
            await p.screenshot(path=f'{SHOTS}/m_{vw}_home.png')
            await p.click('[data-case] >> text=QA樣本乙'); await p.wait_for_timeout(700)
            tabs = await p.evaluate("TABS.map(t => t[0])")
            ok(f'{tag} 案件有六個分頁', len(tabs) == 6, tabs)
            await hits(p, '.nav [data-tab]', f'{tag} 底部分頁')
            for t in tabs:
                await p.click(f'.nav [data-tab="{t}"]'); await p.wait_for_timeout(450)
                await check(p, f'{tag} 長案件名・{t}')
                if t in ('sum', 'log'): await p.screenshot(path=f'{SHOTS}/m_{vw}_c2_{t}.png', full_page=True)
            # 有 PDF 的日誌：分享入口
            await p.click('#backbtn'); await p.wait_for_timeout(500)
            await p.click('[data-case] >> text=QA樣本甲'); await p.wait_for_timeout(600)
            await p.click('.nav [data-tab="log"]'); await p.wait_for_timeout(400)
            await p.evaluate("S.open[S.data.logs.find(l => l.hasPdf).id] = true; render()"); await p.wait_for_timeout(300)
            ok(f'{tag} 日誌：有「分享 PDF」入口', await p.query_selector('.lrow.open [data-share]') is not None)
            await hits(p, '.lrow.open [data-share]', f'{tag} 分享 PDF')
            await check(p, f'{tag} 日誌展開')
            await p.screenshot(path=f'{SHOTS}/m_{vw}_log.png')
            await p.click('#backbtn'); await p.wait_for_timeout(500)
            for v in ['stats', 'admin']:
                if await p.query_selector('#' + v):
                    await p.click('#' + v); await p.wait_for_timeout(800)
                    await check(p, f'{tag} {"統計" if v == "stats" else "系統設定"}')
                    await p.screenshot(path=f'{SHOTS}/m_{vw}_{v}.png')
                    await p.click('#backbtn'); await p.wait_for_timeout(500)
                else: ok(f'{tag} Boss 看得到「{v}」入口', False)
            ok(f'{tag} 沒有頁面錯誤', not p.errs, p.errs)
            await p.context.close()
        await b.close()
    print(f'\n{sum(R)}/{len(R)} PASS')
    sys.exit(0 if all(R) else 1)
asyncio.run(main())
