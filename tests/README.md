# 測試說明（全部使用隔離假資料，不連正式試算表）

## 後端（不用瀏覽器）
```
cp tests/* /tmp/qa/   # 測試程式預設放在 /tmp/qa
node /tmp/qa/cgpt.js backend/Code.gs       # 外部檢查 10 項（23 項）
node /tmp/qa/mergetest.js backend/Code.gs  # 兩人同時編輯：逐欄合併（8 項）
```
`harness.js` 在記憶體裡模擬 Google 試算表、雲端硬碟，跑的是真正的 `backend/Code.gs`。

## 畫面（Playwright 模擬手機）
```
python3 -m http.server 9002          # 在專案資料夾，提供前端
node /tmp/qa/server.js 9102 backend/Code.gs   # 假資料後端；每組測試前重開一次，資料回到初始
python3 /tmp/qa/racetest.py   # 切換案件 A/B，A 晚回來不能串到 B（7 項）
python3 /tmp/qa/signtest.py   # 簽核與 PDF 狀態分開、失敗重試、會議逐欄合併（12 項）
```
其他：regress、casetest、progtest、prog2test、ovtest、clienttest、docstest、misstest、m5atest、m5btest、fixtest、speedtest。
`server.js` 測試用開關：`/delay?action=case&id=C1&ms=2500`（讓某個請求晚回來）、`/fcreate?on`（模擬建檔失敗）。

## 試玩版
`tests/demo/build.sh` 用真正的前端與後端程式產生試玩版（假資料在瀏覽器裡跑）。
