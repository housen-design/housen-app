# 測試說明（全部使用隔離假資料，不連正式試算表或任何 Google 服務）

在程式庫根目錄執行：

```
python3 tests/run_all.py            # 全部
python3 tests/run_all.py blockers   # 只跑名稱含 blockers 的組
```

需要 Node.js 18+、Python 3.9+、`pip install playwright && python3 -m playwright install chromium`。
總入口會自己開假資料後端（每組重開一次，資料回到初始）、靜態網站與試玩版，跑完列出每組通過數；任一組失敗，結束代碼非 0。
產生的東西都放在 `tests/out/`（不進版本控制）：截圖 `shots/`、試玩版 `demo-site/`、測試站 `serve/`、總表 `summary.json`。

- `harness.js`：在記憶體裡模擬 Google 試算表、雲端硬碟，跑真正的 `backend/Code.gs`。
- `server.js <port> <Code.gs> [--preview]`：假資料後端。`--preview` 只在測試副本打開「Boss 切換身分」（正式後端固定關閉）。
  測試用開關：`/delay?action=case&id=C1&ms=2500`（讓某個請求晚回來）、`/fcreate?on`（模擬建檔失敗）。
- `demo/build.sh`：用同一份前端與後端產生試玩版。
- `build_testsite.sh <輸出資料夾> <測試後端網址>`：產生手機測試網站（試玩版＋Google 測試環境版）。
- `google-env/`：`make_testenv.js` 由同一份 `Code.gs` 產生 Google 獨立測試環境的程式；`sim_isolation.js`、`sim_setup.js` 用模擬的 Google 服務驗證隔離、建立流程與實測函式。
