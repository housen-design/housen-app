#!/bin/bash
# 產生試玩版網站：前端用同一份 index.html，後端用同一份 Code.gs（在瀏覽器裡跑，假資料）
# 用法：bash tests/demo/build.sh [輸出資料夾，預設 tests/out/demo-site]
set -e
D="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$D/../.." && pwd)"
SITE="${1:-$ROOT/tests/out/demo-site}"; SEED="$(dirname "$SITE")/demo-seed.json"
mkdir -p "$(dirname "$SITE")"
node "$D/seed.js" "$ROOT/backend/Code.gs" "$SEED"
rm -rf "$SITE" && mkdir -p "$SITE/icons" && cp "$ROOT"/icons/* "$SITE/icons/" && cp "$D"/engine.js "$D"/demo.js "$D"/html2canvas.min.js "$D"/jspdf.umd.min.js "$SITE/"
node "$D/mk.js" "$ROOT" "$SITE" "$SEED"
python3 - "$ROOT" "$SITE" <<'PY'
import sys
root,site=sys.argv[1],sys.argv[2]
s=open(root+'/index.html',encoding='utf-8').read()
a='<script src="config.js"></script>'
assert s.count(a)==1
s=s.replace(a,"<script>window.CONFIG={API_URL:'demo',CLIENT_ID:''};</script>\n<script src=\"engine.js\"></script>\n<script src=\"code.js\"></script>\n<script src=\"data.js\"></script>\n<script src=\"html2canvas.min.js\"></script>\n<script src=\"jspdf.umd.min.js\"></script>\n<script src=\"demo.js\"></script>")
s=s.replace('<script src="https://accounts.google.com/gsi/client" async defer></script>\n','')
s=s.replace('<title>','<title>試玩｜',1)
open(site+'/index.html','w',encoding='utf-8').write(s)
PY
echo "demo site: $SITE"
