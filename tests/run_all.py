#!/usr/bin/env python3
"""全部自動測試的總入口（在程式庫根目錄執行）：

    python3 tests/run_all.py            # 全部
    python3 tests/run_all.py blockers   # 只跑名稱含 blockers 的組

需要：Node.js 18+、Python 3.9+、playwright（pip install playwright && python3 -m playwright install chromium）。
全部使用假資料，不連任何 Google 服務或正式試算表。任一組失敗，結束代碼非 0，最後列出每組通過數。
"""
import os, sys, re, subprocess, time, socket, shutil, json

TESTS = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(TESTS)
OUT = os.path.join(TESTS, 'out'); os.makedirs(os.path.join(OUT, 'shots'), exist_ok=True)
BACKEND = os.path.join(ROOT, 'backend', 'Code.gs')
ENV = dict(os.environ, HOUSEN_OUT=OUT, HOUSEN_WEB='9002', HOUSEN_API='9102', HOUSEN_DEMO='9300', HOUSEN_SITE='9400')
ONLY = sys.argv[1:]

def port_ok(p):
    with socket.socket() as s: return s.connect_ex(('127.0.0.1', int(p))) == 0
def wait_port(p, t=10):
    t0 = time.time()
    while time.time() - t0 < t:
        if port_ok(p): return True
        time.sleep(0.1)
    return False
procs = []
def serve_static(folder, port):
    if port_ok(port): raise SystemExit(f'連接埠 {port} 已被占用，請先關掉占用的程式')
    pr = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=folder, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    procs.append(pr); wait_port(port); return pr
def start_api(preview=False):
    args = ['node', os.path.join(TESTS, 'server.js'), ENV['HOUSEN_API'], BACKEND] + (['--preview'] if preview else [])
    pr = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not wait_port(ENV['HOUSEN_API']): raise SystemExit('假資料後端沒有啟動')
    return pr
def stop(pr):
    pr.terminate()
    try: pr.wait(5)
    except Exception: pr.kill()
    t0 = time.time()
    while port_ok(ENV['HOUSEN_API']) and time.time() - t0 < 5: time.sleep(0.1)

results = []
def record(group, name, out, code):
    m = re.findall(r'(\d+)/(\d+) PASS', out)
    p, n = (int(m[-1][0]), int(m[-1][1])) if m else (0, 0)
    good = code == 0 and n > 0 and p == n
    results.append((group, name, p, n, good))
    print(f"  {'通過' if good else '失敗'}  {name}  {p}/{n}" + ('' if good else f'  (結束代碼 {code})'), flush=True)
    if not good:
        tail = '\n'.join(l for l in out.splitlines() if l.startswith('FAIL') or 'Error' in l or 'Traceback' in l)[:2000] or out[-1500:]
        print('    ' + tail.replace('\n', '\n    '), flush=True)
def run(group, name, cmd, timeout=900):
    if ONLY and not any(o in name or o in group for o in ONLY): return
    try:
        r = subprocess.run(cmd, cwd=ROOT, env=ENV, capture_output=True, text=True, timeout=timeout)
        record(group, name, r.stdout + r.stderr, r.returncode)
    except subprocess.TimeoutExpired as e:
        record(group, name, (e.stdout or b'').decode('utf8', 'ignore') if isinstance(e.stdout, bytes) else (e.stdout or ''), 'timeout')
def want(group, names): return not ONLY or any(o in group or any(o in n for n in names) for o in ONLY)

# ---------- 0. 環境檢查 ----------
missing = [x for x in ['node'] if not shutil.which(x)]
try: import playwright  # noqa
except Exception: missing.append('python playwright（pip install playwright && python3 -m playwright install chromium）')
if missing: raise SystemExit('缺少：' + '、'.join(missing))

try:
    # ---------- 1. 後端（真正的 Code.gs ＋ 模擬 Google 服務） ----------
    print('【後端】', flush=True)
    for t in ['cgpt.js', 'mergetest.js', 'blockers.js']:
        run('後端', t[:-3], ['node', os.path.join(TESTS, t), BACKEND])

    # ---------- 2. 畫面（Playwright 模擬手機 ＋ 假資料後端，每組重開一次，資料回到初始） ----------
    UI = ['regress', 'casetest', 'progtest', 'prog2test', 'ovtest', 'clienttest', 'docstest', 'misstest', 'm5atest', 'm5btest',
          'fixtest', 'racetest', 'signtest', 'closetest', 'schedtest', 'speedtest', 'mobiletest']
    PREVIEW = {'casetest', 'progtest', 'ovtest', 'clienttest'}   # 這幾組會用「Boss 切換身分」：只在測試副本打開
    if want('畫面', UI):
        print('【畫面】', flush=True)
        serve_static(ROOT, ENV['HOUSEN_WEB'])
        for t in UI:
            if ONLY and not any(o in t or o == '畫面' for o in ONLY): continue
            api = start_api(t in PREVIEW)
            try: run('畫面', t, [sys.executable, os.path.join(TESTS, t + '.py')])
            finally: stop(api)

    # ---------- 3. 試玩版（瀏覽器裡跑同一份 Code.gs） ----------
    DEMO = ['focustest', 'focustest2', 'pdftest', 'sitetest']
    if want('試玩版', DEMO):
        print('【試玩版】', flush=True)
        site = os.path.join(OUT, 'serve', 'housen-test')
        r = subprocess.run(['bash', os.path.join(TESTS, 'build_testsite.sh'), site, 'https://script.google.com/TEST_ONLY'], cwd=ROOT, capture_output=True, text=True)
        if r.returncode: raise SystemExit('試玩版產生失敗：\n' + r.stdout + r.stderr)
        serve_static(os.path.join(OUT, 'demo-site'), ENV['HOUSEN_DEMO'])
        serve_static(os.path.join(OUT, 'serve'), ENV['HOUSEN_SITE'])
        for t in DEMO: run('試玩版', t, [sys.executable, os.path.join(TESTS, t + '.py')])

    # ---------- 4. Google 測試環境的產生器與隔離（模擬 Google，drive.file 行為也模擬） ----------
    GE = os.path.join(TESTS, 'google-env')
    if want('Google 測試環境', ['sim_isolation', 'sim_setup']):
        print('【Google 測試環境（模擬）】', flush=True)
        r = subprocess.run(['node', os.path.join(GE, 'make_testenv.js'), BACKEND, os.path.join(OUT, 'demo-seed.json'), os.path.join(GE, 'out')], cwd=ROOT, capture_output=True, text=True)
        if r.returncode: raise SystemExit('產生測試環境程式失敗：\n' + r.stdout + r.stderr)
        for t in ['sim_isolation', 'sim_setup']: run('Google 測試環境', t, ['node', os.path.join(GE, t + '.js')])
finally:
    for pr in procs:
        try: pr.terminate()
        except Exception: pass

# ---------- 總表 ----------
print('\n================ 測試總表 ================')
for g, n, p, t, good in results: print(f"{'✔' if good else '✘'} {g:<14} {n:<14} {p:>4}/{t:<4}")
tp, tn = sum(r[2] for r in results), sum(r[3] for r in results)
bad = [r for r in results if not r[4]]
print(f'共 {len(results)} 組，{tp}/{tn} 項通過；失敗 {len(bad)} 組')
json.dump([dict(group=g, name=n, passed=p, total=t, ok=good) for g, n, p, t, good in results], open(os.path.join(OUT, 'summary.json'), 'w'), ensure_ascii=False, indent=1)
sys.exit(1 if bad or not results else 0)
