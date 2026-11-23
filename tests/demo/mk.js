// 用法：node mk.js <程式庫根目錄> <輸出的網站資料夾> <seed.json>
const fs = require('fs'), path = require('path');
const [ROOT, SITE, SEED] = process.argv.slice(2);
fs.writeFileSync(path.join(SITE, 'code.js'), 'window.CODE_SRC=' + JSON.stringify(fs.readFileSync(path.join(ROOT, 'backend', 'Code.gs'), 'utf8')) + ';');
fs.writeFileSync(path.join(SITE, 'data.js'), 'window.SEED=' + fs.readFileSync(SEED, 'utf8') + ';window.LOGO_B64=' + JSON.stringify(fs.readFileSync(path.join(ROOT, 'icons', 'logo.png')).toString('base64')) + ';');
const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8')); m.name = '浩森工作｜試玩版'; m.short_name = '浩森試玩';
fs.writeFileSync(path.join(SITE, 'manifest.webmanifest'), JSON.stringify(m, null, 2));
