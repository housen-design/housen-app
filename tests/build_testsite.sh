#!/bin/bash
# 產生「手機測試網站」（放在 housen-test 程式庫，與正式網站分開）
#   demo/   假資料試玩：不用登入、可選身分、PDF 在手機上轉檔
#   google/ Google 測試環境：用公司帳號登入，連到獨立的測試後端（假資料），PDF 由 Google 產生
set -e
APP=/home/claude/housen-app; OUT=${1:-/home/claude/housen-test}; TEST_API=${2:-}
mkdir -p $OUT
# demo
rm -rf $OUT/demo && cp -r /home/claude/demo/site $OUT/demo
python3 - "$OUT" <<'PY'
import sys,re
out=sys.argv[1]
p=out+'/demo/index.html'; s=open(p,encoding='utf-8').read(); s=s.replace("'housen_","'housendemo_"); open(p,'w',encoding='utf-8').write(s)
p=out+'/demo/demo.js'; s=open(p,encoding='utf-8').read(); s=s.replace("'housen_","'housendemo_"); open(p,'w',encoding='utf-8').write(s)
PY
# google
rm -rf $OUT/google && mkdir -p $OUT/google/icons && cp $APP/icons/* $OUT/google/icons/ && cp $APP/sw.js $APP/manifest.webmanifest $OUT/google/
python3 - "$OUT" "$TEST_API" <<'PY'
import sys,json
out,api=sys.argv[1],sys.argv[2]
s=open('/home/claude/housen-app/index.html',encoding='utf-8').read()
s=s.replace("'housen_","'housentest_").replace('<title>','<title>測試環境｜',1)
bar='<div style="background:#b0742f;color:#fff;font-size:12px;text-align:center;padding:calc(4px + env(safe-area-inset-top)) 8px 4px">Google 測試環境・假資料（與正式系統分開）</div>'
s=s.replace('<body>','<body>'+bar,1)
open(out+'/google/index.html','w',encoding='utf-8').write(s)
open(out+'/google/config.js','w',encoding='utf-8').write("// 測試環境：連到獨立的測試後端（假資料），不是正式系統\nwindow.CONFIG = {\n  API_URL: '%s',\n  CLIENT_ID: '473235039295-dnrf8007tmjrnt93m09e4qli00qa473l.apps.googleusercontent.com'\n};\n" % (api or 'TEST_API_NOT_SET'))
m=json.load(open(out+'/google/manifest.webmanifest',encoding='utf-8')); m['name']='浩森工作｜測試環境'; m['short_name']='浩森測試'
json.dump(m,open(out+'/google/manifest.webmanifest','w',encoding='utf-8'),ensure_ascii=False,indent=2)
PY
grep -c "<body>" $OUT/google/index.html >/dev/null || true
cp $APP/tests/testsite_index.html $OUT/index.html
echo "built $OUT"
