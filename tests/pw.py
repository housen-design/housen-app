import os
TESTS = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(TESTS)
OUT = os.environ.get('HOUSEN_OUT', os.path.join(TESTS, 'out')); SHOTS = os.path.join(OUT, 'shots'); os.makedirs(SHOTS, exist_ok=True)
W = os.environ.get('HOUSEN_WEB', '9002'); A = os.environ.get('HOUSEN_API', '9102')
DEMO = os.environ.get('HOUSEN_DEMO', '9300'); SITE = os.environ.get('HOUSEN_SITE', '9400')
import asyncio, json, urllib.request
from playwright.async_api import async_playwright
def api(port, path): return urllib.request.urlopen(f'http://localhost:{port}{path}').read().decode()
async def open_app(b, web, apiport, email, vw=390, vh=844, tip=True, gis_ok=True, sw=False, touch=True):
    c = await b.new_context(viewport={'width':vw,'height':vh}, device_scale_factor=2, has_touch=touch, is_mobile=touch and vw<700, service_workers='allow' if sw else 'block')
    init = ""
    if email: init += f"localStorage.setItem('housen_token','{email}');"
    if not tip: init += "localStorage.setItem('housen_tip','1');"
    await c.add_init_script(init)
    await c.route('**/config.js', lambda r: r.fulfill(body=f"window.CONFIG={{API_URL:'http://localhost:{apiport}',CLIENT_ID:'x'}};", content_type='application/javascript'))
    if gis_ok:
        await c.route('**/accounts.google.com/**', lambda r: r.fulfill(body="window.google={accounts:{id:{initialize(){},renderButton(el){el.innerHTML='<div style=\"width:260px;height:44px;border-radius:22px;background:#202124;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;margin:0 auto\">G 使用 Google 帳戶登入</div>'},disableAutoSelect(){}}}};", content_type='application/javascript'))
    else:
        await c.route('**/accounts.google.com/**', lambda r: r.abort())
    await c.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    p = await c.new_page()
    p.errs = []
    p.on('pageerror', lambda e: p.errs.append(str(e)))
    p.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await p.goto(f'http://localhost:{web}/index.html'); await p.wait_for_timeout(900)
    return p
PULL = """async () => { const t = (type, y) => { const touch = new Touch({identifier: 1, target: document.body, clientX: 100, clientY: y}); window.dispatchEvent(new TouchEvent(type, {touches: type==='touchend'?[]:[touch], changedTouches:[touch], bubbles:true})); };
 window.scrollTo(0,0); t('touchstart', 100); t('touchmove', 220); t('touchend', 220); }"""
