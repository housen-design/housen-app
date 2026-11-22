#!/bin/bash
# 產生試玩版網站到 site/：前端用 feature/full 的 index.html，後端用同一份 Code.gs
set -e
APP=/home/claude/housen-app
cd /home/claude/demo
node seed.js $APP/backend/Code.gs seed.json
rm -rf site && mkdir -p site/icons && cp $APP/icons/* site/icons/ && cp engine.js demo.js html2canvas.min.js jspdf.umd.min.js site/
node mk.js
python3 - <<'PY'
s=open('/home/claude/housen-app/index.html',encoding='utf-8').read()
a='<script src="config.js"></script>'
assert s.count(a)==1
s=s.replace(a,"<script>window.CONFIG={API_URL:'demo',CLIENT_ID:''};</script>\n<script src=\"engine.js\"></script>\n<script src=\"code.js\"></script>\n<script src=\"data.js\"></script>\n<script src=\"html2canvas.min.js\"></script>\n<script src=\"jspdf.umd.min.js\"></script>\n<script src=\"demo.js\"></script>")
s=s.replace('<script src="https://accounts.google.com/gsi/client" async defer></script>\n','')
s=s.replace('<title>','<title>試玩｜',1)
open('site/index.html','w',encoding='utf-8').write(s)
PY
ls -la site
